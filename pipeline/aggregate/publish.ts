// What a published year block shows. Cells (role x place) carry counts and pay only, so nothing can be
// subtracted across them. Totals carry the sub-counts; an exact-sum group with any member of 1 or 2 is
// withheld whole. Months count the headline (filings, or positions in Canada), which is always shown, and are
// published only without an entry of 1 or 2. Trends rest on published values only.
import type { CaCell, TrendPair, UsCell } from "../schema/published";
import { WAGE_LEVELS } from "../types";
import { SUB_MIN } from "./cells";
import { publishedHeadline, trend, type YearBlock } from "./trend";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The members of one exact-sum group that may be published, in the given order. When any member is 1 or 2
 * (non-zero and under SUB_MIN), the whole group is withheld: if only some were, the known sum, the shown
 * members and this public rule itself could pin the hidden values. Otherwise members from SUB_MIN are shown
 * and zeros are left out.
 */
export function publishable<K extends string>(group: [K, number][]): [K, number][] {
  if (group.some(([, n]) => n > 0 && n < SUB_MIN)) return [];
  return group.filter(([, n]) => n >= SUB_MIN);
}

const atLeastMin = (n: number | undefined): n is number => n !== undefined && n >= SUB_MIN;

/**
 * A US total as published. denied and withdrawn appear only from SUB_MIN. For LCA, the worker split
 * (newHires, changeEmployer, continuing, known together through workers) and the wage levels (which sum to
 * filings) each go through `publishable`. A total without `workers` is PERM and gets no LCA keys.
 */
export function withholdUs(total: UsCell): UsCell {
  const out: UsCell = { role: total.role, place: total.place, filings: total.filings };
  if (atLeastMin(total.denied)) out.denied = total.denied;
  if (atLeastMin(total.withdrawn)) out.withdrawn = total.withdrawn;
  if (total.workers !== undefined) {
    out.workers = total.workers;
    const split = publishable<"newHires" | "changeEmployer" | "continuing">([
      ["newHires", total.newHires ?? 0],
      ["changeEmployer", total.changeEmployer ?? 0],
      ["continuing", total.continuing ?? 0],
    ]);
    for (const [k, n] of split) out[k] = n;
    out.levels = Object.fromEntries(publishable(WAGE_LEVELS.map((l) => [l, total.levels?.[l] ?? 0])));
  }
  if (total.pay) out.pay = total.pay;
  return out;
}

/** A Canadian total as published: the streams (which sum to positions) go through `publishable`. */
export function withholdCa(total: CaCell): CaCell {
  const raw = total.streams ?? {};
  const streams = Object.fromEntries(publishable(Object.keys(raw).sort(cmp).map((k) => [k, raw[k]])));
  return { role: total.role, place: total.place, lmias: total.lmias, positions: total.positions, streams };
}

/** A US cell as published: role, place, filings, workers (LCA only) and pay (from PAY_MIN values). */
export function cellUs(c: UsCell): UsCell {
  const out: UsCell = { role: c.role, place: c.place, filings: c.filings };
  if (c.workers !== undefined) out.workers = c.workers;
  if (c.pay) out.pay = c.pay;
  return out;
}

/** A Canadian cell as published: role, place, lmias and positions. */
export function cellCa(c: CaCell): CaCell {
  return { role: c.role, place: c.place, lmias: c.lmias, positions: c.positions };
}

/**
 * The block as published. `months` is kept only when no entry is 1 or 2. They sum to the headline (certified
 * filings, or approved positions in Canada), which the total always shows, so their sum gives nothing away.
 */
function publishBlock<C>(b: YearBlock<C>, total: (c: C) => C, cell: (c: C) => C): YearBlock<C> {
  if ("tooFew" in b) return b;
  const shown = total(b.total);
  const months = b.months && b.months.every((n) => n === 0 || n >= SUB_MIN);
  return {
    year: b.year,
    partial: b.partial,
    ...(b.through !== undefined ? { through: b.through } : {}),
    ...(months ? { months: b.months } : {}),
    total: shown,
    cells: b.cells.map(cell),
  };
}

export type Published<C> = { blocks: YearBlock<C>[]; trend: TrendPair };

/** US blocks (raw sums in, as published out) and their trends, computed from the published values only. */
export function publishUs(p: "lca" | "perm", raw: YearBlock<UsCell>[]): Published<UsCell> {
  const blocks = raw.map((b) => publishBlock(b, withholdUs, cellUs));
  return { blocks, trend: trend(blocks, (t) => publishedHeadline(p, t)) };
}

/** Canadian blocks (raw sums in, as published out) and their trends, computed from the published values only. */
export function publishCa(raw: YearBlock<CaCell>[]): Published<CaCell> {
  const blocks = raw.map((b) => publishBlock(b, withholdCa, cellCa));
  return { blocks, trend: trend(blocks, (t) => publishedHeadline("lmia", t)) };
}
