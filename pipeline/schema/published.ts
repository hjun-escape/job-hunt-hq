// Zod schemas for every published JSON file (schema v1, additive changes only).
import { z } from "zod";
import type { SourceFile, YearSelection } from "../sources";
import { ProfileSchema } from "./profile";

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();

const Country = z.enum(["US", "CA"]);

export const PayStats = z.strictObject({ n: count, p25: amount, median: amount, p75: amount });
export type PayStats = z.infer<typeof PayStats>;

/** place is `all`, a region, or a metro. role is `all` or a role id. */
export const UsCell = z.strictObject({
  role: z.string(),
  place: z.string(),
  filings: count,
  denied: count,
  withdrawn: count,
  workers: count.optional(),
  newHires: count.optional(),
  changeEmployer: count.optional(),
  continuing: count.optional(),
  // Partial: only wage levels with a count above 0 appear.
  levels: z.partialRecord(z.enum(["I", "II", "III", "IV", "N/A"]), count).optional(),
  pay: PayStats.optional(),
});
export type UsCell = z.infer<typeof UsCell>;

export const CaCell = z.strictObject({
  role: z.string(),
  place: z.string(),
  lmias: count,
  positions: count,
  streams: z.record(z.string(), count),
});
export type CaCell = z.infer<typeof CaCell>;

/**
 * One year of data for one program. `through` is in the unit of the `months` array:
 * fiscal months for US blocks (12 entries), quarters for Canadian blocks (4 entries).
 */
const yearBlock = <C extends z.ZodType>(cell: C) =>
  z.union([
    z.strictObject({
      year: count,
      partial: z.boolean(),
      through: count.optional(),
      months: z.array(count).optional(),
      total: cell,
      cells: z.array(cell),
    }),
    z.strictObject({
      year: count,
      partial: z.boolean(),
      through: count.optional(),
      tooFew: z.literal(true),
    }),
  ]);

export const YearBlockUs = yearBlock(UsCell);
export type YearBlockUs = z.infer<typeof YearBlockUs>;
export const YearBlockCa = yearBlock(CaCell);
export type YearBlockCa = z.infer<typeof YearBlockCa>;

export const Trend = z.strictObject({
  from: count,
  to: count,
  period: z.enum(["full", "ytd"]),
  through: count.optional(),
  change: z.number(),
});
export type Trend = z.infer<typeof Trend>;

export const TrendPair = z.strictObject({ full: Trend.nullable(), ytd: Trend.nullable() });
export type TrendPair = z.infer<typeof TrendPair>;

export const Sponsorship = z.strictObject({
  lca: z.array(YearBlockUs).optional(),
  perm: z.array(YearBlockUs).optional(),
  lmia: z.array(YearBlockCa).optional(),
  trends: z.strictObject({
    lca: TrendPair.optional(),
    perm: TrendPair.optional(),
    lmia: TrendPair.optional(),
  }),
});
export type Sponsorship = z.infer<typeof Sponsorship>;

export const IndexEntry = z.strictObject({
  id: z.string(),
  name: z.string(),
  also: z.array(z.string()).optional(),
  c: z.array(Country),
  h: count,
  p: z.string().optional(),
});
export type IndexEntry = z.infer<typeof IndexEntry>;

export const EmployerFile = z.strictObject({
  id: z.string(),
  name: z.string(),
  also: z.array(z.string()).optional(),
  countries: z.array(Country),
  region: z.string().optional(),
  sponsorship: Sponsorship,
});
export type EmployerFile = z.infer<typeof EmployerFile>;

export const CompanyFile = z.strictObject({
  profile: ProfileSchema,
  legalNames: z.array(z.string()),
  sponsorship: Sponsorship,
});
export type CompanyFile = z.infer<typeof CompanyFile>;

export const ReverseFile = z.strictObject({
  country: Country,
  role: z.string(),
  year: count,
  places: z.record(z.string(), z.array(z.strictObject({ id: z.string(), name: z.string(), n: count }))),
});
export type ReverseFile = z.infer<typeof ReverseFile>;

const countsByYear = z.record(z.string(), count);
export const Totals = z.strictObject({ lca: countsByYear, perm: countsByYear, lmia: countsByYear });
export type Totals = z.infer<typeof Totals>;

export const Report = z.strictObject({
  unprofiledTop: z.array(z.strictObject({ id: z.string(), name: z.string(), headline: count })),
  proposals: z.array(
    z.strictObject({ profile: z.string(), id: z.string(), name: z.string(), headline: count }),
  ),
});
export type Report = z.infer<typeof Report>;

const YearSelectionSchema: z.ZodType<YearSelection> = z.strictObject({
  complete: z.array(count),
  partial: z.strictObject({ year: count, through: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).optional(),
});

const SourceEntry: z.ZodType<Omit<SourceFile, "path">> = z.strictObject({
  source: z.enum(["lca", "perm", "lmia", "cbsa", "gaf"]),
  year: count.optional(),
  quarter: count.optional(),
  url: z.string(),
  sha256: z.string(),
  bytes: count,
  fetchedAt: z.string(),
});

export const Meta = z.strictObject({
  schemaVersion: z.literal(1),
  builtAt: z.string(),
  years: z.strictObject({ lca: YearSelectionSchema, perm: YearSelectionSchema, lmia: YearSelectionSchema }),
  sources: z.array(SourceEntry),
  totals: Totals,
  warnings: z.array(z.string()),
  caveats: z.strictObject({ lca: z.string(), perm: z.string(), lmia: z.string(), general: z.string() }),
  licences: z.strictObject({ code: z.string(), profiles: z.string(), us: z.string(), ca: z.string() }),
  roles: z.record(z.string(), z.string()),
  places: z.record(z.string(), z.string()),
});
export type Meta = z.infer<typeof Meta>;
