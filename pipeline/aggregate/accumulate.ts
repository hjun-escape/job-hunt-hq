// Per-owner accumulation of typed filings into year blocks. Keeps running sums and pay values per breakdown
// cell, never whole filings. Applies the small-cell rule and the person-name privacy gate; publish.ts decides
// what each block shows.
import {
  addressIn,
  caEmployerKey,
  isPlaceholderName,
  normalizeName,
  personNameSignal,
  usEmployerKey,
} from "../normalize/names";
import type { CaCell, Sponsorship, Totals, UsCell } from "../schema/published";
import type { YearSelection } from "../sources";
import { WAGE_LEVELS, type CaApproval, type Country, type Place, type UsFiling } from "../types";
import { payStats, rollUp, type RawCell } from "./cells";
import { publishCa, publishUs } from "./publish";
import type { Program, YearBlock } from "./trend";

/** Small-cell threshold: certified filings (US) or approved LMIAs (Canada). */
const MIN = 3;
/** An unprofiled owner named like a person is published only from this many certified US filings (R23 d). */
export const PERSON_LIKE_MIN_FILINGS = 10;

/** True only for a generated employer id (`us-` or `ca-` plus 10 hex characters); a profile id is a domain. */
export function isUnprofiledId(id: string): boolean {
  return /^(us|ca)-[0-9a-f]{10}$/.test(id);
}

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

/**
 * One program-year of one owner, split by quarter so a partial year can leave out the quarters past its
 * `through`. counts: threshold count per quarter. months: raw headline per fiscal month (12) or quarter (4):
 * certified filings for LCA and PERM (R41), approved positions for LMIA.
 * Cell keys start with the quarter digit. Tally keys are the quarter digit, a kind letter and the value
 * (n: raw name, p: person-like raw name, t: trade name, r: employer region).
 */
type YearAcc<S> = { counts: number[]; months: number[]; cells: Map<string, S>; tally: Map<string, number> };
/** The program-year as planned, with tally keys reduced to kind letter and value. */
type YearView<S> = { count: number; months: number[]; cells: S[]; tally: Map<string, number> };
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
    y = { counts: [0, 0, 0, 0], months: Array<number>(slots).fill(0), cells: new Map(), tally: new Map() };
    years.set(year, y);
  }
  return y;
}

function cellOf<S extends RawCell>(y: YearAcc<S>, q: number, role: string, place: Place, make: (base: RawCell) => S): S {
  const key = `${q}\u0000${role}\u0000${place.metro ?? ""}\u0000${place.region}`;
  let c = y.cells.get(key);
  if (!c) {
    c = make({ role, metro: place.metro, region: place.region, count: 0 });
    y.cells.set(key, c);
  }
  return c;
}

function note(y: YearAcc<unknown>, q: number, name: string, trade: string | null, region: string | null, person: boolean) {
  bump(y.tally, `${q}n${name}`);
  if (person) y.tally.set(`${q}p${name}`, 1);
  if (trade) bump(y.tally, `${q}t${trade}`);
  if (region) bump(y.tally, `${q}r${region}`);
}

function checkRole(role: string) {
  if (role === "all") throw new Error('role id "all" is reserved for totals and merged cells');
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

/** A cell with its raw sums, before withholding. PERM cells carry no LCA keys; `levels` only above 0. */
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
const lcaCell = (c: UsSums, role: string, place: string) => usCell(c, role, place, true);
const permCell = (c: UsSums, role: string, place: string) => usCell(c, role, place, false);

function caCell(c: CaSums, role: string, place: string): CaCell {
  const streams: Record<string, number> = {};
  for (const k of [...c.streams.keys()].sort(cmp)) streams[k] = c.streams.get(k)!;
  return { role, place, lmias: c.count, positions: c.positions, streams };
}

/**
 * A year block with raw sums, before publish.ts withholds anything. `through` is in the unit of `months`:
 * `perQuarter` is 3 for US fiscal months and 1 for Canadian quarters. Under MIN the block is only
 * { year, partial, through?, tooFew }.
 */
function block<S extends RawCell, C>(
  year: number,
  v: YearView<S>,
  sel: YearSelection,
  perQuarter: number,
  merge: (a: S, b: S) => S,
  publish: (c: S, role: string, place: string) => C,
): YearBlock<C> {
  const partial = sel.partial?.year === year;
  const head = { year, partial, ...(sel.partial && partial ? { through: sel.partial.through * perQuarter } : {}) };
  if (v.count < MIN) return { ...head, tooFew: true };
  return {
    ...head,
    months: v.months,
    total: publish(v.cells.reduce(merge), "all", "all"),
    cells: rollUp(v.cells, merge, MIN).map((c) => publish(c, c.role, c.metro ?? c.region)),
  };
}

function plannedYears(sel: YearSelection): number[] {
  return [...new Set([...sel.complete, ...(sel.partial ? [sel.partial.year] : [])])].sort((a, b) => a - b);
}

/** A program-year as planned: a partial year's quarters past `through` are outside the plan and left out. */
function view<S extends RawCell>(y: YearAcc<S>, quarters: number, perQuarter: number, merge: (a: S, b: S) => S): YearView<S> {
  const cells = new Map<string, S>();
  for (const [key, c] of y.cells) {
    if (Number(key[0]) > quarters) continue;
    const prev = cells.get(key.slice(2));
    cells.set(key.slice(2), prev ? merge(prev, c) : c);
  }
  const tallies = new Map<string, number>();
  for (const [key, n] of y.tally) if (Number(key[0]) <= quarters) bump(tallies, key.slice(1), n);
  return {
    count: y.counts.slice(0, quarters).reduce((a, b) => a + b, 0),
    months: y.months.map((n, i) => (i < quarters * perQuarter ? n : 0)),
    cells: [...cells.values()],
    tally: tallies,
  };
}

/** The owner's program-years with data inside the plan, by year. */
function inPlan<S extends RawCell>(
  years: Map<number, YearAcc<S>>,
  sel: YearSelection,
  perQuarter: number,
  merge: (a: S, b: S) => S,
): [number, YearView<S>][] {
  return plannedYears(sel).flatMap((year) => {
    const y = years.get(year);
    const v = y && view(y, sel.partial?.year === year ? sel.partial.through : 4, perQuarter, merge);
    return v && v.cells.length > 0 ? [[year, v] as [number, YearView<S>]] : [];
  });
}

/** One kind of tally (n, p, t or r) summed across views. */
function kind(views: YearView<unknown>[], k: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of views) for (const [key, n] of v.tally) if (key[0] === k) bump(out, key.slice(1), n);
  return out;
}

const PROGRAMS: Program[] = ["lca", "perm", "lmia"];

/** The key a filing's generated owner id was hashed from (see usEmployerKey); the name is normalised only without a FEIN. */
function usKey(e: UsFiling["employer"]): string {
  return e.fein?.trim() ? usEmployerKey(e.fein, "", null) : usEmployerKey(null, normalizeName(e.name), e.state);
}

/** Two different FEIN or name keys hashed to one generated id; the message names only the id. */
export class IdCollisionError extends Error {
  constructor(public id: string) {
    super(`employer id collision: two different employers hash to ${id}; nothing is published`);
    this.name = "IdCollisionError";
  }
}

export function createAccumulator() {
  const owners = new Map<string, OwnerAcc>();
  /** Generated id to the FEIN or name key it was hashed from. Two keys under one id would merge two employers. */
  const keys = new Map<string, string>();
  const claim = (owner: string, key: () => string) => {
    if (!isUnprofiledId(owner)) return;
    const k = key();
    const had = keys.get(owner);
    if (had === undefined) keys.set(owner, k);
    else if (had !== k) throw new IdCollisionError(owner);
  };
  const ownerAcc = (id: string): OwnerAcc => {
    let o = owners.get(id);
    if (!o) {
      o = { lca: new Map(), perm: new Map(), lmia: new Map() };
      owners.set(id, o);
    }
    return o;
  };

  function addUs(owner: string, f: UsFiling): void {
    if (!Number.isInteger(f.month) || f.month < 1 || f.month > 12) {
      throw new Error(`US filing fiscal month must be 1 to 12, got ${f.month}`);
    }
    checkRole(f.role);
    claim(owner, () => usKey(f.employer));
    const q = Math.ceil(f.month / 3);
    const y = yearAcc(ownerAcc(owner)[f.program], f.year, 12);
    const e = f.employer;
    note(y, q, e.name, e.tradeName, e.state ? `US-${e.state}` : null, e.personLike === true);
    const c = cellOf(y, q, f.role, f.place, newUs);
    if (f.status === "denied") c.denied++;
    else if (f.status === "withdrawn") c.withdrawn++;
    else {
      c.count++;
      y.counts[q - 1]++;
      if (f.annualPay !== null) c.pay.push(f.annualPay);
      y.months[f.month - 1] += 1;
      if (f.lca) {
        c.workers += f.lca.workers;
        c.newHires += f.lca.newHires;
        c.changeEmployer += f.lca.changeEmployer;
        c.continuing += f.lca.continuing;
        c.levels[WAGE_LEVELS.indexOf(f.lca.level)]++;
      }
    }
  }

  function addCa(owner: string, a: CaApproval): void {
    if (!Number.isInteger(a.quarter) || a.quarter < 1 || a.quarter > 4) {
      throw new Error(`Canadian approval quarter must be 1 to 4, got ${a.quarter}`);
    }
    checkRole(a.role);
    claim(owner, () => caEmployerKey(normalizeName(a.employer.name), a.employer.province));
    const q = a.quarter;
    const y = yearAcc(ownerAcc(owner).lmia, a.year, 4);
    note(y, q, a.employer.name, null, a.employer.province ? `CA-${a.employer.province}` : null, false);
    const c = cellOf(y, q, a.role, a.place, newCa);
    c.count += a.lmias;
    y.counts[q - 1] += a.lmias;
    c.positions += a.positions;
    bump(c.streams, a.stream, a.positions);
    y.months[q - 1] += a.positions;
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
      const lca = inPlan(o.lca, plan.lca, 3, mergeUs);
      const perm = inPlan(o.perm, plan.perm, 3, mergeUs);
      const lmia = inPlan(o.lmia, plan.lmia, 1, mergeCa);
      const all: YearView<unknown>[] = [...lca, ...perm, ...lmia].map(([, v]) => v);
      if (all.length === 0) continue;

      const names = kind(all, "n");
      const name = ranked(names)[0];
      const personLike = kind(all, "p");
      const usCertified = [...lca, ...perm].reduce((n, [, v]) => n + v.count, 0);
      const small = isUnprofiledId(id) && usCertified < PERSON_LIKE_MIN_FILINGS;
      if (small && personLike.has(name)) {
        droppedPersonLike++;
        continue;
      }

      for (const [p, rows] of [["lca", lca], ["perm", perm], ["lmia", lmia]] as const) {
        for (const [year, v] of rows) totals[p][String(year)] += v.count;
      }

      // Filler and street addresses never go into `also` (the loaders blank such trade names; a filed name can be
      // one too). A small unprofiled owner's person-like spellings and trade names stay out as well.
      const trade = kind(all, "t");
      const others = tally([names, trade]);
      others.delete(name);
      for (const n of others.keys()) if (isPlaceholderName(n) || addressIn(n)) others.delete(n);
      if (small) {
        for (const n of personLike.keys()) others.delete(n);
        for (const t of trade.keys()) if (personNameSignal(t) !== null) others.delete(t);
      }

      const countries: Country[] = [];
      if (lca.length + perm.length > 0) countries.push("US");
      if (lmia.length > 0) countries.push("CA");

      const sponsorship: Sponsorship = { trends: {} };
      if (lca.length > 0) {
        const r = publishUs("lca", lca.map(([year, v]) => block(year, v, plan.lca, 3, mergeUs, lcaCell)));
        sponsorship.lca = r.blocks;
        sponsorship.trends.lca = r.trend;
      }
      if (perm.length > 0) {
        const r = publishUs("perm", perm.map(([year, v]) => block(year, v, plan.perm, 3, mergeUs, permCell)));
        sponsorship.perm = r.blocks;
        sponsorship.trends.perm = r.trend;
      }
      if (lmia.length > 0) {
        const r = publishCa(lmia.map(([year, v]) => block(year, v, plan.lmia, 1, mergeCa, caCell)));
        sponsorship.lmia = r.blocks;
        sponsorship.trends.lmia = r.trend;
      }

      result.set(id, {
        name,
        also: ranked(others).slice(0, 10).sort(cmp),
        countries: countries.sort(cmp),
        region: ranked(kind(all, "r"))[0] ?? null,
        sponsorship,
      });
    }

    return { owners: result, totals, droppedPersonLike };
  }

  return { addUs, addCa, finish };
}
