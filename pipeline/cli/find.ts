// Usage: npm run dataset:find -- "<text>" [--limit N]
// Local maintainer tool: lists employer names in the latest cached LCA, PERM and LMIA files whose normalised
// name contains the text, with FEIN and state (US) or province and streams (Canada). Never part of the build
// or the published output. It reads only the columns needed for this table.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readRows } from "../load/rows";
import { normalizeName } from "../normalize/names";
import { caProvinceCode, parseCaAddress } from "../normalize/places";
import { lcaStatus, permStatus } from "../normalize/us";
import { EXPECTED_COLUMNS, type SourceFile } from "../sources";

const CACHE = ".cache/dataset";
export const DEFAULT_LIMIT = 50;

const US_COLUMNS = {
  lca: { name: "EMPLOYER_NAME", fein: "EMPLOYER_FEIN", state: "EMPLOYER_STATE", status: "CASE_STATUS" },
  perm: { name: "EMP_BUSINESS_NAME", fein: "EMP_FEIN", state: "EMP_STATE", status: "CASE_STATUS" },
} as const;
const CA_COLUMNS = ["Employer", "Address", "Province/Territory", "Program Stream", "Approved Positions"];

export type UsRow = { name: string; fein: string; state: string; certified: number };
export type CaRow = { name: string; province: string; positions: number; streams: Record<string, number> };

type Raw = Record<string, string | undefined>;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Distinct (name, FEIN, state) rows whose normalised name contains `normText`, with certified counts. */
export function aggregateUs(rows: Iterable<Raw>, program: "lca" | "perm", normText: string): UsRow[] {
  const c = US_COLUMNS[program];
  const parse = program === "lca" ? lcaStatus : permStatus;
  const out = new Map<string, UsRow>();
  for (const r of rows) {
    const name = (r[c.name] ?? "").trim();
    if (!name || !normalizeName(name).includes(normText)) continue;
    const digits = (r[c.fein] ?? "").replace(/\D/g, "");
    const fein = digits.length === 9 ? digits : "";
    const state = (r[c.state] ?? "").trim();
    const key = `${name}\u0000${fein}\u0000${state}`;
    const row = out.get(key) ?? { name, fein, state, certified: 0 };
    if (parse(r[c.status] ?? "") === "certified") row.certified++;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => b.certified - a.certified || byName(a.name, b.name));
}

/** Distinct (employer, province) rows with approved positions in total and per program stream. */
export function aggregateCa(rows: Iterable<Raw>, text: string): CaRow[] {
  const normText = normalizeName(text);
  const out = new Map<string, CaRow>();
  for (const r of rows) {
    const name = (r.Employer ?? "").trim();
    if (!name || !normalizeName(name).includes(normText)) continue;
    const province = parseCaAddress(r.Address ?? "").province ?? caProvinceCode(r["Province/Territory"] ?? "") ?? "";
    const n = Number((r["Approved Positions"] ?? "").replace(/,/g, ""));
    const positions = Number.isFinite(n) ? n : 0;
    const stream = (r["Program Stream"] ?? "").trim() || "Unknown";
    const key = `${name}\u0000${province}`;
    const row = out.get(key) ?? { name, province, positions: 0, streams: {} };
    row.positions += positions;
    row.streams[stream] = (row.streams[stream] ?? 0) + positions;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => b.positions - a.positions || byName(a.name, b.name));
}

function table(header: string[], body: string[][]): string {
  const all = [header, ...body];
  const widths = header.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd()).join("\n");
}

export function formatUsTable(rows: UsRow[], limit: number): string {
  return table(
    ["Employer", "FEIN", "State", "Certified"],
    rows.slice(0, limit).map((r) => [r.name, r.fein, r.state, String(r.certified)]),
  );
}

export function formatCaTable(rows: CaRow[], limit: number): string {
  const shown = rows.slice(0, limit);
  const streams = [...new Set(shown.flatMap((r) => Object.keys(r.streams)))].sort(byName);
  return table(
    ["Employer", "Province", "Positions", ...streams],
    shown.map((r) => [r.name, r.province, String(r.positions), ...streams.map((s) => String(r.streams[s] ?? 0))]),
  );
}

/** Files of the highest year (and, for `lastQuarterOnly`, its highest quarter) of one source. */
function latest(manifest: SourceFile[], source: SourceFile["source"], lastQuarterOnly: boolean): string[] {
  const list = manifest.filter((m) => m.source === source && m.year !== undefined && m.quarter !== undefined);
  if (list.length === 0) return [];
  const year = Math.max(...list.map((m) => m.year!));
  const inYear = list.filter((m) => m.year === year).sort((a, b) => a.quarter! - b.quarter!);
  return (lastQuarterOnly ? inYear.slice(-1) : inYear).map((m) => m.path);
}

export function parseArgs(argv: string[]): { text: string; limit: number } {
  let limit = DEFAULT_LIMIT;
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      limit = Number(argv[++i]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit needs a positive integer");
    } else words.push(argv[i]);
  }
  return { text: words.join(" "), limit };
}

/** Streams the files and keeps only rows whose name column matches, so memory stays small. */
async function matching(files: string[], columns: string[], nameCol: string, normText: string): Promise<Raw[]> {
  const kept: Raw[] = [];
  for (const f of files) {
    for await (const r of readRows(path.join(CACHE, f), columns)) {
      if (normalizeName(r[nameCol] ?? "").includes(normText)) kept.push(r);
    }
  }
  return kept;
}

async function main() {
  const { text, limit } = parseArgs(process.argv.slice(2));
  const normText = normalizeName(text);
  if (!normText) throw new Error('usage: npm run dataset:find -- "<text>" [--limit N]');
  const manifest = JSON.parse(await readFile(path.join(CACHE, "manifest.json"), "utf8")) as SourceFile[];

  for (const program of ["lca", "perm"] as const) {
    const files = latest(manifest, program, program === "perm");
    console.log(`\n${program.toUpperCase()} (${files.join(", ") || "no cached file"})`);
    if (files.length === 0) continue;
    const c = US_COLUMNS[program];
    const cols = EXPECTED_COLUMNS[program].filter((x) => ([c.name, c.fein, c.state, c.status] as string[]).includes(x));
    const rows = aggregateUs(await matching(files, cols, c.name, normText), program, normText);
    console.log(formatUsTable(rows, limit));
  }

  const lmia = latest(manifest, "lmia", false);
  console.log(`\nLMIA (${lmia.join(", ") || "no cached file"})`);
  if (lmia.length > 0) {
    const cols = EXPECTED_COLUMNS.lmia.filter((x) => CA_COLUMNS.includes(x));
    console.log(formatCaTable(aggregateCa(await matching(lmia, cols, "Employer", normText), text), limit));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
