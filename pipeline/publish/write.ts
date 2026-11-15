// Writes the published site from the in-memory model: every file under data/v1 plus the landing page, and
// (separately) the committed yearly summary CSVs. Every JSON file is validated against its published schema
// and written from the parsed value, so only schema fields leave the pipeline. Output is deterministic:
// keys sorted at every level, entries in a fixed order, and no clock but the model's builtAt.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { isUnprofiledId, type OwnerResult, type YearPlans } from "../aggregate/accumulate";
import { PAY_MIN, SUB_MIN } from "../aggregate/cells";
import { headlineFor, publishedHeadline, type Program, type YearBlock } from "../aggregate/trend";
import { normalizeName } from "../normalize/names";
import { profileJsonSchema, type Profile } from "../schema/profile";
import {
  CompanyFile,
  EmployerFile,
  IndexEntry,
  Meta,
  Report,
  ReverseFile,
  type CaCell,
  type Sponsorship,
  type Totals,
  type UsCell,
} from "../schema/published";
import type { SourceFile, YearSelection } from "../sources";
import { COUNTRIES, type Country } from "../types";
import { CAVEATS, LICENCES } from "./copy";

export type SiteModel = {
  owners: Map<string, OwnerResult>;
  profiles: Map<string, Profile>;
  years: YearPlans;
  sources: SourceFile[];
  report: Report;
  totals: Totals;
  warnings: string[];
  roleLabels: Record<string, string>;
  placeLabels: Record<string, string>;
  builtAt: string;
};

/** One written file: `path` is relative to the output directory, with forward slashes. */
export type WrittenFile = { path: string; bytes: number; gzipBytes: number };

const V1 = "data/v1";
const PROGRAMS: Program[] = ["lca", "perm", "lmia"];
const SHARDS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0"];
/** Entries per place in a reverse file. */
const REVERSE_TOP = 50;
/** Role ids become reverse file names, so they must be plain lower-case slugs. */
const FILE_SAFE = /^[a-z0-9][a-z0-9-]*$/;
const LANDING_PAGE = new URL("../../site-static/index.html", import.meta.url);
const CSV_HEADER = "id,name,region,filings,headline";
/** The only keys a published breakdown cell may carry: counts and pay, never the sub-counts of a total. */
const CELL_KEYS = new Set(["role", "place", "filings", "workers", "pay", "lmias", "positions"]);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const has = (r: Record<string, string>, k: string) => Object.prototype.hasOwnProperty.call(r, k);
const isCountry = (c: string): c is Country => (COUNTRIES as readonly string[]).includes(c);

/** JSON with keys sorted (by UTF-16 code unit) at every level and no whitespace. Throws on anything JSON cannot hold exactly. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot write the number ${value} as JSON`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error("cannot write a non-plain object as JSON");
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort(cmp);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  throw new Error(`cannot write a ${typeof value} as JSON`);
}

const blocksOf = (s: Sponsorship, p: Program): YearBlock<UsCell | CaCell>[] => s[p] ?? [];
const blockFor = (s: Sponsorship, p: Program, year: number) => blocksOf(s, p).find((b) => b.year === year);
const latestComplete = (sel: YearSelection): number | null => (sel.complete.length ? Math.max(...sel.complete) : null);
const plannedYears = (sel: YearSelection): number[] =>
  [...new Set([...sel.complete, ...(sel.partial ? [sel.partial.year] : [])])].sort((a, b) => a - b);
const sortedOwners = (model: SiteModel): [string, OwnerResult][] =>
  [...model.owners].sort((a, b) => cmp(a[0], b[0]));
const sortedProfiles = (model: SiteModel): Profile[] => [...model.profiles.values()].sort((a, b) => cmp(a.id, b.id));

/**
 * The last gate before publishing re-checks what the aggregation guarantees, so a regression there fails the
 * build instead of leaking: every cell and total counts at least SUB_MIN filings (LMIAs in Canada); cells
 * carry counts and pay only; a total's sub-counts (denied, withdrawn, hire types, wage levels, streams) are
 * absent or at least SUB_MIN (a shown zero would let an absent value mean "1 or 2"); a month is 0 or at least
 * SUB_MIN; pay comes from at least PAY_MIN salaries.
 */
function checkBlocks(id: string, s: Sponsorship): void {
  for (const program of PROGRAMS) {
    for (const b of blocksOf(s, program)) {
      if ("tooFew" in b) continue;
      const fail = (why: string) => {
        throw new Error(`${id} ${program} ${b.year}: ${why}; not published`);
      };
      if (b.months?.some((n) => n !== 0 && n < SUB_MIN)) fail("a month count under 3");
      for (const c of [b.total, ...b.cells]) {
        if (("lmias" in c ? c.lmias : c.filings) < SUB_MIN) fail(`${c.role} in ${c.place} counts under 3`);
        if ("pay" in c && c.pay && c.pay.n < PAY_MIN) fail(`pay for ${c.role} in ${c.place} has under 10 salaries`);
      }
      for (const c of b.cells) for (const k of Object.keys(c)) if (!CELL_KEYS.has(k)) fail(`a cell carries ${k}`);
      const t = b.total as UsCell & CaCell;
      const subs = [t.denied, t.withdrawn, t.newHires, t.changeEmployer, t.continuing];
      subs.push(...Object.values(t.levels ?? {}), ...Object.values(t.streams ?? {}));
      if (subs.some((n) => n !== undefined && n < SUB_MIN)) fail("a sub-count on the total under 3");
    }
  }
}

/**
 * Every owner id is either generated (unprofiled) or a profile id, a profile is keyed by its own id, and every
 * block passes checkBlocks. Anything else means an earlier step went wrong, so nothing is written.
 */
function checkModel(model: SiteModel): void {
  for (const [key, p] of model.profiles) {
    if (key !== p.id) throw new Error(`profile ${p.id} is stored under the key ${key}`);
  }
  for (const [id, o] of model.owners) {
    if (!isUnprofiledId(id) && !model.profiles.has(id)) throw new Error(`owner ${id} has no generated id and no profile`);
    checkBlocks(id, o.sponsorship);
  }
}

/** The name shown for an owner: the profile name for a profiled company, else the most frequent filed name. */
function displayName(model: SiteModel, id: string, o: OwnerResult): string {
  return isUnprofiledId(id) ? o.name : model.profiles.get(id)!.name;
}

// ---- Index ------------------------------------------------------------------------------------------

/** First character of the normalised name when it is A to Z, else "0". */
export function shardOf(name: string): string {
  const first = normalizeName(name).charAt(0);
  return /^[A-Z]$/.test(first) ? first : "0";
}

/**
 * One entry per profile (with or without data) and per unprofiled owner. `h` is the latest complete LCA
 * year's headline plus the latest complete LMIA year's, each from published values with withheld parts as 0,
 * so it is a lower bound fit for sorting.
 */
function indexEntries(model: SiteModel): IndexEntry[] {
  const lcaYear = latestComplete(model.years.lca);
  const lmiaYear = latestComplete(model.years.lmia);
  const h = (o: OwnerResult | undefined) =>
    o
      ? (lcaYear === null ? 0 : headlineFor(o.sponsorship, "lca", lcaYear)) +
        (lmiaYear === null ? 0 : headlineFor(o.sponsorship, "lmia", lmiaYear))
      : 0;
  const entries: IndexEntry[] = [];
  for (const p of sortedProfiles(model)) {
    const o = model.owners.get(p.id);
    const c = [...new Set([...p.countries.filter(isCountry), ...(o?.countries ?? [])])].sort(cmp);
    const also = p.otherNames?.length ? { also: p.otherNames } : {};
    entries.push({ id: p.id, name: p.name, ...also, c, h: h(o), p: p.id });
  }
  for (const [id, o] of sortedOwners(model)) {
    if (!isUnprofiledId(id)) continue;
    entries.push({ id, name: o.name, ...(o.also.length ? { also: o.also } : {}), c: o.countries, h: h(o) });
  }
  return entries.map((e) => IndexEntry.parse(e));
}

// ---- Reverse files ------------------------------------------------------------------------------------

type ReverseEntry = ReverseFile["places"][string][number];
const byN = (a: ReverseEntry, b: ReverseEntry) => b.n - a.n || cmp(a.id, b.id);

/**
 * Top sponsors per role and place for the latest complete LCA (US) and LMIA (Canada) year, ranked by the
 * cell's filings (US) or positions (Canada), never by headline. Role `all` (roles too small to show on their
 * own) gets no file. Keyed by file path.
 */
function reverseFiles(model: SiteModel): Map<string, ReverseFile> {
  const files = new Map<string, ReverseFile>();
  for (const [country, program] of [["US", "lca"], ["CA", "lmia"]] as const) {
    const year = latestComplete(model.years[program]);
    if (year === null) continue;
    const byRole = new Map<string, Map<string, ReverseEntry[]>>();
    for (const [id, o] of sortedOwners(model)) {
      const b = blockFor(o.sponsorship, program, year);
      if (!b || "tooFew" in b) continue;
      for (const cell of b.cells) {
        if (cell.role === "all") continue;
        const n = program === "lmia" ? (cell as CaCell).positions : (cell as UsCell).filings;
        let places = byRole.get(cell.role);
        if (!places) byRole.set(cell.role, (places = new Map()));
        const list = places.get(cell.place) ?? [];
        list.push({ id, name: displayName(model, id, o), n });
        places.set(cell.place, list);
      }
    }
    for (const role of [...byRole.keys()].sort(cmp)) {
      if (!FILE_SAFE.test(role)) throw new Error(`role id ${JSON.stringify(role)} cannot be a file name`);
      const places: ReverseFile["places"] = {};
      for (const [place, list] of [...byRole.get(role)!].sort((a, b) => cmp(a[0], b[0]))) {
        places[place] = list.sort(byN).slice(0, REVERSE_TOP);
      }
      const file = ReverseFile.parse({ country, role, year, places });
      files.set(`${V1}/reverse/${country.toLowerCase()}/${role}.json`, file);
    }
  }
  return files;
}

// ---- meta.json ----------------------------------------------------------------------------------------

/**
 * Labels for the role ids and place keys that appear in the output: cell roles and places, and unprofiled
 * owners' regions. The reserved `all` (totals, and roles too small to show on their own) is left out. A key
 * without a label is labelled with itself.
 */
function labels(model: SiteModel): { roles: Record<string, string>; places: Record<string, string> } {
  const roleIds = new Set<string>();
  const placeKeys = new Set<string>();
  for (const [id, o] of model.owners) {
    for (const p of PROGRAMS) {
      for (const b of blocksOf(o.sponsorship, p)) {
        if ("tooFew" in b) continue;
        for (const c of b.cells) {
          roleIds.add(c.role);
          placeKeys.add(c.place);
        }
      }
    }
    if (isUnprofiledId(id) && o.region) placeKeys.add(o.region);
  }
  roleIds.delete("all");
  placeKeys.delete("all");
  const label = (keys: Set<string>, from: Record<string, string>) =>
    Object.fromEntries([...keys].sort(cmp).map((k) => [k, has(from, k) ? from[k] : k]));
  return { roles: label(roleIds, model.roleLabels), places: label(placeKeys, model.placeLabels) };
}

function metaFile(model: SiteModel): Meta {
  const sources = model.sources
    .map(({ path: _local, ...entry }) => entry)
    .sort(
      (a, b) =>
        cmp(a.source, b.source) ||
        (a.year ?? 0) - (b.year ?? 0) ||
        (a.quarter ?? 0) - (b.quarter ?? 0) ||
        cmp(a.url, b.url),
    );
  return Meta.parse({
    schemaVersion: 1,
    builtAt: model.builtAt,
    years: model.years,
    sources,
    totals: model.totals,
    warnings: model.warnings,
    caveats: CAVEATS,
    licences: LICENCES,
    ...labels(model),
  });
}

// ---- Summary CSVs -------------------------------------------------------------------------------------

/** RFC 4180: a field holding a comma, a quote or a line break is quoted, with quotes doubled. */
const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * `<program>-<year>.csv` for every planned year (complete and partial): one row per owner whose block for
 * that year is not tooFew, sorted by id. `filings` is the published filings (LCA, PERM) or LMIAs; `headline`
 * is the published headline, empty when a part of it is withheld. LF line endings, trailing newline.
 */
export function summaryCsvs(model: SiteModel): Record<string, string> {
  checkModel(model);
  const out: Record<string, string> = {};
  const owners = sortedOwners(model);
  for (const program of PROGRAMS) {
    for (const year of plannedYears(model.years[program])) {
      const lines = [CSV_HEADER];
      for (const [id, o] of owners) {
        const b = blockFor(o.sponsorship, program, year);
        if (!b || "tooFew" in b) continue;
        const filings = program === "lmia" ? (b.total as CaCell).lmias : (b.total as UsCell).filings;
        const headline = publishedHeadline(program, b.total);
        const row = [id, displayName(model, id, o), o.region ?? "", String(filings), headline === null ? "" : String(headline)];
        lines.push(row.map(csvField).join(","));
      }
      out[`${program}-${year}.csv`] = `${lines.join("\n")}\n`;
    }
  }
  return out;
}

// ---- The site -----------------------------------------------------------------------------------------

/**
 * Writes the site under `outDir` and lists what it wrote, sorted by path. The `data/v1` tree is replaced
 * whole, so no file from an earlier build survives; anything else in `outDir` is left alone. The model is
 * checked before anything is removed. Each file is validated as it is written, so after a throw the tree
 * may be partial and must not be deployed.
 */
export async function writeSite(outDir: string, model: SiteModel): Promise<WrittenFile[]> {
  checkModel(model);
  const landing = await readFile(LANDING_PAGE);
  await rm(path.join(outDir, ...V1.split("/")), { recursive: true, force: true });

  const written: WrittenFile[] = [];
  const seen = new Set<string>();
  const made = new Set<string>();
  const emit = async (rel: string, content: string | Buffer) => {
    if (seen.has(rel)) throw new Error(`${rel} would be written twice`);
    seen.add(rel);
    const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const full = path.join(outDir, ...rel.split("/"));
    const dir = path.dirname(full);
    if (!made.has(dir)) {
      await mkdir(dir, { recursive: true });
      made.add(dir);
    }
    await writeFile(full, buf);
    written.push({ path: rel, bytes: buf.length, gzipBytes: gzipSync(buf, { level: 9 }).length });
  };
  const json = (rel: string, value: unknown) => emit(rel, `${stableStringify(value)}\n`);

  await emit("index.html", landing);
  await json(`${V1}/meta.json`, metaFile(model));
  await json(`${V1}/report.json`, Report.parse(model.report));
  await json(`${V1}/schema/profile.json`, profileJsonSchema());

  const entries = indexEntries(model);
  const shards = new Map<string, IndexEntry[]>(SHARDS.map((s) => [s, []]));
  for (const e of entries) shards.get(shardOf(e.name))!.push(e);
  for (const [shard, list] of shards) {
    await json(`${V1}/index/${shard}.json`, list.sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id)));
  }
  await json(`${V1}/index/profiles.json`, entries.filter((e) => e.p !== undefined).sort((a, b) => cmp(a.id, b.id)));

  for (const p of sortedProfiles(model)) {
    const o = model.owners.get(p.id);
    const legalNames = o ? [...new Set([o.name, ...o.also])].sort(cmp) : [];
    const file = CompanyFile.parse({ profile: p, legalNames, sponsorship: o?.sponsorship ?? { trends: {} } });
    await json(`${V1}/companies/${file.profile.id}.json`, file);
  }

  // Unprofiled owners only, grouped by country prefix and the first three hex characters of the hash.
  const buckets = new Map<string, [string, OwnerResult][]>();
  for (const [id, o] of sortedOwners(model)) {
    if (!isUnprofiledId(id)) continue;
    const rel = `${V1}/employers/${id.slice(0, 2)}/${id.slice(3, 6)}.json`;
    const list = buckets.get(rel) ?? [];
    list.push([id, o]);
    buckets.set(rel, list);
  }
  for (const [rel, list] of buckets) {
    const record: Record<string, EmployerFile> = {};
    for (const [id, o] of list) {
      record[id] = EmployerFile.parse({
        id,
        name: o.name,
        ...(o.also.length ? { also: o.also } : {}),
        countries: o.countries,
        ...(o.region ? { region: o.region } : {}),
        sponsorship: o.sponsorship,
      });
    }
    await json(rel, record);
  }

  for (const [rel, file] of reverseFiles(model)) await json(rel, file);

  return written.sort((a, b) => cmp(a.path, b.path));
}
