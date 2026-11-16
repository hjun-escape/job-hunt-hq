// Usage: npm run dataset:reference
// Generates data/reference/us-counties-cbsa.csv, us-zip-cbsa.csv and ca-csd-cma.csv from the cached CBSA
// delineation workbook, the Census ZCTA-to-county relationship file ("zcta") and the StatCan 2021 geographic
// attribute file (a zip downloaded by hand and recorded in the manifest as "gaf"). The CSVs are committed; the weekly build never downloads either source.
// The zip is listed and vetted, extracted into its own fresh directory under the cache, and its contents are
// treated as untrusted data: only a few geographic name columns are read, by path. ca-aliases.csv is
// hand-curated and only validated here.
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { readRows } from "../load/rows";
import {
  CA_ALIAS_FILE,
  CA_REFERENCE_FILE,
  US_REFERENCE_FILE,
  ZIP_REFERENCE_FILE,
  caProvinceCode,
  usStateCode,
  type CaAliasRow,
  type CaCsdRow,
  type UsCountyRow,
  type UsZipRow,
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

/** A metropolitan county row plus its 5-digit FIPS code (state + county), used to join the ZCTA file. */
export type UsCountyRef = UsCountyRow & { fips: string };

export async function readUsCounties(file: string): Promise<UsCountyRef[]> {
  const seen = new Set<string>();
  const out: UsCountyRef[] = [];
  const cols = [
    "CBSA Code", "CBSA Title", "Metropolitan/Micropolitan Statistical Area", "County/County Equivalent",
    "State Name", "FIPS State Code", "FIPS County Code",
  ];
  for await (const r of readRows(file, cols)) {
    if (r["Metropolitan/Micropolitan Statistical Area"] !== "Metropolitan Statistical Area") continue;
    const state = usStateCode(r["State Name"]);
    if (!state) throw new Error(`unknown state name in the CBSA file: ${r["State Name"]}`);
    const row = {
      state,
      county: r["County/County Equivalent"],
      cbsa: r["CBSA Code"],
      title: r["CBSA Title"],
      fips: r["FIPS State Code"] + r["FIPS County Code"],
    };
    const key = `${row.state}|${row.county}|${row.cbsa}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => cmp(a.state, b.state) || cmp(a.county, b.county) || cmp(a.cbsa, b.cbsa));
}

/**
 * One CBSA per ZCTA: the county holding the largest land-area part of the ZCTA (ties: lowest county GEOID),
 * mapped to its metropolitan CBSA. A ZCTA whose main county is not metropolitan gets no row.
 * The Census relationship file is pipe-delimited text.
 */
export async function readZipCbsa(file: string, counties: UsCountyRef[]): Promise<UsZipRow[]> {
  const cbsaByFips = new Map(counties.map((c) => [c.fips, c.cbsa]));
  const best = new Map<string, { fips: string; land: number }>();
  let cols: { zip: number; county: number; land: number } | null = null;
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const raw of lines) {
    const cells = raw.replace(/^\uFEFF/, "").split("|");
    if (cols === null) {
      const at = (n: string) => {
        const i = cells.indexOf(n);
        if (i < 0) throw new Error(`ZCTA relationship file has no ${n} column`);
        return i;
      };
      cols = { zip: at("GEOID_ZCTA5_20"), county: at("GEOID_COUNTY_20"), land: at("AREALAND_PART") };
      continue;
    }
    const zip = cells[cols.zip];
    if (!/^\d{5}$/.test(zip ?? "")) continue; // county rows with no ZCTA
    const fips = cells[cols.county];
    const land = Number(cells[cols.land]);
    if (!/^\d{5}$/.test(fips ?? "") || !Number.isFinite(land)) throw new Error(`unreadable ZCTA relationship row for ZCTA ${zip}`);
    const cur = best.get(zip);
    if (!cur || land > cur.land || (land === cur.land && fips < cur.fips)) best.set(zip, { fips, land });
  }
  if (cols === null) throw new Error("ZCTA relationship file is empty");
  const out: UsZipRow[] = [];
  for (const [zip, { fips }] of best) {
    const cbsa = cbsaByFips.get(fips);
    if (cbsa) out.push({ zip, cbsa });
  }
  return out.sort((a, b) => cmp(a.zip, b.zip));
}

/** Aliases must be sorted by (province, alias), unique, and point at a CSD that is in the CMA table. */
export function validateAliases(aliases: CaAliasRow[], csds: CaCsdRow[]): void {
  const known = new Set(csds.map((c) => `${c.province}|${c.csd}`));
  let prev = "";
  for (const a of aliases) {
    const key = `${a.province}|${a.alias}`;
    if (key <= prev) throw new Error(`${CA_ALIAS_FILE}: not sorted or duplicate at ${key}`);
    prev = key;
    if (!known.has(`${a.province}|${a.csd}`)) throw new Error(`${CA_ALIAS_FILE}: ${a.alias} points at unknown CSD ${a.province}|${a.csd}`);
  }
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
    await pipeline(createReadStream(src), createWriteStream(dst, { flags: "wx" }));
    return "utf-8";
  }
  const dec = new TextDecoder("windows-1252");
  async function* decoded() {
    for await (const chunk of createReadStream(src) as AsyncIterable<Buffer>) yield dec.decode(chunk, { stream: true });
  }
  await pipeline(decoded, createWriteStream(dst, { encoding: "utf8", flags: "wx" }));
  return "windows-1252";
}

/** True when `child` is `dir` itself or lies inside it (both already resolved). */
function isInside(dir: string, child: string): boolean {
  const rel = path.relative(dir, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Rejects an archive listing that could write outside the extraction directory or plant a link: entry names
 * with `..` segments, absolute paths or backslashes, and any entry whose mode is not a plain file or directory
 * (`unzip -Z` lines start with a mode such as "-rw-r--r--"; "l" is a symlink).
 */
export function checkZipListing(names: string[], modes: string[]): void {
  if (names.length === 0) throw new Error("the attribute zip is empty");
  for (const n of names) {
    if (n.startsWith("/") || n.includes("\\") || n.split("/").includes("..") || /^[A-Za-z]:/.test(n)) {
      throw new Error(`unsafe path in the attribute zip: ${JSON.stringify(n)}`);
    }
  }
  for (const m of modes) {
    if (m[0] !== "-" && m[0] !== "d") throw new Error(`the attribute zip holds a non-regular entry (mode ${m.slice(0, 10)})`);
  }
}

/** Entry modes from `unzip -Z` (zipinfo short format): the first token of every entry line. */
export function zipModes(zipinfoOutput: string): string[] {
  return zipinfoOutput.split("\n").filter((l) => /^[-dlbcps?][-rwxsStT]{9}\s/.test(l)).map((l) => l.slice(0, 10));
}

function unzipOut(args: string[]): string {
  const res = spawnSync("unzip", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`unzip ${args[0]} failed`);
  return res.stdout;
}

/** Every path under dir must be a regular file or a directory; a symlink or device is rejected. */
async function assertPlainTree(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const st = await lstat(full);
    if (st.isDirectory()) files.push(...(await assertPlainTree(full)));
    else if (st.isFile()) files.push(full);
    else throw new Error(`the attribute zip extracted a non-regular entry: ${name}`);
  }
  return files;
}

/**
 * Lists the zip, rejects unsafe entries, extracts into a fresh empty directory (the old one is removed first)
 * and returns the path of its single CSV, whose realpath is checked to lie inside that directory.
 */
async function extractGaf(zip: string): Promise<{ dir: string; csv: string }> {
  checkZipListing(unzipOut(["-Z1", zip]).split("\n").filter(Boolean), zipModes(unzipOut(["-Z", zip])));
  const dir = path.join(path.dirname(zip), "extracted");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: false });
  unzipOut(["-n", "-q", zip, "-d", dir]);
  const files = await assertPlainTree(dir);
  const csvs = files.filter((f) => f.toLowerCase().endsWith(".csv"));
  if (csvs.length !== 1) throw new Error(`expected one CSV in the attribute zip, found ${csvs.length}`);
  const real = await realpath(csvs[0]);
  if (!isInside(await realpath(dir), real)) throw new Error("the attribute CSV resolves outside the extraction directory");
  return { dir, csv: real };
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
  const usRefs = await readUsCounties(await cachedPath("cbsa"));
  const us: UsCountyRow[] = usRefs.map(({ state, county, cbsa, title }) => ({ state, county, cbsa, title }));
  const zips = await readZipCbsa(await cachedPath("zcta"), usRefs);

  const { csv } = await extractGaf(await cachedPath("gaf"));
  // The UTF-8 copy goes into a separate fresh directory that the archive could not populate.
  const utf8Dir = await mkdtemp(path.join(path.dirname(path.dirname(csv)), "utf8-"));
  let ca: CaCsdRow[];
  try {
    const utf8 = path.join(utf8Dir, "attributes.utf8.csv");
    console.log(`attribute file encoding: ${await transcodeToUtf8(csv, utf8)}`);
    ca = await readCaCsds(utf8);
  } finally {
    await rm(utf8Dir, { recursive: true, force: true });
  }

  const aliases: CaAliasRow[] = [];
  for await (const r of readRows(path.join(OUT_DIR, CA_ALIAS_FILE), ["province", "alias", "csd"])) {
    aliases.push({ province: r.province, alias: r.alias, csd: r.csd });
  }
  validateAliases(aliases, ca);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, US_REFERENCE_FILE),
    toCsv(["state", "county", "cbsa", "title"], us.map((r) => [r.state, r.county, r.cbsa, r.title])),
  );
  await writeFile(path.join(OUT_DIR, ZIP_REFERENCE_FILE), toCsv(["zip", "cbsa"], zips.map((r) => [r.zip, r.cbsa])));
  await writeFile(
    path.join(OUT_DIR, CA_REFERENCE_FILE),
    toCsv(["province", "csd", "cma", "title"], ca.map((r) => [r.province, r.csd, r.cma, r.title])),
  );
  console.log(`${US_REFERENCE_FILE}: ${us.length} county rows in ${new Set(us.map((r) => r.cbsa)).size} metros`);
  console.log(`${ZIP_REFERENCE_FILE}: ${zips.length} metro ZCTAs`);
  console.log(
    `${CA_REFERENCE_FILE}: ${ca.length} CSD rows in ${new Set(ca.map((r) => r.cma)).size} CMAs, ` +
      `${countAmbiguousCsds(ca)} CSD names map to more than one CMA; ${aliases.length} aliases checked`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
