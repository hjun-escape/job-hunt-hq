// Totals checks: this build against the previous (live) build, and against the government's own published
// statistics. Totals are yearly sums over all owners, never one employer's numbers, so messages may show them.
import type { YearPlans } from "../aggregate/accumulate";
import type { Totals } from "../schema/published";

/** A complete year may move by at most this share between builds; a published figure may differ by as much. */
export const TOLERANCE = 0.02;

const PROGRAMS = ["lca", "perm", "lmia"] as const;
const WHAT: Record<(typeof PROGRAMS)[number], string> = {
  lca: "certified LCA filings",
  perm: "certified PERM filings",
  lmia: "approved LMIAs",
};

const has = (r: Partial<Record<string, number>> | undefined, k: string) =>
  r !== undefined && Object.prototype.hasOwnProperty.call(r, k) && typeof r[k] === "number";
const pct = (from: number, to: number) => (from === 0 ? "from 0" : `${((Math.abs(to - from) / from) * 100).toFixed(1)}%`);
const moved = (from: number, to: number) => Math.abs(to - from) > TOLERANCE * from;

/**
 * Problems with this build's totals against the previous build's. Only year keys present in both are
 * compared. A year complete in `plan` (and, when given, in the previous build's `prevPlan`) that moves more
 * than TOLERANCE either way is a problem. Any other year in both (partial now, or partial last time and
 * complete now) may grow but must not fall. `prev` null (a first build) gives none.
 *
 * With `prevPlan`, a year complete in the previous build but not complete in `plan` is a problem too (one
 * missing cached quarter would otherwise drop a whole year silently). The only exception is the window rolling
 * forward: a year older than `plan`'s oldest complete year, and only when `plan`'s newest complete year is newer
 * than the previous build's and `plan` has at least as many complete years (so a roll-off cannot hide a lost year).
 */
export function compareTotals(prev: Totals | null, next: Totals, plan: YearPlans, prevPlan?: YearPlans): string[] {
  if (prev === null) return [];
  const problems: string[] = [];
  for (const p of PROGRAMS) {
    for (const year of Object.keys(next[p]).sort()) {
      if (!has(prev[p], year)) continue;
      const from = prev[p][year]!;
      const to = next[p][year]!;
      const y = Number(year);
      const complete = plan[p].complete.includes(y) && (prevPlan === undefined || prevPlan[p].complete.includes(y));
      if (complete && moved(from, to)) {
        problems.push(
          `${p} ${year}: total ${WHAT[p]} moved from ${from} to ${to} (${pct(from, to)}), more than the ` +
            `${TOLERANCE * 100}% allowed for a complete year since the last build`,
        );
      } else if (!complete && to < from) {
        problems.push(`${p} ${year}: total ${WHAT[p]} fell from ${from} to ${to} in a year that is still filling in`);
      }
    }
    if (!prevPlan) continue;
    const now = plan[p].complete;
    const before = prevPlan[p].complete;
    // A year rolls off only when a newer complete year arrived and the window kept its length; with no complete
    // year now, nothing rolls off.
    const movedForward =
      now.length > 0 && before.length > 0 && now.length >= before.length && Math.max(...now) > Math.max(...before);
    const oldest = movedForward ? Math.min(...now) : -Infinity;
    for (const year of [...before].sort((a, b) => a - b)) {
      if (now.includes(year) || year < oldest) continue;
      problems.push(
        `${p} ${year}: complete in the live build but not complete in this one; a cached quarter may be missing, ` +
          "so the year would be dropped",
      );
    }
  }
  return problems;
}

/**
 * Warning lines where this build's totals are more than TOLERANCE from the government's published statistics
 * for the same program and year. Years and programs `published` leaves out are skipped.
 */
export function compareWithPublished(next: Totals, published: Partial<Totals>): string[] {
  const warnings: string[] = [];
  for (const p of PROGRAMS) {
    const pub = published[p];
    if (!pub) continue;
    for (const year of Object.keys(pub).sort()) {
      if (!has(pub, year) || !has(next[p], year)) continue;
      const theirs = pub[year]!;
      const ours = next[p][year]!;
      if (moved(theirs, ours)) {
        warnings.push(
          `${p} ${year}: ${ours} ${WHAT[p]} here against ${theirs} in the government's published statistics ` +
            `(${pct(theirs, ours)} apart)`,
        );
      }
    }
  }
  return warnings;
}
