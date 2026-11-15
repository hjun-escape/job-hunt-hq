// Internal record types shared by the loaders, aggregation and build steps.

export const COUNTRIES = ["US", "CA"] as const;
export type Country = (typeof COUNTRIES)[number];
export type CaseStatus = "certified" | "denied" | "withdrawn";
export const WAGE_LEVELS = ["I", "II", "III", "IV", "N/A"] as const;
export type WageLevel = (typeof WAGE_LEVELS)[number];

/** metro is `cbsa:<code>` or `cma:<code>`. region is `US-<ST>`, `CA-<PR>`, or `US` / `CA` when unknown. */
export type Place = { metro: string | null; region: string };

export type UsFiling = {
  program: "lca" | "perm";
  year: number;
  month: number;
  status: CaseStatus;
  employer: { fein: string | null; name: string; tradeName: string | null; state: string | null; personLike?: true };
  role: string;
  place: Place;
  annualPay: number | null;
  lca?: {
    visaClass: string;
    workers: number;
    newHires: number;
    changeEmployer: number;
    continuing: number;
    level: WageLevel;
  };
};

export type CaApproval = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  employer: { name: string; province: string };
  stream: string;
  role: string;
  place: Place;
  lmias: number;
  positions: number;
};

export type LoadStats = { read: number; kept: number; skippedPerson: number; skippedInvalid: number };
