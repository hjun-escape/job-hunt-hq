// Usage: npm run dataset:download -- [--only lca,perm,lmia,cbsa,gaf] [--cache .cache/dataset]
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { politeFetch } from "../http";
import {
  CBSA_DELINEATION_URL,
  LMIA_PACKAGE_API,
  STATCAN_GAF_URL,
  currentFiscalYear,
  latestQuarterFiles,
  lcaUrl,
  permUrl,
  selectYears,
  type SourceFile,
} from "../sources";

type Source = SourceFile["source"];
const ALL_SOURCES: Source[] = ["lca", "perm", "lmia", "cbsa", "gaf"];

// ---- pure logic (tested offline) ----

/** Fiscal years from the current one back 5 years, quarter 4 down to 1. */
export function probePlan(today: Date): { year: number; quarter: number }[] {
  const fy = currentFiscalYear(today);
  const out: { year: number; quarter: number }[] = [];
  for (let y = fy; y > fy - 5; y--) for (let q = 4; q >= 1; q--) out.push({ year: y, quarter: q });
  return out;
}

export function maxQuarterMap(found: { year: number; quarter: number }[]): Record<number, 0 | 1 | 2 | 3 | 4> {
  const map: Record<number, 0 | 1 | 2 | 3 | 4> = {};
  for (const f of found) {
    if (f.quarter > (map[f.year] ?? 0)) map[f.year] = f.quarter as 1 | 2 | 3 | 4;
  }
  return map;
}

/** Year and quarter from a name or URL: 2026q2, 2026_Q2, Q2 2026, q2-2026. */
export function parseLmiaResource(text: string): { year: number; quarter: number } | null {
  const a = /(20\d{2})[\s_-]?q([1-4])/i.exec(text);
  if (a) return { year: Number(a[1]), quarter: Number(a[2]) };
  const b = /q([1-4])[\s_-]?(20\d{2})/i.exec(text);
  if (b) return { year: Number(b[2]), quarter: Number(b[1]) };
  return null;
}

export type CkanResource = { name?: string; url?: string; format?: string; language?: string[] | string };
export type LmiaResource = { year: number; quarter: number; url: string };

/** Keep English XLSX or CSV resources with a recognisable year and quarter. */
export function selectLmiaResources(resources: CkanResource[]): LmiaResource[] {
  const kept: LmiaResource[] = [];
  for (const r of resources) {
    if (!r.url) continue;
    const format = (r.format ?? path.extname(r.url).slice(1)).toLowerCase();
    if (format !== "xlsx" && format !== "csv") continue;
    const langs = Array.isArray(r.language) ? r.language : r.language ? [r.language] : [];
    const label = `${r.name ?? ""} ${r.url}`;
    if (langs.length > 0 ? !langs.includes("en") : /(^|[\s_./-])fr([\s_./-]|$)/i.test(label)) continue;
    const yq = parseLmiaResource(r.name ?? "") ?? parseLmiaResource(r.url);
    if (!yq) continue;
    kept.push({ ...yq, url: r.url });
  }
  return kept;
}

/** LMIA quarterly files are per quarter, so every quarter of the selected calendar years is downloaded. */
export function planLmiaDownloads<T extends { year: number; quarter: number }>(kept: T[]): T[] {
  const sel = selectYears(maxQuarterMap(kept));
  const years = new Set([...sel.complete, ...(sel.partial ? [sel.partial.year] : [])]);
  return kept
    .filter((r) => years.has(r.year) && (r.year !== sel.partial?.year || r.quarter <= sel.partial.through))
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

export function isManifestFresh(entry: Pick<SourceFile, "sha256"> | undefined, diskSha256: string): boolean {
  return !!entry && entry.sha256 === diskSha256;
}

// ---- network and disk ----

type Target = Omit<SourceFile, "sha256" | "bytes" | "fetchedAt">;

async function probeFiscalFiles(
  kind: "lca" | "perm",
  build: (fy: number, q: number) => string,
  today: Date,
): Promise<Target[]> {
  const found: { year: number; quarter: number }[] = [];
  const have = new Set<number>();
  // Quarters run 4 down to 1 per year, so the first hit in a year is its latest quarter.
  for (const { year, quarter } of probePlan(today)) {
    if (have.has(year)) continue;
    const res = await politeFetch(build(year, quarter), { method: "HEAD" });
    if (res.ok) {
      found.push({ year, quarter });
      have.add(year);
    }
  }
  const sel = selectYears(maxQuarterMap(found));
  const years = new Set([...sel.complete, ...(sel.partial ? [sel.partial.year] : [])]);
  return latestQuarterFiles(found)
    .filter((f) => years.has(f.year))
    .map((f) => ({
      source: kind,
      year: f.year,
      quarter: f.quarter,
      url: build(f.year, f.quarter),
      path: `${kind}/${kind}_fy${f.year}_q${f.quarter}.xlsx`,
    }));
}

async function lmiaTargets(): Promise<Target[]> {
  const res = await politeFetch(LMIA_PACKAGE_API);
  if (!res.ok) throw new Error(`LMIA package_show failed: ${res.status}`);
  const body = (await res.json()) as { result?: { resources?: CkanResource[] } };
  const kept = selectLmiaResources(body.result?.resources ?? []);
  return planLmiaDownloads(kept).map((r) => ({
    source: "lmia" as const,
    year: r.year,
    quarter: r.quarter,
    url: r.url,
    path: `lmia/lmia_${r.year}q${r.quarter}${path.extname(new URL(r.url).pathname) || ".xlsx"}`,
  }));
}

async function sha256Of(file: string): Promise<string | null> {
  try {
    await stat(file);
  } catch {
    return null;
  }
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function readManifest(file: string): Promise<SourceFile[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as SourceFile[];
  } catch {
    return [];
  }
}

async function fetchToFile(url: string, dest: string): Promise<{ sha256: string; bytes: number }> {
  const res = await politeFetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url} failed: ${res.status}`);
  await mkdir(path.dirname(dest), { recursive: true });
  const hash = createHash("sha256");
  let bytes = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as never), tap, createWriteStream(tmp));
  await rename(tmp, dest);
  return { sha256: hash.digest("hex"), bytes };
}

export function parseArgs(argv: string[]): { only: Source[]; cache: string } {
  let only = ALL_SOURCES;
  let cache = ".cache/dataset";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      only = (argv[++i] ?? "").split(",").filter(Boolean) as Source[];
      const bad = only.filter((s) => !ALL_SOURCES.includes(s));
      if (bad.length || only.length === 0) throw new Error(`unknown source: ${bad.join(",") || "(none)"}`);
    } else if (argv[i] === "--cache") cache = argv[++i];
  }
  return { only, cache };
}

async function main() {
  const { only, cache } = parseArgs(process.argv.slice(2));
  const today = new Date();
  const targets: Target[] = [];
  if (only.includes("lca")) targets.push(...(await probeFiscalFiles("lca", lcaUrl, today)));
  if (only.includes("perm")) targets.push(...(await probeFiscalFiles("perm", permUrl, today)));
  if (only.includes("lmia")) targets.push(...(await lmiaTargets()));
  if (only.includes("cbsa")) targets.push({ source: "cbsa", url: CBSA_DELINEATION_URL, path: "cbsa/list1_2023.xlsx" });
  if (only.includes("gaf")) targets.push({ source: "gaf", url: STATCAN_GAF_URL, path: "gaf/2021_92-151_X.zip" });

  const manifestPath = path.join(cache, "manifest.json");
  const manifest = await readManifest(manifestPath);
  for (const t of targets) {
    const dest = path.join(cache, t.path);
    const existing = manifest.find((m) => m.path === t.path && m.url === t.url);
    const onDisk = await sha256Of(dest);
    if (onDisk && isManifestFresh(existing, onDisk)) {
      console.log(`skip ${t.path} (unchanged)`);
      continue;
    }
    console.log(`download ${t.url}`);
    const { sha256, bytes } = await fetchToFile(t.url, dest);
    const entry: SourceFile = { ...t, sha256, bytes, fetchedAt: new Date().toISOString() };
    const i = manifest.findIndex((m) => m.path === t.path);
    if (i >= 0) manifest[i] = entry;
    else manifest.push(entry);
    await mkdir(cache, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
  await mkdir(cache, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest: ${manifestPath}`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
