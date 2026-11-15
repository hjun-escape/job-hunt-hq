// Usage: npm run dataset:reference
// Generates data/reference/us-counties-cbsa.csv and data/reference/ca-csd-cma.csv from the cached CBSA
// delineation workbook and the StatCan 2021 geographic attribute file (a zip downloaded by hand and recorded
// in the manifest as "gaf"). The CSVs are committed; the weekly build never downloads either source.
// The zip is extracted into its own directory under the cache and its contents are treated as untrusted
// data: only a few geographic name columns are read, by path.
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { readRows } from "../load/rows";
import {
  CA_REFERENCE_FILE,
  US_REFERENCE_FILE,
  caProvinceCode,
  usStateCode,
  type CaCsdRow,
  type UsCountyRow,
} from "../normalize/places";

const CACHE = ".cache/dataset";
const OUT_DIR = "data/reference";

type ManifestEntry = { source: string; path: string };

async function cachedPath(source: string): Promise<string> {
  const manifest = JSON.parse(await readFile(path.join(CACHE, "manifest.json"), "utf8")) as ManifestEntry[];
  const entry = manifest.find((e) => e.source === source);
  if (!entry) throw new Error(`no "${source}" entry in the manifest: download it first`);
  return path.join(CACHE, entry.path);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export async function readUsCounties(file: string): Promise<UsCountyRow[]> {
  const seen = new Set<string>();
  const out: UsCountyRow[] = [];
  const cols = ["CBSA Code", "CBSA Title", "Metropolitan/Micropolitan Statistical Area", "County/County Equivalent", "State Name"];
  for await (const r of readRows(file, cols)) {
    if (r["Metropolitan/Micropolitan Statistical Area"] !== "Metropolitan Statistical Area") continue;
    const state = usStateCode(r["State Name"]);
    if (!state) throw new Error(`unknown state name in the CBSA file: ${r["State Name"]}`);
    const row = { state, county: r["County/County Equivalent"], cbsa: r["CBSA Code"], title: r["CBSA Title"] };
    const key = `${row.state}|${row.county}|${row.cbsa}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => cmp(a.state, b.state) || cmp(a.county, b.county) || cmp(a.cbsa, b.cbsa));
}

/** Copies src to dst as UTF-8. Returns the source encoding: "utf-8" if it decodes strictly, else "windows-1252". */
export async function transcodeToUtf8(src: string, dst: string): Promise<"utf-8" | "windows-1252"> {
  let utf8 = true;
  try {
    const dec = new TextDecoder("utf-8", { fatal: true });
    for await (const chunk of createReadStream(src) as AsyncIterable<Buffer>) dec.decode(chunk, { stream: true });
    dec.decode();
  } catch {
    utf8 = false;
  }
  if (utf8) {
    await pipeline(createReadStream(src), createWriteStream(dst));
    return "utf-8";
  }
  const dec = new TextDecoder("windows-1252");
  async function* decoded() {
    for await (const chunk of createReadStream(src) as AsyncIterable<Buffer>) yield dec.decode(chunk, { stream: true });
  }
  await pipeline(decoded, createWriteStream(dst, { encoding: "utf8" }));
  return "windows-1252";
}

/** Extracts the zip into a fresh directory next to it and returns the path of its single CSV. */
async function extractGaf(zip: string): Promise<{ dir: string; csv: string }> {
  const dir = path.join(path.dirname(zip), "extracted");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const res = spawnSync("unzip", ["-o", "-q", zip, "-d", dir], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("unzip failed");
  const csvs = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (csvs.length !== 1) throw new Error(`expected one CSV in the attribute zip, found ${csvs.length}`);
  return { dir, csv: path.join(dir, csvs[0]) };
}

/** CSDs inside a census metropolitan area (CMATYPE "B"), one row per province, CSD name and CMA. */
export async function readCaCsds(file: string): Promise<CaCsdRow[]> {
  const seen = new Set<string>();
  const out: CaCsdRow[] = [];
  const cols = ["PRENAME_PRANOM", "CSDNAME_SDRNOM", "CMAUID_RMRIDU", "CMANAME_RMRNOM", "CMATYPE_RMRGENRE"];
  for await (const r of readRows(file, cols)) {
    if (r.CMATYPE_RMRGENRE !== "B" || !r.CMAUID_RMRIDU) continue;
    const province = caProvinceCode(r.PRENAME_PRANOM);
    if (!province) throw new Error(`unknown province name in the attribute file: ${r.PRENAME_PRANOM}`);
    const key = `${province}|${r.CSDNAME_SDRNOM}|${r.CMAUID_RMRIDU}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Cross-province CMAs are titled per part, e.g. "Ottawa - Gatineau (Ontario part / partie de l'Ontario)".
    const title = r.CMANAME_RMRNOM.replace(/\s*\([^()]*\bpart\b[^()]*\)\s*$/i, "");
    out.push({ province, csd: r.CSDNAME_SDRNOM, cma: r.CMAUID_RMRIDU, title });
  }
  return out.sort((a, b) => cmp(a.province, b.province) || cmp(a.csd, b.csd) || cmp(a.cma, b.cma));
}

/** Number of (province, CSD name) pairs that map to more than one CMA. */
export function countAmbiguousCsds(rows: CaCsdRow[]): number {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = `${r.province}|${r.csd}`;
    m.set(k, (m.get(k) ?? new Set()).add(r.cma));
  }
  return [...m.values()].filter((s) => s.size > 1).length;
}

async function main() {
  const us = await readUsCounties(await cachedPath("cbsa"));

  const { dir, csv } = await extractGaf(await cachedPath("gaf"));
  const utf8 = path.join(dir, "attributes.utf8.csv");
  const encoding = await transcodeToUtf8(csv, utf8);
  console.log(`attribute file encoding: ${encoding}`);
  let ca: CaCsdRow[];
  try {
    ca = await readCaCsds(utf8);
  } finally {
    await rm(utf8, { force: true });
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, US_REFERENCE_FILE),
    toCsv(["state", "county", "cbsa", "title"], us.map((r) => [r.state, r.county, r.cbsa, r.title])),
  );
  await writeFile(
    path.join(OUT_DIR, CA_REFERENCE_FILE),
    toCsv(["province", "csd", "cma", "title"], ca.map((r) => [r.province, r.csd, r.cma, r.title])),
  );
  console.log(`${US_REFERENCE_FILE}: ${us.length} county rows in ${new Set(us.map((r) => r.cbsa)).size} metros`);
  console.log(
    `${CA_REFERENCE_FILE}: ${ca.length} CSD rows in ${new Set(ca.map((r) => r.cma)).size} CMAs, ` +
      `${countAmbiguousCsds(ca)} CSD names map to more than one CMA`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
