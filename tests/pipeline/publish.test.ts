// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cellCa,
  cellUs,
  publishable,
  publishCa,
  publishUs,
  withholdCa,
  withholdUs,
} from "../../pipeline/aggregate/publish";
import type { YearBlock } from "../../pipeline/aggregate/trend";
import type { CaCell, UsCell } from "../../pipeline/schema/published";

const zeros = (n: number) => Array<number>(n).fill(0);

describe("publishable (one exact-sum group on a total)", () => {
  it("shows members from SUB_MIN (3) and leaves zeros out when no member is 1 or 2", () => {
    expect(publishable([["a", 5], ["b", 0], ["c", 3]])).toEqual([["a", 5], ["c", 3]]);
    expect(publishable([["a", 3], ["b", 3]])).toEqual([["a", 3], ["b", 3]]);
  });

  it("withholds the whole group when any member is 1 or 2", () => {
    expect(publishable([["a", 5], ["b", 1], ["c", 4]])).toEqual([]);
    expect(publishable([["a", 9], ["b", 2], ["c", 0]])).toEqual([]);
  });

  it("withholds the whole group when two members are small (the old complement left these exact)", () => {
    expect(publishable([["a", 9], ["b", 2], ["c", 1]])).toEqual([]);
    expect(publishable([["a", 1], ["b", 1], ["c", 8]])).toEqual([]);
  });

  it("publishes an all-zero group as empty", () => {
    expect(publishable([["a", 0], ["b", 0]])).toEqual([]);
  });
});

const pay = { n: 12, p25: 118000, median: 135000, p75: 153000 };

describe("withholdUs and withholdCa (totals)", () => {
  it("withholds small sub-counts of an LCA total, and the worker split and levels whole", () => {
    expect(
      withholdUs({
        role: "all",
        place: "all",
        filings: 8,
        denied: 1,
        withdrawn: 3,
        workers: 8,
        newHires: 4,
        changeEmployer: 3,
        continuing: 1,
        levels: { II: 4, III: 3, IV: 1 },
        pay,
      }),
    ).toStrictEqual({ role: "all", place: "all", filings: 8, withdrawn: 3, workers: 8, levels: {}, pay });
  });

  it("keeps a PERM total free of LCA keys", () => {
    expect(withholdUs({ role: "all", place: "all", filings: 4, denied: 2, withdrawn: 0 })).toStrictEqual({
      role: "all",
      place: "all",
      filings: 4,
    });
    expect(withholdUs({ role: "all", place: "all", filings: 4, denied: 3, withdrawn: 5 })).toStrictEqual({
      role: "all",
      place: "all",
      filings: 4,
      denied: 3,
      withdrawn: 5,
    });
  });

  it("withholds the streams whole when any is 1 or 2", () => {
    expect(
      withholdCa({
        role: "all",
        place: "all",
        lmias: 5,
        positions: 12,
        streams: { "Global Talent Stream": 2, "High Wage": 6, "Low Wage": 4 },
      }),
    ).toStrictEqual({ role: "all", place: "all", lmias: 5, positions: 12, streams: {} });
  });
});

describe("cellUs and cellCa (cells)", () => {
  const where = { role: "software-engineer", place: "cbsa:41940" };

  it("keeps only role, place, filings, workers (LCA) and pay on a US cell", () => {
    expect(
      cellUs({
        ...where,
        filings: 8,
        denied: 3,
        withdrawn: 4,
        workers: 9,
        newHires: 4,
        changeEmployer: 3,
        continuing: 2,
        levels: { II: 8 },
        pay,
      }),
    ).toStrictEqual({ ...where, filings: 8, workers: 9, pay });
    expect(cellUs({ ...where, filings: 4, denied: 3, withdrawn: 0 })).toStrictEqual({ ...where, filings: 4 });
  });

  it("keeps only role, place, lmias and positions on a Canadian cell", () => {
    expect(cellCa({ ...where, lmias: 5, positions: 9, streams: { "High Wage": 9 } })).toStrictEqual({
      ...where,
      lmias: 5,
      positions: 9,
    });
  });
});

describe("publishUs and publishCa: trends from published values only", () => {
  const lcaTotal = (newHires: number, changeEmployer: number, filings = 20): UsCell => ({
    role: "all",
    place: "all",
    filings,
    denied: 0,
    withdrawn: 0,
    workers: 20,
    newHires,
    changeEmployer,
    continuing: 20 - newHires - changeEmployer,
    levels: { II: 20 },
  });
  const blk = <C>(year: number, total: C, months = zeros(12), partial = false): YearBlock<C> => ({
    year,
    partial,
    ...(partial ? { through: 3 } : {}),
    months,
    total,
    cells: [],
  });

  it("trends LCA on certified filings, whether or not the worker split is shown (R41)", () => {
    expect(publishUs("lca", [blk(2024, lcaTotal(4, 3, 10)), blk(2025, lcaTotal(10, 4, 15))]).trend.full).toEqual({
      from: 2024,
      to: 2025,
      period: "full",
      change: 0.5,
    });
    // changeEmployer 2 withholds 2025's worker split, and a zero part is omitted: neither blocks the trend now.
    expect(publishUs("lca", [blk(2024, lcaTotal(4, 3, 10)), blk(2025, lcaTotal(10, 2, 15))]).trend.full).toMatchObject({ change: 0.5 });
    expect(publishUs("lca", [blk(2024, lcaTotal(4, 0, 10)), blk(2025, lcaTotal(10, 4, 15))]).trend.full).toMatchObject({ change: 0.5 });
  });

  it("publishes LCA months unless an entry is 1 or 2, and a ytd trend only when both blocks publish them", () => {
    const prev = blk(2025, lcaTotal(6, 6), [3, 3, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const cur = (months: number[], t = lcaTotal(9, 8)) => blk(2026, t, months, true);
    const ok = publishUs("lca", [prev, cur([6, 6, 6, ...zeros(9)])]);
    expect(ok.trend.ytd).toEqual({ from: 2025, to: 2026, period: "ytd", through: 3, change: 0.5 });
    // A month of 2 withholds 2026's months, so there is no ytd trend.
    const hidden = publishUs("lca", [prev, cur([6, 2, 10, ...zeros(9)])]);
    expect("months" in hidden.blocks[1]).toBe(false);
    expect(hidden.trend.ytd).toBeNull();
    // Months count filings, so a withheld changeEmployer no longer withholds them, nor the ytd trend.
    const split = publishUs("lca", [prev, cur([6, 6, 6, ...zeros(9)], lcaTotal(16, 2))]);
    expect(split.blocks[1]).toMatchObject({ months: [6, 6, 6, ...zeros(9)] });
    expect(split.trend.ytd).toMatchObject({ change: 0.5 });
  });

  it("trends PERM on filings and LMIA on positions, which are always shown", () => {
    const perm = (filings: number): UsCell => ({ role: "all", place: "all", filings, denied: 1, withdrawn: 0 });
    expect(publishUs("perm", [blk(2024, perm(4)), blk(2025, perm(6))]).trend.full).toMatchObject({ change: 0.5 });
    const lmia = (positions: number): CaCell => ({ role: "all", place: "all", lmias: 3, positions, streams: { X: positions } });
    expect(publishCa([blk(2024, lmia(10), zeros(4)), blk(2025, lmia(5), zeros(4))]).trend.full).toMatchObject({ change: -0.5 });
  });

  it("publishes cells with counts and pay only, and totals with withheld sub-counts", () => {
    const cell: UsCell = { role: "designer", place: "US-CA", filings: 20, denied: 5, withdrawn: 0, workers: 20, newHires: 20, changeEmployer: 0, continuing: 0, levels: { II: 20 } };
    const out = publishUs("lca", [{ year: 2025, partial: false, months: zeros(12), total: lcaTotal(4, 3), cells: [cell] }]);
    expect(out.blocks[0]).toStrictEqual({
      year: 2025,
      partial: false,
      months: zeros(12),
      total: { role: "all", place: "all", filings: 20, workers: 20, newHires: 4, changeEmployer: 3, continuing: 13, levels: { II: 20 } },
      cells: [{ role: "designer", place: "US-CA", filings: 20, workers: 20 }],
    });
  });
});

// R30: every composition of each exact-sum group, through the real withholding functions. For each published
// output, a reader knows the group's sum and the rule, so the inputs that give that output are all it can
// tell apart. No absent member may then be pinned to one value, or to values of only 1 or 2.
function compositions(sum: number, parts: number): number[][] {
  if (parts === 1) return [[sum]];
  const out: number[][] = [];
  for (let first = 0; first <= sum; first++) {
    for (const rest of compositions(sum - first, parts - 1)) out.push([first, ...rest]);
  }
  return out;
}

type Leak = { output: string; member: string; values: number[] };

/** Absent members whose values across the preimage are a single value (other than a known 0) or only 1 or 2. */
function leaks(
  keys: string[],
  sums: number[],
  publish: (values: number[]) => { output: string; shown: string[] },
): { leaks: Leak[]; checked: number; inputs: number } {
  const byOutput = new Map<string, { shown: Set<string>; values: Set<number>[] }>();
  let inputs = 0;
  for (const sum of sums) {
    for (const values of compositions(sum, keys.length)) {
      inputs++;
      const { output, shown } = publish(values);
      let e = byOutput.get(output);
      if (!e) {
        e = { shown: new Set(shown), values: keys.map(() => new Set<number>()) };
        byOutput.set(output, e);
      }
      values.forEach((v, i) => e!.values[i].add(v));
    }
  }
  const found: Leak[] = [];
  let checked = 0;
  for (const [output, e] of byOutput) {
    keys.forEach((member, i) => {
      if (e.shown.has(member)) return;
      const values = [...e.values[i]].sort((a, b) => a - b);
      if (values.length === 1 && values[0] === 0) return; // a zero a reader can work out is not a count to protect
      checked++;
      if (values.length === 1 || values.every((v) => v === 1 || v === 2)) found.push({ output, member, values });
    });
  }
  return { leaks: found, checked, inputs };
}

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

describe("exhaustive preimage check (R30)", () => {
  const split = ["newHires", "changeEmployer", "continuing"] as const;

  it("pins no hidden worker-split member (3 members, sums 3 to 20)", () => {
    const r = leaks([...split], range(3, 20), ([newHires, changeEmployer, continuing]) => {
      const sum = newHires + changeEmployer + continuing;
      const out = withholdUs({
        role: "all",
        place: "all",
        filings: sum,
        workers: sum,
        newHires,
        changeEmployer,
        continuing,
        levels: { II: sum },
      });
      return { output: JSON.stringify(out), shown: split.filter((k) => out[k] !== undefined) };
    });
    expect(r.inputs).toBe(1761);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.leaks).toEqual([]);
  });

  it("pins no hidden wage level (5 members, sums 3 to 20)", () => {
    const levels = ["I", "II", "III", "IV", "N/A"] as const;
    const r = leaks([...levels], range(3, 20), (values) => {
      const sum = values.reduce((a, b) => a + b, 0);
      const out = withholdUs({
        role: "all",
        place: "all",
        filings: sum,
        workers: sum,
        newHires: sum,
        changeEmployer: 0,
        continuing: 0,
        levels: Object.fromEntries(levels.map((l, i) => [l, values[i]])),
      });
      return { output: JSON.stringify(out), shown: Object.keys(out.levels ?? {}) };
    });
    expect(r.inputs).toBe(53109);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.leaks).toEqual([]);
  });

  it("pins no hidden stream (3 named streams, sums 3 to 20)", () => {
    const names = ["Global Talent Stream", "High Wage", "Low Wage"];
    const r = leaks(names, range(3, 20), (values) => {
      const sum = values.reduce((a, b) => a + b, 0);
      const out = withholdCa({
        role: "all",
        place: "all",
        lmias: sum,
        positions: sum,
        streams: Object.fromEntries(names.map((n, i) => [n, values[i]])),
      });
      return { output: JSON.stringify(out), shown: Object.keys(out.streams ?? {}) };
    });
    expect(r.inputs).toBe(1761);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.leaks).toEqual([]);
  });

  it("does find the leaks of the old complement rule (the check bites)", () => {
    // The R28 rule: withhold under 3; when exactly one non-zero member is withheld, also withhold the smallest shown.
    const old = (values: number[]) => {
      const shown = values.map((v, i) => [i, v]).filter(([, v]) => v >= 3);
      if (values.filter((v) => v > 0 && v < 3).length === 1 && shown.length > 0) {
        let s = 0;
        shown.forEach(([, v], i) => {
          if (v < shown[s][1]) s = i;
        });
        shown.splice(s, 1);
      }
      return shown;
    };
    const r = leaks([...split], range(3, 20), (values) => {
      const shown = old(values);
      const sum = values.reduce((a, b) => a + b, 0);
      return { output: JSON.stringify([sum, shown]), shown: shown.map(([i]) => split[i]) };
    });
    expect(r.leaks).toContainEqual({ output: JSON.stringify([10, [[2, 8]]]), member: "newHires", values: [1] });
    // 112 members pinned to one value and 91 to only 1 or 2.
    expect(r.leaks.length).toBe(203);
  });
});
