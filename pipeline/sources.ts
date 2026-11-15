// Source registry for the company dataset pipeline: where files come from,
// which columns may pass the loader, and how years are selected.
import type { Totals } from "./schema/published";

export const DOL_DOWNLOAD_MODE: "direct" | "release" = "direct";

export const LMIA_PACKAGE_API =
  "https://open.canada.ca/data/api/3/action/package_show?id=90fed587-1364-4f33-a9ee-208181dc0b97";
export const CBSA_DELINEATION_URL =
  "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx";
export const ZCTA_COUNTY_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";
export const STATCAN_GAF_PAGE_URL =
  "https://www12.statcan.gc.ca/census-recensement/2021/geo/aip-pia/attribute-attribs/index2021-eng.cfm?year=2021";
export const STATCAN_GAF_URL =
  "https://www12.statcan.gc.ca/census-recensement/2021/geo/aip-pia/attribute-attribs/files-fichiers/2021_92-151_X.zip";

const DOL_BASE = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs";
// Checked against DOL's performance page: FY2025 and older files live under DOL_BASE, FY2026 Q3 onward
// is linked under /media/. FY2026 Q1 and Q2 are still served under DOL_BASE.
const DOL_MEDIA = "https://www.dol.gov/media";

export function lcaUrl(fy: number, q: number): string {
  return `${DOL_BASE}/LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`;
}

export function permUrl(fy: number, q: number): string {
  return `${DOL_BASE}/PERM_Disclosure_Data_FY${fy}_Q${q}.xlsx`;
}

/** Candidate urls for one quarter, tried in order by the download probe. */
export function lcaUrlCandidates(fy: number, q: number): string[] {
  return [lcaUrl(fy, q), `${DOL_MEDIA}/LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`];
}

export function permUrlCandidates(fy: number, q: number): string[] {
  return [permUrl(fy, q), `${DOL_MEDIA}/PERM_Disclosure_Data_FY${fy}_Q${q}.xlsx`];
}

export const DEFAULT_USER_AGENT = "job-hunt-hq-dataset/1 (+https://github.com/hjun-escape/job-hunt-hq)";

/**
 * Host to user agent. A host missing here gets DEFAULT_USER_AGENT. Checked in Task 1 Step 8: the default
 * was accepted by www.dol.gov, open.canada.ca and www2.census.gov. www12.statcan.gc.ca answered 403 (bot
 * protection page) to both the default and the "Mozilla/5.0 (compatible; ...)" form, so it is refused.
 * The StatCan attribute file (gaf) therefore has no automated download: fetch the CSV version by hand from
 * STATCAN_GAF_PAGE_URL and import it with `dataset:download -- --gaf-file <path>`. The reference tables are
 * generated once and committed, so the weekly build never needs cbsa or gaf.
 */
export const USER_AGENTS: Record<string, string> = {};

/** Allowed columns only. Personal columns (contacts, attorneys, law firms, preparers, phones, street lines) never appear here. */
// Postal codes are read only to place a worksite in a metro and never leave the loader. The LCA CASE_NUMBER is
// read only to drop withdrawal relistings (R43) and never leaves the loader either.
export const EXPECTED_COLUMNS: { lca: string[]; perm: string[]; lmia: string[] } = {
  lca: [
    "CASE_NUMBER", "CASE_STATUS", "DECISION_DATE", "VISA_CLASS", "JOB_TITLE", "SOC_CODE", "TOTAL_WORKER_POSITIONS",
    "NEW_EMPLOYMENT", "CONTINUED_EMPLOYMENT", "CHANGE_PREVIOUS_EMPLOYMENT", "NEW_CONCURRENT_EMPLOYMENT",
    "CHANGE_EMPLOYER", "AMENDED_PETITION", "EMPLOYER_NAME", "TRADE_NAME_DBA", "EMPLOYER_STATE",
    "EMPLOYER_FEIN", "WORKSITE_COUNTY", "WORKSITE_STATE", "WORKSITE_POSTAL_CODE", "WAGE_RATE_OF_PAY_FROM", "WAGE_UNIT_OF_PAY",
    "PW_WAGE_LEVEL",
  ],
  perm: [
    "CASE_STATUS", "DECISION_DATE", "EMP_BUSINESS_NAME", "EMP_TRADE_NAME", "EMP_FEIN", "EMP_STATE",
    "JOB_TITLE", "PWD_SOC_CODE", "JOB_OPP_WAGE_FROM", "JOB_OPP_WAGE_PER", "PRIMARY_WORKSITE_COUNTY",
    "PRIMARY_WORKSITE_STATE", "PRIMARY_WORKSITE_POSTAL_CODE",
  ],
  // "Address" is kept for the city and province; the loader discards the street line in its mapper.
  lmia: [
    "Province/Territory", "Program Stream", "Employer", "Address", "Occupation", "Approved LMIAs",
    "Approved Positions",
  ],
};

/**
 * The government's own published totals per program and year, filled in by hand when available (for example
 * DOL's OFLC program statistics or the LMIA quarterly figures), in the same units as meta.json totals:
 * certified filings for lca and perm, approved LMIAs for lmia. The build warns when its totals are more than
 * 2% from these. Our totals leave out some cases (other visa classes, person-named employers), so a small
 * gap is expected; a large one means a loader or a source changed.
 */
export const PUBLISHED_TOTALS: Partial<Totals> = {};

export type SourceFile = {
  source: "lca" | "perm" | "lmia" | "cbsa" | "gaf" | "zcta";
  year?: number;
  quarter?: number;
  url: string;
  path: string;
  sha256: string;
  bytes: number;
  fetchedAt: string;
};

/** US federal fiscal year: October to September, named for the year it ends in. */
export function currentFiscalYear(date: Date): number {
  return date.getUTCFullYear() + (date.getUTCMonth() >= 9 ? 1 : 0);
}

/** Whether a source's quarterly file is cumulative within its year. LCA and LMIA files hold one quarter each. */
export const CUMULATIVE: { lca: boolean; perm: boolean; lmia: boolean } = { lca: false, perm: true, lmia: false };

/**
 * First year ever selected per source. PERM FY2024 and older use a legacy layout, and LCA FY2023 lacks the
 * employer FEIN column. (Fiscal years for lca and perm, calendar years for lmia.)
 */
export const FIRST_YEAR: { lca: number; perm: number; lmia: number } = { lca: 2024, perm: 2025, lmia: 2020 };

export type YearSelection = { complete: number[]; partial?: { year: number; through: 1 | 2 | 3 } };

/** The highest q such that quarters 1..q are all present. A year missing Q1 gives 0. */
export function contiguousQuarters(quarters: number[]): 0 | 1 | 2 | 3 | 4 {
  const have = new Set(quarters);
  let q = 0;
  while (q < 4 && have.has(q + 1)) q++;
  return q as 0 | 1 | 2 | 3 | 4;
}

/**
 * Pick at most 3 complete years (the most recent ones). The latest year, when it
 * has only quarters 1 to 3, is returned as partial. Years with no quarters, or before
 * `firstYear`, are ignored.
 */
export function selectYears(
  maxQuarterByYear: Record<number, 0 | 1 | 2 | 3 | 4>,
  firstYear = 0,
): YearSelection {
  const years = Object.keys(maxQuarterByYear)
    .map(Number)
    .filter((y) => maxQuarterByYear[y] > 0 && y >= firstYear)
    .sort((a, b) => a - b);
  if (years.length === 0) return { complete: [] };
  const latest = years[years.length - 1];
  const latestQ = maxQuarterByYear[latest];
  const complete = years.filter((y) => maxQuarterByYear[y] === 4).slice(-3);
  if (latestQ < 4) return { complete, partial: { year: latest, through: latestQ as 1 | 2 | 3 } };
  return { complete };
}

/**
 * Files to read for a selection, sorted by year then quarter. Per-quarter sources (CUMULATIVE false) read
 * every quarter of each selected year up to `through` for the partial year; cumulative sources read only the
 * latest quarter of each selected year.
 */
export function filesToRead<T extends { year?: number; quarter?: number }>(
  source: "lca" | "perm" | "lmia",
  entries: T[],
  selection: YearSelection,
): T[] {
  const limit = new Map<number, number>();
  for (const y of selection.complete) limit.set(y, 4);
  if (selection.partial) limit.set(selection.partial.year, selection.partial.through);
  const inScope = entries.filter(
    (e) => e.year !== undefined && e.quarter !== undefined && (limit.get(e.year) ?? 0) >= e.quarter,
  );
  const chosen = CUMULATIVE[source]
    ? latestQuarterFiles(inScope as (T & { year: number; quarter: number })[])
    : inScope;
  return [...chosen].sort((a, b) => a.year! - b.year! || a.quarter! - b.quarter!);
}

/** One entry per year, the highest quarter, sorted by year. For cumulative quarterly files (PERM). */
export function latestQuarterFiles<T extends { year: number; quarter: number }>(found: T[]): T[] {
  const best = new Map<number, T>();
  for (const f of found) {
    const cur = best.get(f.year);
    if (!cur || f.quarter > cur.quarter) best.set(f.year, f);
  }
  return [...best.values()].sort((a, b) => a.year - b.year);
}
