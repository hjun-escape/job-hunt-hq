// Pure helpers that turn raw LCA and PERM cell strings into numbers, annual pay, fiscal dates and statuses.
import type { CaseStatus, WageLevel } from "../types";
import { WAGE_LEVELS } from "../types";

/** A money amount from text: `$`, commas and surrounding spaces are accepted. Null for empty, non-numeric or negative. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const PERIODS_PER_YEAR: Record<string, number> = {
  hour: 2080,
  week: 52,
  "bi-weekly": 26,
  month: 12,
  year: 1,
};

/** Lower-case, trim, collapse whitespace and treat "Bi Weekly" and "Biweekly" as "bi-weekly". */
function unitKey(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\s+/g, " ");
  return u === "biweekly" || u === "bi weekly" ? "bi-weekly" : u;
}

const MAX_HOURLY = 1_000;
const MIN_ANNUAL = 15_000;
const MAX_ANNUAL = 1_500_000;

/** Unrounded annual pay, or null when the unit is unknown or the figure is outside the plausible range. Bounds are inclusive. */
export function annualize(amount: number | null, unit: string): number | null {
  if (amount === null) return null;
  const key = unitKey(unit);
  // Own keys only, so "constructor" or "__proto__" never reads an inherited property.
  if (!Object.hasOwn(PERIODS_PER_YEAR, key)) return null;
  const periods = PERIODS_PER_YEAR[key];
  if (key === "hour" && amount > MAX_HOURLY) return null;
  const annual = amount * periods;
  return annual >= MIN_ANNUAL && annual <= MAX_ANNUAL ? annual : null;
}

/** Federal fiscal year and month (October is month 1). Throws on anything but a valid YYYY-MM-DD; the loader checks the format first. */
export function fiscalYearMonth(isoDate: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const cal = m ? Number(m[2]) : 0;
  if (!m || cal < 1 || cal > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) throw new Error("invalid ISO date");
  const y = Number(m[1]);
  return cal >= 10 ? { year: y + 1, month: cal - 9 } : { year: y, month: cal + 3 };
}

/** Case-insensitive, with spaces around hyphens ignored and internal whitespace collapsed. */
function statusKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/ ?- ?/g, "-");
}

const STATUSES: Record<string, CaseStatus> = {
  certified: "certified",
  "certified-withdrawn": "certified",
  "certified-expired": "certified",
  denied: "denied",
  withdrawn: "withdrawn",
};

/** The status for a key, own keys only, so "constructor" or "__proto__" never maps. */
function statusOf(s: string): CaseStatus | null {
  const key = statusKey(s);
  return Object.hasOwn(STATUSES, key) ? STATUSES[key] : null;
}

export function lcaStatus(s: string): CaseStatus | null {
  return statusOf(s);
}

export function permStatus(s: string): CaseStatus | null {
  return statusOf(s);
}

/** True for an LCA "Certified - Withdrawn" status (any case, spaces around the hyphen ignored). */
export function isCertifiedWithdrawn(s: string): boolean {
  return statusKey(s) === "certified-withdrawn";
}

const DAY_MS = 86_400_000;
/** I-<3-digit program code>-<YY><DDD>-<6-digit sequence>, as in I-200-25300-123456 (H-1B) or I-203-... (E-3). */
const CASE_NUMBER = /^I-\d{3}-(\d{2})(\d{3})-\d{6}$/;

/**
 * The date DOL received an LCA, from its case number: YY is the calendar year (20YY) and DDD the day of that
 * year (checked against RECEIVED_DATE on a real file: the same day or one day later). Null for anything that is
 * not a well-formed case number, including a day the year does not have; never throws.
 */
export function caseReceivedDate(caseNumber: string): Date | null {
  const m = CASE_NUMBER.exec(caseNumber.trim().toUpperCase());
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  const doy = Number(m[2]);
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
  return doy >= 1 && doy <= days ? new Date(Date.UTC(year, 0, doy)) : null;
}

/** The first day (UTC midnight) of a federal fiscal quarter: Q1 starts 1 October of the year before. */
export function fiscalQuarterStart(fiscalYear: number, quarter: number): Date {
  return new Date(Date.UTC(quarter === 1 ? fiscalYear - 1 : fiscalYear, [9, 0, 3, 6][quarter - 1], 1));
}

/** Prevailing wage level I to IV; anything else, including blank, is "N/A". */
export function wageLevel(s: string): WageLevel {
  const u = s.trim().toUpperCase();
  return (WAGE_LEVELS as readonly string[]).includes(u) ? (u as WageLevel) : "N/A";
}
