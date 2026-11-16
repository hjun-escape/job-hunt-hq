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
  /** personLike: the name reads as two people joined by AND or & (R48); Canada needs no other person test. */
  employer: { name: string; province: string; personLike?: true };
  stream: string;
  role: string;
  place: Place;
  lmias: number;
  positions: number;
};

export type LoadStats = {
  read: number;
  kept: number;
  skippedPerson: number;
  skippedInvalid: number;
  /** skippedInvalid by reason, such as "status", "email in name" or "name was only a number". */
  invalid: Record<string, number>;
  /** Kept rows whose trade name was blanked: it held an email, was only a FEIN-shaped number, filler or a street address. */
  tradeNamesBlanked: number;
  /**
   * LCA only (R43): "Certified - Withdrawn" rows left out because they relist a case certified in an earlier
   * quarter, either seen earlier in this build or received more than 14 days before the file's quarter.
   */
  skippedRelisted?: number;
};

export const emptyLoadStats = (): LoadStats => ({
  read: 0,
  kept: 0,
  skippedPerson: 0,
  skippedInvalid: 0,
  invalid: {},
  tradeNamesBlanked: 0,
});
