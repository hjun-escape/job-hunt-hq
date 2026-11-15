// Headlines and year-over-year trends. One headline definition serves blocks, trends, the report and the index.
import type { CaCell, Sponsorship, Trend, TrendPair, UsCell } from "../schema/published";

export type Program = "lca" | "perm" | "lmia";

/** One year of one program, as published. `through` and `months` are in the same unit (fiscal months or quarters). */
export type YearBlock<C> =
  | { year: number; partial: boolean; through?: number; months?: number[]; total: C; cells: C[] }
  | { year: number; partial: boolean; through?: number; tooFew: true };

/** LCA: new hires plus changes of employer. PERM: certified filings. LMIA: approved positions. */
export function headlineOf(program: Program, total: UsCell | CaCell): number {
  if (program === "lmia") return (total as CaCell).positions;
  const t = total as UsCell;
  return program === "perm" ? t.filings : (t.newHires ?? 0) + (t.changeEmployer ?? 0);
}

/** The headline of one year's block, or 0 when that block is missing or tooFew. */
export function headlineFor(s: Sponsorship, program: Program, year: number): number {
  const blocks: YearBlock<UsCell | CaCell>[] = s[program] ?? [];
  const b = blocks.find((x) => x.year === year);
  return b && !("tooFew" in b) ? headlineOf(program, b.total) : 0;
}

function compare(
  from: number,
  to: number,
  a: number,
  b: number,
  period: Trend["period"],
  through?: number,
): Trend | null {
  if (a === 0) return null;
  return { from, to, period, ...(through !== undefined ? { through } : {}), change: (b - a) / a };
}

const sumFirst = (months: number[], n: number) => months.slice(0, n).reduce((x, y) => x + y, 0);

/**
 * `full` compares the latest complete year with the year before it; `ytd` compares the partial year's
 * first `through` entries of `months` with the same entries a year earlier. Each is null when the
 * earlier year has no block, either block is tooFew, or the earlier figure is 0. change = (to - from) / from.
 */
export function trend<C>(blocks: YearBlock<C>[], headline: (total: C) => number): TrendPair {
  const byYear = new Map(blocks.map((b) => [b.year, b]));
  const latest = blocks.filter((b) => !b.partial).sort((a, b) => b.year - a.year)[0];
  const current = blocks.find((b) => b.partial);

  let full: Trend | null = null;
  const before = latest && byYear.get(latest.year - 1);
  if (latest && before && !before.partial && !("tooFew" in latest) && !("tooFew" in before)) {
    full = compare(before.year, latest.year, headline(before.total), headline(latest.total), "full");
  }

  let ytd: Trend | null = null;
  const prev = current && byYear.get(current.year - 1);
  if (current && prev && !prev.partial && !("tooFew" in current) && !("tooFew" in prev)) {
    const n = current.through;
    if (n !== undefined && current.months && prev.months) {
      ytd = compare(prev.year, current.year, sumFirst(prev.months, n), sumFirst(current.months, n), "ytd", n);
    }
  }

  return { full, ytd };
}
