// Zod schemas for every published JSON file (schema v1, additive changes only).
// Plain z.object (unknown keys stripped, not rejected) so a later additive field never fails an older consumer.
import { z } from "zod";
import type { SourceFile, YearSelection } from "../sources";
import { COUNTRIES, WAGE_LEVELS } from "../types";
import { ProfileSchema } from "./profile";

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();

const Country = z.enum(COUNTRIES);

export const PayStats = z.object({ n: count, p25: amount, median: amount, p75: amount });
export type PayStats = z.infer<typeof PayStats>;

/** place is `all`, a region, or a metro. role is `all` or a role id. */
export const UsCell = z.object({
  role: z.string(),
  place: z.string(),
  filings: count,
  // Cells carry role, place, filings, workers (LCA) and pay only. Totals carry the sub-counts below, each
  // omitted under 3 (withheld, or zero).
  denied: count.optional(),
  withdrawn: count.optional(),
  workers: count.optional(),
  newHires: count.optional(),
  changeEmployer: count.optional(),
  continuing: count.optional(),
  // Partial: only wage levels with a count above 0 appear.
  levels: z.partialRecord(z.enum(WAGE_LEVELS), count).optional(),
  pay: PayStats.optional(),
});
export type UsCell = z.infer<typeof UsCell>;

export const CaCell = z.object({
  role: z.string(),
  place: z.string(),
  lmias: count,
  positions: count,
  // Totals only; cells carry no streams.
  streams: z.record(z.string(), count).optional(),
});
export type CaCell = z.infer<typeof CaCell>;

/**
 * One year of data for one program. `through` is in the unit of the `months` array:
 * fiscal months for US blocks (12 entries), quarters for Canadian blocks (4 entries).
 */
const yearBlock = <C extends z.ZodType>(cell: C, slots: number) =>
  z.union([
    z.object({
      year: count,
      partial: z.boolean(),
      through: z.number().int().min(1).max(slots).optional(),
      months: z.array(count).length(slots).optional(),
      total: cell,
      cells: z.array(cell),
    }),
    z.object({
      year: count,
      partial: z.boolean(),
      through: z.number().int().min(1).max(slots).optional(),
      tooFew: z.literal(true),
    }),
  ]);

export const YearBlockUs = yearBlock(UsCell, 12);
export type YearBlockUs = z.infer<typeof YearBlockUs>;
export const YearBlockCa = yearBlock(CaCell, 4);
export type YearBlockCa = z.infer<typeof YearBlockCa>;

export const Trend = z.object({
  from: count,
  to: count,
  period: z.enum(["full", "ytd"]),
  through: count.optional(),
  change: z.number(),
});
export type Trend = z.infer<typeof Trend>;

export const TrendPair = z.object({ full: Trend.nullable(), ytd: Trend.nullable() });
export type TrendPair = z.infer<typeof TrendPair>;

export const Sponsorship = z.object({
  lca: z.array(YearBlockUs).optional(),
  perm: z.array(YearBlockUs).optional(),
  lmia: z.array(YearBlockCa).optional(),
  trends: z.object({
    lca: TrendPair.optional(),
    perm: TrendPair.optional(),
    lmia: TrendPair.optional(),
  }),
});
export type Sponsorship = z.infer<typeof Sponsorship>;

export const IndexEntry = z.object({
  id: z.string(),
  name: z.string(),
  also: z.array(z.string()).optional(),
  c: z.array(Country),
  h: count,
  p: z.string().optional(),
});
export type IndexEntry = z.infer<typeof IndexEntry>;

export const EmployerFile = z.object({
  id: z.string(),
  name: z.string(),
  also: z.array(z.string()).optional(),
  countries: z.array(Country),
  region: z.string().optional(),
  sponsorship: Sponsorship,
});
export type EmployerFile = z.infer<typeof EmployerFile>;

export const CompanyFile = z.object({
  profile: ProfileSchema,
  legalNames: z.array(z.string()),
  sponsorship: Sponsorship,
});
export type CompanyFile = z.infer<typeof CompanyFile>;

export const ReverseFile = z.object({
  country: Country,
  role: z.string(),
  year: count,
  places: z.record(z.string(), z.array(z.object({ id: z.string(), name: z.string(), n: count }))),
});
export type ReverseFile = z.infer<typeof ReverseFile>;

const countsByYear = z.record(z.string(), count);
export const Totals = z.object({ lca: countsByYear, perm: countsByYear, lmia: countsByYear });
export type Totals = z.infer<typeof Totals>;

export const Report = z.object({
  unprofiledTop: z.array(z.object({ id: z.string(), name: z.string(), headline: count })),
  proposals: z.array(
    z.object({ profile: z.string(), id: z.string(), name: z.string(), headline: count }),
  ),
});
export type Report = z.infer<typeof Report>;

const YearSelectionSchema: z.ZodType<YearSelection> = z.object({
  complete: z.array(count),
  partial: z.object({ year: count, through: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).optional(),
});

const SourceEntry: z.ZodType<Omit<SourceFile, "path">> = z.object({
  source: z.enum(["lca", "perm", "lmia", "cbsa", "gaf"]),
  year: count.optional(),
  quarter: z.number().int().min(1).max(4).optional(),
  url: z.string(),
  sha256: z.string(),
  bytes: count,
  fetchedAt: z.iso.datetime(),
});

export const Meta = z.object({
  schemaVersion: z.literal(1),
  builtAt: z.iso.datetime(),
  years: z.object({ lca: YearSelectionSchema, perm: YearSelectionSchema, lmia: YearSelectionSchema }),
  sources: z.array(SourceEntry),
  totals: Totals,
  warnings: z.array(z.string()),
  caveats: z.object({ lca: z.string(), perm: z.string(), lmia: z.string(), general: z.string() }),
  licences: z.object({ code: z.string(), profiles: z.string(), us: z.string(), ca: z.string() }),
  roles: z.record(z.string(), z.string()),
  places: z.record(z.string(), z.string()),
});
export type Meta = z.infer<typeof Meta>;
