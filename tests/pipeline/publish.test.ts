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
  it("withholds every value under SUB_MIN (3), zeros included", () => {
    expect(publishable([["a", 5], ["b", 0], ["c", 3]])).toEqual([["a", 5], ["c", 3]]);
  });

  it("also withholds the smallest published member when exactly one member is withheld", () => {
    expect(publishable([["a", 5], ["b", 1], ["c", 4]])).toEqual([["a", 5]]);
  });

  it("breaks a tie for the smallest by order", () => {
    expect(publishable([["a", 4], ["b", 2], ["c", 4]])).toEqual([["c", 4]]);
  });

  it("withholds the only other member", () => {
    expect(publishable([["a", 9], ["b", 2], ["c", 0]])).toEqual([]);
  });

  it("needs no extra withholding when two or more members are withheld", () => {
    expect(publishable([["a", 9], ["b", 2], ["c", 1]])).toEqual([["a", 9]]);
  });

  it("publishes a group with nothing under SUB_MIN unchanged", () => {
    expect(publishable([["a", 3], ["b", 0], ["c", 7]])).toEqual([["a", 3], ["c", 7]]);
  });
});

const pay = { n: 12, p25: 118000, median: 135000, p75: 153000 };

describe("withholdUs and withholdCa (totals)", () => {
  it("withholds small sub-counts of an LCA total and complements the worker split and the levels", () => {
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
    ).toStrictEqual({ role: "all", place: "all", filings: 8, withdrawn: 3, workers: 8, newHires: 4, levels: { II: 4 }, pay });
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

  it("withholds small streams and complements them", () => {
    expect(
      withholdCa({
        role: "all",
        place: "all",
        lmias: 5,
        positions: 12,
        streams: { "Global Talent Stream": 2, "High Wage": 6, "Low Wage": 4 },
      }),
    ).toStrictEqual({ role: "all", place: "all", lmias: 5, positions: 12, streams: { "High Wage": 6 } });
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
  const lcaTotal = (newHires: number, changeEmployer: number): UsCell => ({
    role: "all",
    place: "all",
    filings: 20,
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

  it("publishes an LCA full trend only when both totals show newHires and changeEmployer", () => {
    expect(publishUs("lca", [blk(2024, lcaTotal(4, 3)), blk(2025, lcaTotal(10, 4))]).trend.full).toEqual({
      from: 2024,
      to: 2025,
      period: "full",
      change: 1,
    });
    expect(publishUs("lca", [blk(2024, lcaTotal(4, 3)), blk(2025, lcaTotal(10, 2))]).trend.full).toBeNull();
    // A zero part is omitted like a withheld one, so it blocks the trend too.
    expect(publishUs("lca", [blk(2024, lcaTotal(4, 0)), blk(2025, lcaTotal(10, 4))]).trend.full).toBeNull();
  });

  it("publishes a ytd trend only when both blocks publish months and the headline parts", () => {
    const prev = blk(2025, lcaTotal(6, 6), [3, 3, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const cur = (months: number[], t = lcaTotal(9, 8)) => blk(2026, t, months, true);
    const ok = publishUs("lca", [prev, cur([6, 6, 6, ...zeros(9)])]);
    expect(ok.trend.ytd).toEqual({ from: 2025, to: 2026, period: "ytd", through: 3, change: 0.5 });
    // A month of 2 withholds 2026's months, so there is no ytd trend.
    const hidden = publishUs("lca", [prev, cur([6, 2, 10, ...zeros(9)])]);
    expect("months" in hidden.blocks[1]).toBe(false);
    expect(hidden.trend.ytd).toBeNull();
    // A withheld changeEmployer also withholds the months (they sum to the headline) and the trend.
    expect(publishUs("lca", [prev, cur([6, 6, 6, ...zeros(9)], lcaTotal(16, 2))]).trend.ytd).toBeNull();
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
