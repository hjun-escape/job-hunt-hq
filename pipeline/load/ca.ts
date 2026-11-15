// Maps rows of the positive LMIA employers list into CaApproval records. The Address column is read only to
// find the city and province; the street line and postal code never leave mapLmiaRow. Employer names are
// cleaned as in the US loader: an email skips the row (R34) and FEIN-shaped numbers, which include 9-digit
// business numbers, are removed (R35). A numbered-company name such as "101234567 Saskatchewan Ltd." keeps its
// number (R37): it is the registered name. An address appended to the name ("ACME LTD, 100 KING ST W, TORONTO")
// is removed (R46). The list has no trade name column.
import path from "node:path";
import { EMAIL } from "../check/text-scan";
import { emptyLoadStats, type CaApproval, type LoadStats } from "../types";
import { EXPECTED_COLUMNS } from "../sources";
import { stripFeinTokens, stripTrailingAddress } from "../normalize/names";
import { caProvinceCode, parseCaAddress } from "../normalize/places";
import { readRows } from "./rows";
import type { LoadContext } from "./us";

type Period = { year: number; quarter: 1 | 2 | 3 | 4 };

const PERIOD_YEAR_FIRST = /(?<!\d)(20\d{2})[ _-]?q([1-4])(?!\d)/i;
const PERIOD_QUARTER_FIRST = /(?<![a-z0-9])q([1-4])[ _-]?(20\d{2})(?!\d)/i;

/** Year and quarter from a file name such as tfwp_2026q2_pos_en.xlsx. Only the base name is read. */
export function lmiaPeriodFromName(name: string): Period | null {
  const base = path.basename(name);
  const a = PERIOD_YEAR_FIRST.exec(base);
  if (a) return { year: Number(a[1]), quarter: Number(a[2]) as Period["quarter"] };
  const b = PERIOD_QUARTER_FIRST.exec(base);
  if (b) return { year: Number(b[2]), quarter: Number(b[1]) as Period["quarter"] };
  return null;
}

/** A count cell as a non-negative integer, commas stripped. Blank is 0; anything else non-numeric is null. */
function parseCount(s: string | undefined): number | null {
  const t = (s ?? "").replace(/,/g, "").trim();
  if (t === "") return 0;
  if (!/^\d+(\.0+)?$/.test(t)) return null;
  return Math.floor(Number(t));
}

export type CaInvalidReason = "counts" | "email in name" | "name was only an address" | "name was only a number";
type Outcome = { approval: CaApproval } | { skip: "footnote" } | { skip: "invalid"; reason: CaInvalidReason };

function lmiaOutcome(row: Record<string, string>, ctx: LoadContext, period: Period): Outcome {
  const name = (row.Employer ?? "").trim();
  if (name === "") return { skip: "footnote" };
  const lmias = parseCount(row["Approved LMIAs"]);
  const positions = parseCount(row["Approved Positions"]);
  if (lmias === 0 && positions === 0) return { skip: "footnote" };
  if (lmias === null || positions === null) return { skip: "invalid", reason: "counts" };
  if (EMAIL.test(name)) return { skip: "invalid", reason: "email in name" };
  const unaddressed = stripTrailingAddress(name);
  if (unaddressed === "") return { skip: "invalid", reason: "name was only an address" };
  const employer = stripFeinTokens(unaddressed);
  if (employer === "") return { skip: "invalid", reason: "name was only a number" };

  const parsed = parseCaAddress(row.Address ?? "");
  const province = parsed.province ?? caProvinceCode((row["Province/Territory"] ?? "").trim() || null);
  const noc = /(?<!\d)(\d{5})(?!\d)/.exec(row.Occupation ?? "")?.[1] ?? "";
  return {
    approval: {
      year: period.year,
      quarter: period.quarter,
      employer: { name: employer, province: province ?? "" },
      stream: (row["Program Stream"] ?? "").trim(),
      role: ctx.roles.ca(noc),
      place: province ? ctx.places.ca(parsed.city, province) : { metro: null, region: "CA" },
      lmias,
      positions,
    },
  };
}

export function mapLmiaRow(row: Record<string, string>, ctx: LoadContext, period: Period): CaApproval | null {
  const o = lmiaOutcome(row, ctx, period);
  return "approval" in o ? o.approval : null;
}

/** `stats` is filled in as `rows` is iterated, so read it after the iteration finishes. */
export function loadCa(
  file: string,
  period: Period,
  ctx: LoadContext,
): { rows: AsyncIterable<CaApproval>; stats: LoadStats } {
  const stats: LoadStats = emptyLoadStats();
  async function* rows(): AsyncGenerator<CaApproval> {
    for await (const row of readRows(file, EXPECTED_COLUMNS.lmia)) {
      stats.read++;
      const o = lmiaOutcome(row, ctx, period);
      if ("approval" in o) {
        stats.kept++;
        yield o.approval;
      } else if (o.skip === "invalid") {
        stats.skippedInvalid++;
        stats.invalid[o.reason] = (stats.invalid[o.reason] ?? 0) + 1;
      }
    }
  }
  return { rows: rows(), stats };
}
