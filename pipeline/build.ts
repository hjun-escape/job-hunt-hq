// The build: reads the cached government files named in the cache manifest, aggregates them per owner, runs
// the safety checks and writes the site and the committed yearly summaries. Nothing here downloads a data
// file (dataset:download fills the cache), and the reference tables come from the data dir. Any failed check
// gives ok: false with a problem line; the CLI then exits non-zero so the deploy never runs and the live data
// stays. Problem and warning lines name files, ids, columns and years, never a value from a filing.
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAccumulator, isUnprofiledId, type OwnerResult, type YearPlans } from "./aggregate/accumulate";
import { checkSizes } from "./check/sizes";
import { personalText, POSTAL_CODE } from "./check/text-scan";
import { compareTotals, compareWithPublished } from "./check/totals";
import { selectionFor } from "./cli/download";
import { politeFetch } from "./http";
import { loadCa } from "./load/ca";
import { HeaderMismatchError } from "./load/rows";
import { loadUs, type LoadContext } from "./load/us";
import { buildEntityMap, ownerForCa, ownerForUs } from "./match/entities";
import { buildReport } from "./match/report";
import { feinTokens, isNumberedCompanyName, usEmployerId } from "./normalize/names";
import { loadPlaceIndex, type PlaceIndex } from "./normalize/places";
import { loadRoles, type RoleSet } from "./normalize/roles";
import { loadProfiles } from "./profiles/load";
import { summaryCsvs, writeSite, type SiteModel, type WrittenFile } from "./publish/write";
import { Meta, type Totals } from "./schema/published";
import { filesToRead, PUBLISHED_TOTALS, type SourceFile } from "./sources";
import type { LoadStats } from "./types";

const DATA_SOURCES = ["lca", "perm", "lmia"] as const;
type DataSource = (typeof DATA_SOURCES)[number];

export type BuildOptions = {
  cacheDir: string;
  outDir: string;
  /** Holds roles.yaml, reference/ and companies/; summaries go to <dataDir>/summary/. Default "data". */
  dataDir?: string;
  /** The live site's meta.json, to compare totals with. Without it the build counts as a first build. */
  liveMetaUrl?: string;
  today: Date;
  /**
   * R36: a legitimate government revision moved a total. Totals-check problems become warnings prefixed
   * "accepted totals change: " (meta.json lists them too) and the build can pass. An unreadable live meta.json
   * is still a problem.
   */
  acceptTotalsChange?: boolean;
  /** Fetches liveMetaUrl. Default politeFetch. */
  fetchFn?: (url: string) => Promise<Response>;
  /** Progress lines: one per file read and one per phase, counts and seconds only. Default none. */
  log?: (line: string) => void;
};

export type FileStats = LoadStats & {
  source: DataSource;
  path: string;
  year: number;
  quarter: number;
  seconds: number;
};

/** Counts for the build log. Nothing here names an employer. */
export type BuildStats = {
  years: YearPlans | null;
  files: FileStats[];
  /**
   * Owners the accumulator kept, then (once the name screen passes) the ones published. US and CA count owners
   * with data in that country, `both` those in the two.
   */
  owners: { total: number; us: number; ca: number; both: number; profiled: number };
  droppedPersonLike: number;
  /** Unprofiled owners left out because a filed name looks like a postal code (R33). */
  droppedPostal: number;
  totals: Totals | null;
};

export type BuildResult = {
  ok: boolean;
  problems: string[];
  warnings: string[];
  files: WrittenFile[];
  stats: BuildStats;
};

// ---- Live meta.json ---------------------------------------------------------------------------------------

export type LiveMeta = { ok: true; meta: Meta | null } | { ok: false; problem: string };

const REFUSE = "could not read the live meta.json; refusing to compare";
/** Prefix of a totals-check problem accepted with acceptTotalsChange (R36). */
export const ACCEPTED = "accepted totals change: ";
export const FIRST_BUILD_404 = "live meta.json returned 404; treated as a first build";

/** The live meta.json: null on a 404 (nothing deployed yet, a first build). Anything else unreadable is a problem. */
export async function readLiveMeta(
  url: string,
  fetchFn: (url: string) => Promise<Response> = politeFetch,
): Promise<LiveMeta> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch (e) {
    return { ok: false, problem: `${REFUSE} (${firstLine(e)})` };
  }
  if (res.status === 404) return { ok: true, meta: null };
  if (!res.ok) return { ok: false, problem: `${REFUSE} (HTTP ${res.status})` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, problem: "the live meta.json is not valid JSON; refusing to compare" };
  }
  const parsed = Meta.safeParse(body);
  if (!parsed.success) {
    return { ok: false, problem: "the live meta.json does not match the meta.json schema; refusing to compare" };
  }
  return { ok: true, meta: parsed.data };
}

// ---- Name screen: R33 postal-code look-alikes, emails, column names and FEINs --------------------------------

/**
 * For an unprofiled US owner, how a filed name holds a FEIN, or null: its own (a FEIN-shaped token whose
 * generated id is the owner's), or any other FEIN-shaped token (the loaders' FEIN_TOKEN). Unprofiled FEINs are
 * never published, and a trade name that is a FEIN would publish one. Canadian owners have no FEIN, so they are
 * not checked. A Canadian numbered-company name such as "101234567 SASKATCHEWAN LTD" is a name (R37), so only
 * the "other FEIN-shaped number" case exempts it: its own FEIN is refused even there.
 */
function feinIn(id: string, text: string): string | null {
  if (!id.startsWith("us-")) return null;
  const found = feinTokens(text);
  if (found.length === 0) return null;
  if (found.some((digits) => usEmployerId(digits, "", null) === id)) return "its own FEIN";
  return isNumberedCompanyName(text) ? null : "a FEIN-shaped number";
}

/**
 * Screens every unprofiled owner's name and other names. A postal-code-pattern hit (a government name such
 * as "A1B2C3 HOLDINGS INC", which nobody can edit) leaves the owner out. An email or a personal column name
 * means personal data got past the loader, and a FEIN-shaped number (see feinIn) would publish a FEIN: both
 * are problems. Profiled owners pass through: their names come with a profile a maintainer reviewed, and the
 * writer still scans them. Problems and `dropped` name only owner ids.
 */
export function screenNames(owners: Map<string, OwnerResult>): {
  kept: Map<string, OwnerResult>;
  dropped: string[];
  problems: string[];
} {
  const kept = new Map<string, OwnerResult>();
  const dropped: string[] = [];
  const problems: string[] = [];
  for (const [id, o] of owners) {
    if (!isUnprofiledId(id)) {
      kept.set(id, o);
      continue;
    }
    const texts = [o.name, ...o.also];
    const leak = texts.map((t) => personalText(t, { postal: false })).find((what) => what !== null);
    const fein = texts.map((t) => feinIn(id, t)).find((what) => what !== null);
    if (leak) {
      problems.push(`owner ${id}: a name it filed under contains ${leak}, so personal data got past the loader`);
    } else if (fein) {
      problems.push(`owner ${id}: a name it filed under contains ${fein}; unprofiled FEINs are never published`);
    } else if (texts.some((t) => personalText(t) === POSTAL_CODE)) {
      dropped.push(id);
    } else {
      kept.set(id, o);
    }
  }
  return { kept, dropped, problems };
}

// ---- Staleness (R44) ------------------------------------------------------------------------------------

/** A source whose newest selected quarter ended more than this many days before the build is stale. */
export const STALE_DAYS = 150;
const DAY_MS = 86_400_000;

/** The last day of a quarter: federal fiscal (October to September) for LCA and PERM, calendar for LMIA. */
function quarterEnd(source: DataSource, year: number, quarter: number): Date {
  // The day before the next quarter starts. Fiscal Q1 (October to December) ends on 31 December of year - 1.
  const nextStart = source === "lmia" ? Date.UTC(year, quarter * 3, 1) : Date.UTC(year, [0, 3, 6, 9][quarter - 1], 1);
  return new Date(nextStart - DAY_MS);
}

/**
 * One problem line per source whose newest selected quarter (the partial year's last quarter, else the latest
 * complete year's fourth) ended more than STALE_DAYS before `today`, comparing UTC dates. A source that stops
 * advancing has usually moved its files, and the probe then finds only old ones. A source with nothing selected
 * is left to the "no files" problem.
 */
export function staleness(years: YearPlans, today: Date): string[] {
  const todayMs = Date.parse(today.toISOString().slice(0, 10));
  const lines: string[] = [];
  for (const s of DATA_SOURCES) {
    const sel = years[s];
    const newest = sel.partial
      ? { year: sel.partial.year, quarter: sel.partial.through }
      : sel.complete.length > 0
        ? { year: Math.max(...sel.complete), quarter: 4 }
        : null;
    if (newest === null) continue;
    const end = quarterEnd(s, newest.year, newest.quarter);
    if ((todayMs - end.getTime()) / DAY_MS > STALE_DAYS) {
      const date = end.toISOString().slice(0, 10);
      lines.push(`${s} data looks stale: newest quarter ended ${date}; the source may have moved its files`);
    }
  }
  return lines;
}

// ---- Summaries ------------------------------------------------------------------------------------------

/** The summary CSVs as size-check entries: they are committed to git, so the 50 MB per-file limit applies. */
export function summaryEntries(csvs: Record<string, string>): WrittenFile[] {
  return Object.keys(csvs)
    .sort()
    .map((name) => ({ path: `summary/${name}`, bytes: Buffer.byteLength(csvs[name], "utf8"), gzipBytes: 0 }));
}

/**
 * Writes the summary CSVs into <dataDir>/summary atomically. Every file goes into a fresh staging directory
 * beside it, with earlier years' files this build no longer produces copied over (a year that rolled out of the
 * window keeps its last summary), then the staging directory is swapped in. On any failure the old summaries are
 * left exactly as they were and the staging directory is removed. Once the swap is done the new summaries are in
 * place, so failing to remove the previous directory only gives a warning, which is returned.
 */
export async function writeSummaries(dataDir: string, csvs: Record<string, string>): Promise<string[]> {
  const dir = path.join(dataDir, "summary");
  await mkdir(dataDir, { recursive: true });
  const stage = await mkdtemp(path.join(dataDir, ".summary-staging-"));
  const previous = `${stage}-previous`;
  try {
    let existing: string[] = [];
    let hadDir = true;
    try {
      existing = await readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      hadDir = false;
    }
    for (const name of existing.filter((n) => !Object.prototype.hasOwnProperty.call(csvs, n))) {
      await copyFile(path.join(dir, name), path.join(stage, name));
    }
    for (const name of Object.keys(csvs).sort()) await writeFile(path.join(stage, name), csvs[name]);
    if (hadDir) await rename(dir, previous);
    try {
      await rename(stage, dir);
    } catch (e) {
      if (hadDir) await rename(previous, dir);
      throw e;
    }
    if (!hadDir) return [];
    try {
      await rm(previous, { recursive: true, force: true });
      return [];
    } catch (e) {
      const where = path.join(dataDir, path.basename(previous));
      return [`could not remove the previous summaries directory ${where}; delete it by hand (${firstLine(e)})`];
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

// ---- Helpers --------------------------------------------------------------------------------------------

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300);
}

/** An error message fit for a public issue: one line, the local cache path removed, nothing personal-looking. */
export function safeMessage(e: unknown, cacheDir: string): string {
  const msg = firstLine(e).split(path.resolve(cacheDir)).join("<cache>").split(cacheDir).join("<cache>");
  return personalText(msg) ? "(details withheld: the error text looked like personal data)" : msg;
}

async function readManifest(cacheDir: string): Promise<SourceFile[] | string> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(cacheDir, "manifest.json"), "utf8"));
  } catch (e) {
    const why = (e as NodeJS.ErrnoException).code === "ENOENT" ? "it does not exist" : "it is not valid JSON";
    return `cannot read the cache manifest (manifest.json in the cache directory): ${why}; ` +
      "run npm run dataset:download first";
  }
  const valid = (e: unknown) =>
    typeof e === "object" && e !== null && typeof (e as SourceFile).source === "string" &&
    typeof (e as SourceFile).path === "string";
  if (!Array.isArray(raw) || !raw.every(valid)) {
    return "the cache manifest is not a list of files; run npm run dataset:download again";
  }
  return raw as SourceFile[];
}

/** The year selection per source and the files to read for it (every quarter for LCA and LMIA, the latest for PERM). */
function planFiles(manifest: SourceFile[]): { years: YearPlans; files: Record<DataSource, SourceFile[]> } {
  const years = {} as YearPlans;
  const files = {} as Record<DataSource, SourceFile[]>;
  for (const s of DATA_SOURCES) {
    const entries = manifest.filter(
      (e): e is SourceFile & { year: number; quarter: number } =>
        e.source === s && Number.isInteger(e.year) && Number.isInteger(e.quarter),
    );
    years[s] = selectionFor(s, entries);
    files[s] = filesToRead(s, entries, years[s]);
  }
  return { years, files };
}

/** Labels for every role id and place key the owners carry; write.ts keeps the ones it publishes. */
function labelsFor(owners: Map<string, OwnerResult>, roles: RoleSet, places: PlaceIndex) {
  const roleIds = new Set<string>();
  const placeKeys = new Set<string>();
  for (const o of owners.values()) {
    for (const p of DATA_SOURCES) {
      for (const b of o.sponsorship[p] ?? []) {
        if ("tooFew" in b) continue;
        for (const c of b.cells) {
          roleIds.add(c.role);
          placeKeys.add(c.place);
        }
      }
    }
    if (o.region) placeKeys.add(o.region);
  }
  return {
    roleLabels: Object.fromEntries([...roleIds].map((k) => [k, roles.label(k)])),
    placeLabels: Object.fromEntries([...placeKeys].map((k) => [k, places.label(k)])),
  };
}

function ownerCounts(owners: Map<string, OwnerResult>): BuildStats["owners"] {
  const c = { total: owners.size, us: 0, ca: 0, both: 0, profiled: 0 };
  for (const [id, o] of owners) {
    const us = o.countries.includes("US");
    const ca = o.countries.includes("CA");
    if (us) c.us++;
    if (ca) c.ca++;
    if (us && ca) c.both++;
    if (!isUnprofiledId(id)) c.profiled++;
  }
  return c;
}

// ---- The build ------------------------------------------------------------------------------------------

export async function runBuild(opts: BuildOptions): Promise<BuildResult> {
  const { cacheDir, outDir, today } = opts;
  const dataDir = opts.dataDir ?? "data";
  const log = opts.log ?? (() => {});
  const problems: string[] = [];
  const warnings: string[] = [];
  let files: WrittenFile[] = [];
  const stats: BuildStats = {
    years: null,
    files: [],
    owners: { total: 0, us: 0, ca: 0, both: 0, profiled: 0 },
    droppedPersonLike: 0,
    droppedPostal: 0,
    totals: null,
  };
  const done = (): BuildResult => ({ ok: problems.length === 0, problems, warnings, files, stats });
  let phase = Date.now();
  /** Logs how long the step since the previous lap took, for the CI time budget. */
  const lap = (what: string) => {
    log(`${what} in ${Math.round((Date.now() - phase) / 100) / 10} s`);
    phase = Date.now();
  };
  const fail = (line: string): BuildResult => (problems.push(line), done());

  // 1. The cache manifest and the files to read.
  const manifest = await readManifest(cacheDir);
  if (typeof manifest === "string") return fail(manifest);
  const { years, files: toRead } = planFiles(manifest);
  stats.years = years;
  for (const s of DATA_SOURCES) {
    if (toRead[s].length === 0) {
      problems.push(`no ${s} files to read in the cache manifest; run npm run dataset:download`);
    }
  }
  if (problems.length) return done();

  // 2. Reference tables, roles and profiles. Any profile problem is fatal.
  let places: PlaceIndex;
  let roles: RoleSet;
  try {
    places = await loadPlaceIndex(path.join(dataDir, "reference"));
    roles = loadRoles(path.join(dataDir, "roles.yaml"));
  } catch (e) {
    return fail(`could not load the reference tables or roles from the data dir: ${firstLine(e)}`);
  }
  const { profiles, problems: profileProblems } = await loadProfiles(path.join(dataDir, "companies"), today);
  for (const p of profileProblems) problems.push(`profile ${p.file}: ${p.path}: ${p.message}`);
  if (problems.length) return done();

  lap(`loaded the reference tables and ${profiles.length} profiles`);

  // 3. Stream every file into the accumulator. R3: a profiled employer with a person-like name is kept.
  const map = buildEntityMap(profiles);
  const ctx: LoadContext = { roles, places, profiled: (e) => map.us(e) !== undefined };
  const acc = createAccumulator();
  const read: SourceFile[] = [];
  // R43: case numbers seen in every LCA file so far; toRead.lca is in year and quarter order.
  const lcaCases = new Set<string>();
  for (const s of DATA_SOURCES) {
    for (const f of toRead[s]) {
      const file = path.join(cacheDir, f.path);
      const label = `${f.path} (${s} ${f.year} Q${f.quarter})`;
      const started = Date.now();
      let fileStats: LoadStats;
      try {
        if (s === "lmia") {
          const { rows, stats: st } = loadCa(file, { year: f.year!, quarter: f.quarter as 1 | 2 | 3 | 4 }, ctx);
          for await (const a of rows) acc.addCa(ownerForCa(a.employer, map), a);
          fileStats = st;
        } else {
          const relisting = s === "lca" ? { seen: lcaCases, period: { year: f.year!, quarter: f.quarter! } } : {};
          const { rows, stats: st } = loadUs(s, file, ctx, relisting);
          for await (const u of rows) acc.addUs(ownerForUs(u.employer, map), u);
          fileStats = st;
        }
      } catch (e) {
        if (e instanceof HeaderMismatchError) {
          return fail(
            `${label}: the header row is missing ${e.missing.join(", ")}. The source layout may have changed; ` +
              "compare the file with EXPECTED_COLUMNS in pipeline/sources.ts",
          );
        }
        return fail(`${label}: could not be read: ${safeMessage(e, cacheDir)}`);
      }
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      stats.files.push({ source: s, path: f.path, year: f.year!, quarter: f.quarter!, seconds, ...fileStats });
      read.push(f);
      const relisted = fileStats.skippedRelisted !== undefined ? `, withdrawal relistings ${fileStats.skippedRelisted}` : "";
      log(
        `${label}: read ${fileStats.read}, kept ${fileStats.kept}, person-named ${fileStats.skippedPerson}, ` +
          `invalid ${fileStats.skippedInvalid}${relisted} (${seconds} s)`,
      );
    }
  }
  lcaCases.clear();

  lap(`read ${read.length} files`);
  const relisted = stats.files.reduce((n, f) => n + (f.skippedRelisted ?? 0), 0);
  if (relisted > 0) {
    warnings.push(`lca: ${relisted} "Certified - Withdrawn" rows were left out as relistings of cases certified in an earlier quarter`);
  }

  // 4. Owners and totals, then R33.
  const { owners: all, totals, droppedPersonLike } = acc.finish(years);
  lap(`aggregated ${all.size} owners`);
  stats.totals = totals;
  stats.droppedPersonLike = droppedPersonLike;
  stats.owners = ownerCounts(all);
  const screened = screenNames(all);
  if (screened.problems.length) {
    problems.push(...screened.problems);
    return done();
  }
  stats.droppedPostal = screened.dropped.length;
  const owners = screened.kept;
  stats.owners = ownerCounts(owners);
  warnings.push(...compareWithPublished(totals, PUBLISHED_TOTALS));
  for (const id of screened.dropped) {
    warnings.push(`owner ${id} is not published: a name it filed under looks like a postal code`);
  }

  // 5. Staleness (R44), then totals against the live build, before the site so an accepted change is recorded
  // in meta.json. The build goes on after a stale source, so one report lists every problem.
  problems.push(...staleness(years, today));
  if (opts.liveMetaUrl) {
    const live = await readLiveMeta(opts.liveMetaUrl, opts.fetchFn);
    if (!live.ok) problems.push(live.problem);
    else if (live.meta === null) warnings.push(FIRST_BUILD_404);
    else {
      const moved = compareTotals(live.meta.totals, totals, years, live.meta.years);
      if (opts.acceptTotalsChange) warnings.push(...moved.map((p) => `${ACCEPTED}${p}`));
      else problems.push(...moved);
    }
  }

  // 6. The site, even when a check above failed, so one report lists every problem (sizes included); the CLI
  // then exits 1 and nothing is deployed. writeSite is staged: on a throw the previous site is left as it was.
  const model: SiteModel = {
    owners,
    profiles: new Map(profiles.map((p) => [p.id, p])),
    years,
    sources: read,
    report: buildReport(owners, profiles),
    totals,
    warnings: [...warnings],
    ...labelsFor(owners, roles, places),
    builtAt: today.toISOString(),
  };
  lap("screened names and built the report");
  try {
    files = await writeSite(outDir, model);
  } catch (e) {
    return fail(`the site was not written (the previous site is unchanged): ${safeMessage(e, cacheDir)}`);
  }
  lap(`wrote the site (${files.length} files)`);

  problems.push(...checkSizes(files));
  let csvs: Record<string, string> = {};
  try {
    csvs = summaryCsvs(model);
    problems.push(...checkSizes(summaryEntries(csvs)));
  } catch (e) {
    problems.push(`the summaries could not be built: ${safeMessage(e, cacheDir)}`);
  }
  if (problems.length) return done();

  // 7. Only a build that passed everything writes the committed summaries, atomically.
  try {
    warnings.push(...(await writeSummaries(dataDir, csvs)));
    lap(`wrote ${Object.keys(csvs).length} summaries`);
  } catch (e) {
    return fail(`the summaries were not written (the previous ones are unchanged): ${safeMessage(e, cacheDir)}`);
  }
  return done();
}
