// Usage: npm run dataset:download -- [--only lca,perm,lmia,cbsa,gaf,zcta] [--cache .cache/dataset]
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { politeFetch } from "../http";
import {
  CBSA_DELINEATION_URL,
  ZCTA_COUNTY_URL,
  LMIA_PACKAGE_API,
  STATCAN_GAF_PAGE_URL,
  currentFiscalYear,
  CUMULATIVE,
  FIRST_YEAR,
  contiguousQuarters,
  filesToRead,
  lcaUrlCandidates,
  permUrlCandidates,
  selectYears,
  type YearSelection,
  type SourceFile,
} from "../sources";

type Source = SourceFile["source"];
const ALL_SOURCES: Source[] = ["lca", "perm", "lmia", "cbsa", "gaf", "zcta"];

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
    const ext = path.extname(new URL(r.url).pathname).slice(1).toLowerCase();
    // CKAN labels some real .xlsx files "XLS", so the file extension counts too.
    const format = (r.format ?? ext).toLowerCase();
    const tabular = format === "xlsx" || format === "csv" || (format === "xls" && ext === "xlsx");
    if (!tabular) continue;
    const langs = Array.isArray(r.language) ? r.language : r.language ? [r.language] : [];
    const label = `${r.name ?? ""} ${r.url}`;
    if (langs.length > 0 ? !langs.includes("en") : /(^|[\s_./-])fr([\s_./-]|$)/i.test(label)) continue;
    const yq = parseLmiaResource(r.name ?? "") ?? parseLmiaResource(r.url);
    if (!yq) continue;
    kept.push({ ...yq, url: r.url });
  }
  return kept;
}

/** Year selection for a source: contiguous quarters per year for per-quarter files, the highest quarter for cumulative ones. */
export function selectionFor(
  source: "lca" | "perm" | "lmia",
  found: { year: number; quarter: number }[],
): YearSelection {
  if (CUMULATIVE[source]) return selectYears(maxQuarterMap(found), FIRST_YEAR[source]);
  const byYear = new Map<number, number[]>();
  for (const f of found) byYear.set(f.year, [...(byYear.get(f.year) ?? []), f.quarter]);
  const map: Record<number, 0 | 1 | 2 | 3 | 4> = {};
  for (const [y, qs] of byYear) map[y] = contiguousQuarters(qs);
  return selectYears(map, FIRST_YEAR[source]);
}

/** LMIA files hold one quarter each, so every quarter of the selected calendar years is downloaded. */
export function planLmiaDownloads<T extends { year: number; quarter: number }>(kept: T[]): T[] {
  return filesToRead("lmia", kept, selectionFor("lmia", kept));
}

export function isManifestFresh(entry: Pick<SourceFile, "sha256"> | undefined, diskSha256: string): boolean {
  return !!entry && entry.sha256 === diskSha256;
}

// ---- network and disk ----

export type Target = Omit<SourceFile, "sha256" | "bytes" | "fetchedAt">;

async function probeFiscalFiles(
  kind: "lca" | "perm",
  build: (fy: number, q: number) => string[],
  today: Date,
): Promise<Target[]> {
  const found: { year: number; quarter: number; url: string }[] = [];
  const have = new Set<number>();
  for (const { year, quarter } of probePlan(today)) {
    if (year < FIRST_YEAR[kind]) continue;
    // Cumulative files: quarters run 4 down to 1, so the first hit in a year is the latest. Per-quarter files need every quarter.
    if (CUMULATIVE[kind] && have.has(year)) continue;
    for (const url of build(year, quarter)) {
      const res = await politeFetch(url, { method: "HEAD" });
      if (res.ok) {
        found.push({ year, quarter, url });
        have.add(year);
        break;
      }
    }
  }
  return filesToRead(kind, found, selectionFor(kind, found)).map((f) => ({
    source: kind,
    year: f.year,
    quarter: f.quarter,
    url: f.url,
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

const MIN_BYTES = 1024;

/** Stream a url to disk with its sha256. Refuses HTML responses and bodies under 1 KB (a 200 error page). */
export async function fetchToFile(
  url: string,
  dest: string,
  fetchFn: (url: string) => Promise<Response> = politeFetch,
): Promise<{ sha256: string; bytes: number }> {
  const res = await fetchFn(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url} failed: ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (/text\/html/i.test(type)) throw new Error(`GET ${url} returned HTML (${type}), not a data file`);
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
  try {
    await pipeline(Readable.fromWeb(res.body as never), tap, createWriteStream(tmp));
    if (bytes < MIN_BYTES) throw new Error(`GET ${url} returned only ${bytes} bytes, expected a data file`);
    await rename(tmp, dest);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return { sha256: hash.digest("hex"), bytes };
}

export const DEFAULT_SOURCES: Source[] = ["lca", "perm", "lmia"];

export function parseArgs(argv: string[]): { only: Source[]; cache: string; gafFile?: string } {
  let only = DEFAULT_SOURCES;
  let cache = ".cache/dataset";
  let gafFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      only = (argv[++i] ?? "").split(",").filter(Boolean) as Source[];
      const bad = only.filter((s) => !ALL_SOURCES.includes(s));
      if (bad.length || only.length === 0) throw new Error(`unknown source: ${bad.join(",") || "(none)"}`);
    } else if (argv[i] === "--cache") cache = argv[++i];
    else if (argv[i] === "--gaf-file") gafFile = argv[++i];
  }
  if (gafFile && !only.includes("gaf")) only = [...only, "gaf"];
  return { only, cache, gafFile };
}

async function resolveTargets(source: Source): Promise<Target[]> {
  const today = new Date();
  switch (source) {
    case "lca":
      return probeFiscalFiles("lca", lcaUrlCandidates, today);
    case "perm":
      return probeFiscalFiles("perm", permUrlCandidates, today);
    case "lmia":
      return lmiaTargets();
    case "cbsa":
      return [{ source: "cbsa", url: CBSA_DELINEATION_URL, path: "cbsa/list1_2023.xlsx" }];
    case "zcta":
      return [{ source: "zcta", url: ZCTA_COUNTY_URL, path: "zcta/tab20_zcta520_county20_natl.txt" }];
    default:
      return [];
  }
}

export type RunOptions = {
  only: Source[];
  cache: string;
  gafFile?: string;
  resolve?: (source: Source) => Promise<Target[]>;
  fetchFile?: typeof fetchToFile;
  log?: (message: string) => void;
};

/** Download the selected sources into the cache and write the manifest. Returns the manifest. */
export async function runDownload(opts: RunOptions): Promise<SourceFile[]> {
  const { only, cache } = opts;
  const resolve = opts.resolve ?? resolveTargets;
  const fetchFile = opts.fetchFile ?? fetchToFile;
  const log = opts.log ?? console.log;
  const wantsGaf = only.includes("gaf");
  if (wantsGaf && !opts.gafFile) {
    throw new Error(
      `gaf has no automated download (StatCan refuses automated clients). Download the CSV version by hand from ${STATCAN_GAF_PAGE_URL} and pass it with --gaf-file <path>.`,
    );
  }

  // Resolve every source before touching the cache, so a source that yields nothing prunes nothing.
  const targets: Target[] = [];
  const automated = only.filter((s): s is Exclude<Source, "gaf"> => s !== "gaf");
  for (const source of automated) {
    const found = await resolve(source);
    if (found.length === 0) throw new Error(`source ${source} yielded no files; cache and manifest left untouched`);
    targets.push(...found);
  }

  const manifestPath = path.join(cache, "manifest.json");
  let manifest = await readManifest(manifestPath);
  // Drop files of the selected sources that the current selection no longer wants, so a stale quarter or year
  // is never loaded next to the current one. Manual sources (gaf) are never pruned here.
  const wanted = new Set(targets.map((t) => t.path));
  const automatedSet = new Set<Source>(automated);
  for (const m of manifest.filter((m) => automatedSet.has(m.source) && !wanted.has(m.path))) {
    log(`prune ${m.path} (no longer selected)`);
    await rm(path.join(cache, m.path), { force: true });
  }
  manifest = manifest.filter((m) => !automatedSet.has(m.source) || wanted.has(m.path));
  const save = async () => {
    await mkdir(cache, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  };
  const record = (entry: SourceFile) => {
    const i = manifest.findIndex((m) => m.path === entry.path);
    if (i >= 0) manifest[i] = entry;
    else manifest.push(entry);
  };

  for (const t of targets) {
    const dest = path.join(cache, t.path);
    const existing = manifest.find((m) => m.path === t.path && m.url === t.url);
    const onDisk = await sha256Of(dest);
    if (onDisk && isManifestFresh(existing, onDisk)) {
      log(`skip ${t.path} (unchanged)`);
      continue;
    }
    log(`download ${t.url}`);
    const { sha256, bytes } = await fetchFile(t.url, dest);
    record({ ...t, sha256, bytes, fetchedAt: new Date().toISOString() });
    await save();
  }

  if (wantsGaf && opts.gafFile) {
    const rel = `gaf/${path.basename(opts.gafFile)}`;
    const dest = path.join(cache, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(opts.gafFile, dest);
    const sha256 = (await sha256Of(dest)) as string;
    manifest = manifest.filter((m) => m.source !== "gaf");
    record({
      source: "gaf",
      url: STATCAN_GAF_PAGE_URL,
      path: rel,
      sha256,
      bytes: (await stat(dest)).size,
      fetchedAt: new Date().toISOString(),
    });
    log(`imported ${rel}`);
  }

  await save();
  return manifest;
}

async function main() {
  const { only, cache, gafFile } = parseArgs(process.argv.slice(2));
  const manifest = await runDownload({ only, cache, gafFile });
  console.log(`manifest: ${path.join(cache, "manifest.json")}`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
