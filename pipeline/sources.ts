// Source registry for the company dataset pipeline: where files come from,
// which columns may pass the loader, and how years are selected.

export const DOL_DOWNLOAD_MODE: "direct" | "release" = "direct";

export const LMIA_PACKAGE_API =
  "https://open.canada.ca/data/api/3/action/package_show?id=90fed587-1364-4f33-a9ee-208181dc0b97";
export const CBSA_DELINEATION_URL =
  "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx";
export const STATCAN_GAF_URL =
  "https://www12.statcan.gc.ca/census-recensement/2021/geo/aip-pia/attribute-attribs/files-fichiers/2021_92-151_X.zip";

const DOL_BASE = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs";

export function lcaUrl(fy: number, q: number): string {
  return `${DOL_BASE}/LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`;
}

export function permUrl(fy: number, q: number): string {
  return `${DOL_BASE}/PERM_Disclosure_Data_FY${fy}_Q${q}.xlsx`;
}

export const DEFAULT_USER_AGENT = "job-hunt-hq-dataset/1 (+https://github.com/hjun-escape/job-hunt-hq)";

/**
 * Host to user agent. A host missing here gets DEFAULT_USER_AGENT. Checked in Task 1 Step 8: the default
 * was accepted by www.dol.gov, open.canada.ca and www2.census.gov. www12.statcan.gc.ca answered 403 (bot
 * protection page) to both the default and the "Mozilla/5.0 (compatible; ...)" form, so it is refused.
 */
export const USER_AGENTS: Record<string, string> = {};

/** Allowed columns only. Personal columns (contacts, attorneys, law firms, preparers, phones, street lines) never appear here. */
export const EXPECTED_COLUMNS: { lca: string[]; perm: string[]; lmia: string[] } = {
  lca: [
    "CASE_STATUS", "DECISION_DATE", "VISA_CLASS", "JOB_TITLE", "SOC_CODE", "TOTAL_WORKER_POSITIONS",
    "NEW_EMPLOYMENT", "CONTINUED_EMPLOYMENT", "CHANGE_PREVIOUS_EMPLOYMENT", "NEW_CONCURRENT_EMPLOYMENT",
    "CHANGE_EMPLOYER", "AMENDED_PETITION", "EMPLOYER_NAME", "TRADE_NAME_DBA", "EMPLOYER_STATE",
    "EMPLOYER_FEIN", "WORKSITE_COUNTY", "WORKSITE_STATE", "WAGE_RATE_OF_PAY_FROM", "WAGE_UNIT_OF_PAY",
    "PW_WAGE_LEVEL",
  ],
  perm: [
    "CASE_STATUS", "DECISION_DATE", "EMP_BUSINESS_NAME", "EMP_TRADE_NAME", "EMP_FEIN", "EMP_STATE",
    "JOB_TITLE", "PWD_SOC_CODE", "JOB_OPP_WAGE_FROM", "JOB_OPP_WAGE_PER", "PRIMARY_WORKSITE_COUNTY",
    "PRIMARY_WORKSITE_STATE",
  ],
  // "Address" is a street line in the real files, so it is not allowed through.
  lmia: [
    "Province/Territory", "Program Stream", "Employer", "Occupation", "Incorporate Status", "Approved LMIAs",
    "Approved Positions",
  ],
};

/** Real LMIA header row (row 2 of sheet "positive", same in all 11 quarters checked, 2023q4 to 2026q2). */
export const LMIA_HEADERS = [
  "Province/Territory", "Program Stream", "Employer", "Address", "Occupation", "Incorporate Status",
  "Approved LMIAs", "Approved Positions",
];

export type SourceFile = {
  source: "lca" | "perm" | "lmia" | "cbsa" | "gaf";
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

export type YearSelection = { complete: number[]; partial?: { year: number; through: 1 | 2 | 3 } };

/**
 * Pick at most 3 complete years (the most recent ones). The latest year, when it
 * has only quarters 1 to 3, is returned as partial. Years with no quarters are ignored.
 */
export function selectYears(maxQuarterByYear: Record<number, 0 | 1 | 2 | 3 | 4>): YearSelection {
  const years = Object.keys(maxQuarterByYear)
    .map(Number)
    .filter((y) => maxQuarterByYear[y] > 0)
    .sort((a, b) => a - b);
  if (years.length === 0) return { complete: [] };
  const latest = years[years.length - 1];
  const latestQ = maxQuarterByYear[latest];
  const complete = years.filter((y) => maxQuarterByYear[y] === 4).slice(-3);
  if (latestQ < 4) return { complete, partial: { year: latest, through: latestQ as 1 | 2 | 3 } };
  return { complete };
}

/** One entry per year, the highest quarter, sorted by year. For cumulative quarterly files (LCA, PERM). */
export function latestQuarterFiles<T extends { year: number; quarter: number }>(found: T[]): T[] {
  const best = new Map<number, T>();
  for (const f of found) {
    const cur = best.get(f.year);
    if (!cur || f.quarter > cur.quarter) best.set(f.year, f);
  }
  return [...best.values()].sort((a, b) => a.year - b.year);
}
