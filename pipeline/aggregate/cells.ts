// Breakdown cells: pay statistics and the small-cell roll-up (the privacy rule for published breakdowns).
import type { PayStats } from "../schema/published";

const round1000 = (v: number) => Math.round(v / 1000) * 1000;

/**
 * Quartiles by linear interpolation between ranks (position p * (n - 1), the numpy default),
 * each rounded to the nearest 1,000. Undefined below 3 values.
 */
export function payStats(values: number[]): PayStats | undefined {
  const n = values.length;
  if (n < 3) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return round1000(s[lo] + (s[hi] - s[lo]) * (pos - lo));
  };
  return { n, p25: at(0.25), median: at(0.5), p75: at(0.75) };
}

/** A breakdown cell before publishing. `count` is what the minimum applies to; callers add their own sums. */
export type RawCell = { role: string; metro: string | null; region: string; count: number };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Cells sharing a key, in first-seen order. */
function groupBy<T extends RawCell>(cells: T[], key: (c: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const c of cells) {
    const k = key(c);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  return [...groups.values()];
}

/** One cell from its parts, labelled with the given role, metro and region. */
function mergeAll<T extends RawCell>(
  parts: T[],
  merge: (a: T, b: T) => T,
  label: Pick<RawCell, "role" | "metro" | "region">,
): T {
  const merged = parts.length === 1 ? parts[0] : parts.reduce((a, b) => merge(a, b));
  return { ...merged, ...label };
}

const sum = (parts: RawCell[]) => parts.reduce((n, c) => n + c.count, 0);

/**
 * Coarsens cells under `min` from (role, metro) to (role, region) to (all, region); whatever is still
 * under `min` is left out and appears only in the total. A null metro starts at (role, region).
 * A metro that spans regions is one cell; when it is under `min`, each region's part moves to its own
 * region. Output cells are disjoint and sorted by role, then published place (metro, else region).
 */
export function rollUp<T extends RawCell>(cells: T[], merge: (a: T, b: T) => T, min = 3): T[] {
  const kept: T[] = [];
  const regional: T[] = cells.filter((c) => c.metro === null);

  for (const parts of groupBy(cells.filter((c) => c.metro !== null), (c) => `${c.role}\u0000${c.metro}`)) {
    if (sum(parts) >= min) {
      const region = parts.map((p) => p.region).sort(cmp)[0];
      kept.push(mergeAll(parts, merge, { role: parts[0].role, metro: parts[0].metro, region }));
    } else {
      for (const p of parts) regional.push({ ...p, metro: null });
    }
  }

  const allRoles: T[] = [];
  for (const parts of groupBy(regional, (c) => `${c.role}\u0000${c.region}`)) {
    const cell = mergeAll(parts, merge, { role: parts[0].role, metro: null, region: parts[0].region });
    if (cell.count >= min) kept.push(cell);
    else allRoles.push({ ...cell, role: "all" });
  }

  for (const parts of groupBy(allRoles, (c) => c.region)) {
    const cell = mergeAll(parts, merge, { role: "all", metro: null, region: parts[0].region });
    if (cell.count >= min) kept.push(cell);
  }

  return kept.sort((a, b) => cmp(a.role, b.role) || cmp(a.metro ?? a.region, b.metro ?? b.region));
}
