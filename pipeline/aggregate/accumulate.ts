// Per-owner accumulation of typed filings into published year blocks. Keeps running sums and pay values per
// breakdown cell, never whole filings. Applies the small-cell rule and the person-name privacy gate.
import type { CaCell, Sponsorship, Totals, UsCell } from "../schema/published";
import type { YearSelection } from "../sources";
import { WAGE_LEVELS, type CaApproval, type Country, type Place, type UsFiling } from "../types";
import { payStats, rollUp, type RawCell } from "./cells";
import { headlineOf, trend, type Program, type YearBlock } from "./trend";

/** Small-cell threshold: certified filings (US) or approved LMIAs (Canada). */
const MIN = 3;
/** An unprofiled owner named like a person is published only from this many certified US filings (R23 d). */
export const PERSON_LIKE_MIN_FILINGS = 10;

export type YearPlans = { lca: YearSelection; perm: YearSelection; lmia: YearSelection };
export type OwnerResult = {
  name: string;
  also: string[];
  countries: Country[];
  region: string | null;
  sponsorship: Sponsorship;
};

/** count = certified filings. LCA sums, levels (per WAGE_LEVELS entry) and pay cover certified filings only. */
type UsSums = RawCell & {
  denied: number;
  withdrawn: number;
  workers: number;
  newHires: number;
  changeEmployer: number;
  continuing: number;
  levels: number[];
  pay: number[];
};
/** count = approved LMIAs. streams = approved positions per Program Stream value, verbatim. */
type CaSums = RawCell & { positions: number; streams: Map<string, number> };

/** One program-year of one owner: its threshold count, headline per month (or quarter), cells and name tallies. */
type YearAcc<S> = {
  count: number;
  months: number[];
  cells: Map<string, S>;
  names: Map<string, number>;
  personLike: Set<string>;
  tradeNames: Map<string, number>;
  regions: Map<string, number>;
};
type OwnerAcc = {
  lca: Map<number, YearAcc<UsSums>>;
  perm: Map<number, YearAcc<UsSums>>;
  lmia: Map<number, YearAcc<CaSums>>;
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const bump = (m: Map<string, number>, key: string, n = 1) => m.set(key, (m.get(key) ?? 0) + n);
/** Keys by count, highest first, ties alphabetical. */
const ranked = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([k]) => k);
function tally(maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of maps) for (const [k, n] of m) bump(out, k, n);
  return out;
}

function yearAcc<S>(years: Map<number, YearAcc<S>>, year: number, slots: number): YearAcc<S> {
  let y = years.get(year);
  if (!y) {
    y = {
      count: 0,
      months: Array<number>(slots).fill(0),
      cells: new Map(),
      names: new Map(),
      personLike: new Set(),
      tradeNames: new Map(),
      regions: new Map(),
    };
    years.set(year, y);
  }
  return y;
}

function cellOf<S extends RawCell>(y: YearAcc<S>, role: string, place: Place, make: (base: RawCell) => S): S {
  const key = `${role}\u0000${place.metro ?? ""}\u0000${place.region}`;
  let c = y.cells.get(key);
  if (!c) {
    c = make({ role, metro: place.metro, region: place.region, count: 0 });
    y.cells.set(key, c);
  }
  return c;
}

function note(y: YearAcc<unknown>, name: string, tradeName: string | null, region: string | null, personLike: boolean) {
  bump(y.names, name);
  if (personLike) y.personLike.add(name);
  if (tradeName) bump(y.tradeNames, tradeName);
  if (region) bump(y.regions, region);
}

const newUs = (base: RawCell): UsSums => ({
  ...base,
  denied: 0,
  withdrawn: 0,
  workers: 0,
  newHires: 0,
  changeEmployer: 0,
  continuing: 0,
  levels: WAGE_LEVELS.map(() => 0),
  pay: [],
});
const newCa = (base: RawCell): CaSums => ({ ...base, positions: 0, streams: new Map() });

const mergeUs = (a: UsSums, b: UsSums): UsSums => ({
  role: a.role,
  metro: a.metro,
  region: a.region,
  count: a.count + b.count,
  denied: a.denied + b.denied,
  withdrawn: a.withdrawn + b.withdrawn,
  workers: a.workers + b.workers,
  newHires: a.newHires + b.newHires,
  changeEmployer: a.changeEmployer + b.changeEmployer,
  continuing: a.continuing + b.continuing,
  levels: a.levels.map((n, i) => n + b.levels[i]),
  pay: a.pay.concat(b.pay),
});
const mergeCa = (a: CaSums, b: CaSums): CaSums => ({
  role: a.role,
  metro: a.metro,
  region: a.region,
  count: a.count + b.count,
  positions: a.positions + b.positions,
  streams: tally([a.streams, b.streams]),
});

/** PERM cells carry no LCA keys. `levels` lists only wage levels with a count above 0. `pay` only from 3 values. */
function usCell(c: UsSums, role: string, place: string, lca: boolean): UsCell {
  const out: UsCell = { role, place, filings: c.count, denied: c.denied, withdrawn: c.withdrawn };
  if (lca) {
    out.workers = c.workers;
    out.newHires = c.newHires;
    out.changeEmployer = c.changeEmployer;
    out.continuing = c.continuing;
    const levels: NonNullable<UsCell["levels"]> = {};
    WAGE_LEVELS.forEach((level, i) => {
      if (c.levels[i] > 0) levels[level] = c.levels[i];
    });
    out.levels = levels;
  }
  const pay = payStats(c.pay);
  if (pay) out.pay = pay;
  return out;
}

function caCell(c: CaSums, role: string, place: string): CaCell {
  const streams: Record<string, number> = {};
  for (const k of [...c.streams.keys()].sort(cmp)) streams[k] = c.streams.get(k)!;
  return { role, place, lmias: c.count, positions: c.positions, streams };
}

/**
 * A published year block. `through` is in the unit of `months`: `perQuarter` is 3 for US fiscal months
 * and 1 for Canadian quarters. Under MIN the block is only { year, partial, through?, tooFew }.
 */
function block<S extends RawCell, C>(
  year: number,
  y: YearAcc<S>,
  sel: YearSelection,
  perQuarter: number,
  merge: (a: S, b: S) => S,
  publish: (c: S, role: string, place: string) => C,
): YearBlock<C> {
  const partial = sel.partial?.year === year;
  const head = { year, partial, ...(sel.partial && partial ? { through: sel.partial.through * perQuarter } : {}) };
  if (y.count < MIN) return { ...head, tooFew: true };
  const cells = [...y.cells.values()];
  return {
    ...head,
    months: [...y.months],
    total: publish(cells.reduce(merge), "all", "all"),
    cells: rollUp(cells, merge, MIN).map((c) => publish(c, c.role, c.metro ?? c.region)),
  };
}

function plannedYears(sel: YearSelection): number[] {
  return [...new Set([...sel.complete, ...(sel.partial ? [sel.partial.year] : [])])].sort((a, b) => a - b);
}

/** The owner's program-years inside the plan, by year. */
function inPlan<S>(years: Map<number, YearAcc<S>>, sel: YearSelection): [number, YearAcc<S>][] {
  return plannedYears(sel).flatMap((year) => {
    const y = years.get(year);
    return y ? [[year, y] as [number, YearAcc<S>]] : [];
  });
}

const PROGRAMS: Program[] = ["lca", "perm", "lmia"];

export function createAccumulator() {
  const owners = new Map<string, OwnerAcc>();
  const ownerAcc = (id: string): OwnerAcc => {
    let o = owners.get(id);
    if (!o) {
      o = { lca: new Map(), perm: new Map(), lmia: new Map() };
      owners.set(id, o);
    }
    return o;
  };

  function addUs(owner: string, f: UsFiling): void {
    const y = yearAcc(ownerAcc(owner)[f.program], f.year, 12);
    const e = f.employer;
    note(y, e.name, e.tradeName, e.state ? `US-${e.state}` : null, e.personLike === true);
    const c = cellOf(y, f.role, f.place, newUs);
    if (f.status === "denied") c.denied++;
    else if (f.status === "withdrawn") c.withdrawn++;
    else {
      c.count++;
      y.count++;
      if (f.annualPay !== null) c.pay.push(f.annualPay);
      if (f.program === "perm") y.months[f.month - 1] += 1;
      else if (f.lca) {
        c.workers += f.lca.workers;
        c.newHires += f.lca.newHires;
        c.changeEmployer += f.lca.changeEmployer;
        c.continuing += f.lca.continuing;
        c.levels[WAGE_LEVELS.indexOf(f.lca.level)]++;
        y.months[f.month - 1] += f.lca.newHires + f.lca.changeEmployer;
      }
    }
  }

  function addCa(owner: string, a: CaApproval): void {
    const y = yearAcc(ownerAcc(owner).lmia, a.year, 4);
    note(y, a.employer.name, null, a.employer.province ? `CA-${a.employer.province}` : null, false);
    const c = cellOf(y, a.role, a.place, newCa);
    c.count += a.lmias;
    y.count += a.lmias;
    c.positions += a.positions;
    bump(c.streams, a.stream, a.positions);
    y.months[a.quarter - 1] += a.positions;
  }

  /**
   * Year blocks per owner for the planned years, in sorted id order. `totals` sums certified filings (LCA,
   * PERM) and approved LMIAs per planned year over the kept owners, before roll-up. An unprofiled owner whose
   * display name is person-like and whose certified US filings total under PERSON_LIKE_MIN_FILINGS is dropped.
   */
  function finish(plan: YearPlans): { owners: Map<string, OwnerResult>; totals: Totals; droppedPersonLike: number } {
    const totals: Totals = { lca: {}, perm: {}, lmia: {} };
    for (const p of PROGRAMS) for (const year of plannedYears(plan[p])) totals[p][String(year)] = 0;
    const result = new Map<string, OwnerResult>();
    let droppedPersonLike = 0;

    for (const id of [...owners.keys()].sort(cmp)) {
      const o = owners.get(id)!;
      const lca = inPlan(o.lca, plan.lca);
      const perm = inPlan(o.perm, plan.perm);
      const lmia = inPlan(o.lmia, plan.lmia);
      const all: YearAcc<unknown>[] = [...lca, ...perm, ...lmia].map(([, y]) => y);
      if (all.length === 0) continue;

      const name = ranked(tally(all.map((y) => y.names)))[0];
      const personLike = new Set(all.flatMap((y) => [...y.personLike]));
      const usCertified = [...lca, ...perm].reduce((n, [, y]) => n + y.count, 0);
      const profiled = !id.startsWith("us-") && !id.startsWith("ca-");
      const small = !profiled && usCertified < PERSON_LIKE_MIN_FILINGS;
      if (small && personLike.has(name)) {
        droppedPersonLike++;
        continue;
      }

      for (const [p, rows] of [["lca", lca], ["perm", perm], ["lmia", lmia]] as const) {
        for (const [year, y] of rows) totals[p][String(year)] += y.count;
      }

      // A small unprofiled owner's person-like spellings stay out of `also`.
      const others = tally([...all.map((y) => y.names), ...all.map((y) => y.tradeNames)]);
      others.delete(name);
      if (small) for (const n of personLike) others.delete(n);

      const countries: Country[] = [];
      if (lca.length + perm.length > 0) countries.push("US");
      if (lmia.length > 0) countries.push("CA");

      const sponsorship: Sponsorship = { trends: {} };
      const us = (lcaKeys: boolean) => (c: UsSums, role: string, place: string) => usCell(c, role, place, lcaKeys);
      if (lca.length > 0) {
        const blocks = lca.map(([year, y]) => block(year, y, plan.lca, 3, mergeUs, us(true)));
        sponsorship.lca = blocks;
        sponsorship.trends.lca = trend(blocks, (t) => headlineOf("lca", t));
      }
      if (perm.length > 0) {
        const blocks = perm.map(([year, y]) => block(year, y, plan.perm, 3, mergeUs, us(false)));
        sponsorship.perm = blocks;
        sponsorship.trends.perm = trend(blocks, (t) => headlineOf("perm", t));
      }
      if (lmia.length > 0) {
        const blocks = lmia.map(([year, y]) => block(year, y, plan.lmia, 1, mergeCa, caCell));
        sponsorship.lmia = blocks;
        sponsorship.trends.lmia = trend(blocks, (t) => headlineOf("lmia", t));
      }

      result.set(id, {
        name,
        also: ranked(others).slice(0, 10).sort(cmp),
        countries: countries.sort(cmp),
        region: ranked(tally(all.map((y) => y.regions)))[0] ?? null,
        sponsorship,
      });
    }

    return { owners: result, totals, droppedPersonLike };
  }

  return { addUs, addCa, finish };
}
