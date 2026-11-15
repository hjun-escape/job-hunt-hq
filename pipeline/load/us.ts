// Maps LCA and PERM spreadsheet rows into UsFiling records. Only allowed columns reach this module (readRows
// filters them), and postal codes are used to place the worksite and never stored.
import type { LoadStats, UsFiling } from "../types";
import { EXPECTED_COLUMNS } from "../sources";
import { personNameSignal } from "../normalize/names";
import type { PlaceIndex } from "../normalize/places";
import type { RoleSet } from "../normalize/roles";
import { annualize, fiscalYearMonth, lcaStatus, parseAmount, permStatus, wageLevel } from "../normalize/us";
import { readRows } from "./rows";

export type LoadContext = {
  roles: RoleSet;
  places: PlaceIndex;
  /** True when someone has written a profile for this employer; such a person-like name is kept. */
  profiled?: (employer: UsFiling["employer"]) => boolean;
};

export type InvalidReason = "employer" | "status" | "date" | "visa";
export type RowOutcome =
  | { filing: UsFiling }
  | { skip: "invalid"; reason: InvalidReason }
  | { skip: "person"; name: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function blankToNull(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}

/** Digits only, and exactly 9 of them, else null. */
function cleanFein(s: string | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length === 9 ? d : null;
}

/** Digits before any hyphen, left-padded to 5 when a spreadsheet dropped leading zeros. Anything else is null. */
function cleanZip(s: string | undefined): string | null {
  const head = (s ?? "").trim().split("-")[0].trim();
  return /^\d{3,5}$/.test(head) ? head.padStart(5, "0") : null;
}

/** A count cell: blank or non-numeric is 0. */
function count(s: string | undefined): number {
  const n = Number((s ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function pay(amount: string | undefined, unit: string | undefined): number | null {
  const annual = annualize(parseAmount(amount ?? ""), unit ?? "");
  return annual === null ? null : Math.round(annual);
}

function validVisa(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v.startsWith("H-1B") || v.startsWith("E-3");
}

type Common = {
  name: string;
  tradeName: string | null;
  fein: string | null;
  state: string | null;
  statusText: string;
  date: string;
};

/** Checks shared by both programs, in a fixed order so skip reasons are stable. */
function gate(
  c: Common,
  statusOf: (s: string) => UsFiling["status"] | null,
  ctx: LoadContext,
  visaOk: boolean,
): { status: UsFiling["status"]; employer: UsFiling["employer"]; ym: { year: number; month: number } } | RowOutcome {
  if (c.name === "") return { skip: "invalid", reason: "employer" };
  const status = statusOf(c.statusText);
  if (status === null) return { skip: "invalid", reason: "status" };
  if (!ISO_DATE.test(c.date)) return { skip: "invalid", reason: "date" };
  let ym: { year: number; month: number };
  try {
    ym = fiscalYearMonth(c.date);
  } catch {
    return { skip: "invalid", reason: "date" };
  }
  if (!visaOk) return { skip: "invalid", reason: "visa" };
  const employer: UsFiling["employer"] = { fein: c.fein, name: c.name, tradeName: c.tradeName, state: c.state };
  const signal = personNameSignal(c.name);
  if (signal === "strong" && !ctx.profiled?.(employer)) return { skip: "person", name: c.name };
  if (signal === "weak") employer.personLike = true;
  return { status, employer, ym };
}

function isOutcome(g: unknown): g is RowOutcome {
  return typeof g === "object" && g !== null && ("skip" in g || "filing" in g);
}

export function lcaOutcome(row: Record<string, string>, ctx: LoadContext): RowOutcome {
  const g = gate(
    {
      name: (row.EMPLOYER_NAME ?? "").trim(),
      tradeName: blankToNull(row.TRADE_NAME_DBA),
      fein: cleanFein(row.EMPLOYER_FEIN),
      state: blankToNull(row.EMPLOYER_STATE),
      statusText: row.CASE_STATUS ?? "",
      date: (row.DECISION_DATE ?? "").trim(),
    },
    lcaStatus,
    ctx,
    validVisa(row.VISA_CLASS ?? ""),
  );
  if (isOutcome(g)) return g;
  const workers = count(row.TOTAL_WORKER_POSITIONS);
  return {
    filing: {
      program: "lca",
      ...g.ym,
      status: g.status,
      employer: g.employer,
      role: ctx.roles.us(row.JOB_TITLE ?? "", row.SOC_CODE ?? ""),
      place: ctx.places.us(blankToNull(row.WORKSITE_COUNTY), blankToNull(row.WORKSITE_STATE), cleanZip(row.WORKSITE_POSTAL_CODE)),
      annualPay: pay(row.WAGE_RATE_OF_PAY_FROM, row.WAGE_UNIT_OF_PAY),
      lca: {
        visaClass: (row.VISA_CLASS ?? "").trim().toUpperCase(),
        workers: workers > 0 ? workers : 1,
        newHires: count(row.NEW_EMPLOYMENT) + count(row.NEW_CONCURRENT_EMPLOYMENT),
        changeEmployer: count(row.CHANGE_EMPLOYER),
        continuing: count(row.CONTINUED_EMPLOYMENT) + count(row.CHANGE_PREVIOUS_EMPLOYMENT) + count(row.AMENDED_PETITION),
        level: wageLevel(row.PW_WAGE_LEVEL ?? ""),
      },
    },
  };
}

export function permOutcome(row: Record<string, string>, ctx: LoadContext): RowOutcome {
  const g = gate(
    {
      name: (row.EMP_BUSINESS_NAME ?? "").trim(),
      tradeName: blankToNull(row.EMP_TRADE_NAME),
      fein: cleanFein(row.EMP_FEIN),
      state: blankToNull(row.EMP_STATE),
      statusText: row.CASE_STATUS ?? "",
      date: (row.DECISION_DATE ?? "").trim(),
    },
    permStatus,
    ctx,
    true,
  );
  if (isOutcome(g)) return g;
  return {
    filing: {
      program: "perm",
      ...g.ym,
      status: g.status,
      employer: g.employer,
      role: ctx.roles.us(row.JOB_TITLE ?? "", row.PWD_SOC_CODE ?? ""),
      place: ctx.places.us(
        blankToNull(row.PRIMARY_WORKSITE_COUNTY),
        blankToNull(row.PRIMARY_WORKSITE_STATE),
        cleanZip(row.PRIMARY_WORKSITE_POSTAL_CODE),
      ),
      annualPay: pay(row.JOB_OPP_WAGE_FROM, row.JOB_OPP_WAGE_PER),
    },
  };
}

export function mapLcaRow(row: Record<string, string>, ctx: LoadContext): UsFiling | null {
  const o = lcaOutcome(row, ctx);
  return "filing" in o ? o.filing : null;
}

export function mapPermRow(row: Record<string, string>, ctx: LoadContext): UsFiling | null {
  const o = permOutcome(row, ctx);
  return "filing" in o ? o.filing : null;
}

/** `stats` is filled in as `rows` is iterated, so read it after the iteration finishes. */
export function loadUs(
  source: "lca" | "perm",
  path: string,
  ctx: LoadContext,
): { rows: AsyncIterable<UsFiling>; stats: LoadStats } {
  const stats: LoadStats = { read: 0, kept: 0, skippedPerson: 0, skippedInvalid: 0 };
  const outcome = source === "lca" ? lcaOutcome : permOutcome;
  async function* rows(): AsyncGenerator<UsFiling> {
    for await (const row of readRows(path, EXPECTED_COLUMNS[source])) {
      stats.read++;
      const o = outcome(row, ctx);
      if ("filing" in o) {
        stats.kept++;
        yield o.filing;
      } else if (o.skip === "person") stats.skippedPerson++;
      else stats.skippedInvalid++;
    }
  }
  return { rows: rows(), stats };
}
