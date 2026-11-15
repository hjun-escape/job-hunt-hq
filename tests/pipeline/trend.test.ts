// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withholdUs } from "../../pipeline/aggregate/publish";
import { headlineFor, headlineOf, publishedHeadline, trend, type YearBlock } from "../../pipeline/aggregate/trend";
import type { CaCell, Sponsorship, UsCell } from "../../pipeline/schema/published";

type T = { h: number };
const h = (t: T) => t.h;
const blk = (
  year: number,
  headline: number,
  extra: { partial?: boolean; through?: number; months?: number[] } = {},
): YearBlock<T> => ({
  year,
  partial: extra.partial ?? false,
  ...(extra.through !== undefined ? { through: extra.through } : {}),
  months: extra.months ?? Array(12).fill(0),
  total: { h: headline },
  cells: [],
});
const tooFew = (year: number, partial = false, through?: number): YearBlock<T> => ({
  year,
  partial,
  ...(through !== undefined ? { through } : {}),
  tooFew: true,
});
const ytd2026 = (months: number[]) => blk(2026, 30, { partial: true, through: 3, months });
const first3 = [10, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("trend: full years", () => {
  it("compares the two latest complete years", () => {
    expect(trend([blk(2024, 100), blk(2025, 70)], h).full).toEqual({ from: 2024, to: 2025, period: "full", change: -0.3 });
  });

  it("has no through key on a full-year trend", () => {
    expect(trend([blk(2024, 100), blk(2025, 70)], h).full).toStrictEqual({ from: 2024, to: 2025, period: "full", change: -0.3 });
  });

  it("ignores older complete years and the partial year", () => {
    expect(trend([blk(2023, 1), blk(2024, 50), blk(2025, 100), ytd2026(first3)], h).full).toEqual({
      from: 2024,
      to: 2025,
      period: "full",
      change: 1,
    });
  });

  it("does not depend on block order", () => {
    expect(trend([blk(2025, 70), blk(2024, 100)], h).full).toEqual({ from: 2024, to: 2025, period: "full", change: -0.3 });
  });

  it("is null when either block is tooFew", () => {
    expect(trend([tooFew(2024), blk(2025, 70)], h).full).toBeNull();
    expect(trend([blk(2024, 100), tooFew(2025)], h).full).toBeNull();
  });

  it("is null without an earlier year, or when the year before the latest is missing", () => {
    expect(trend([blk(2025, 70)], h).full).toBeNull();
    expect(trend([blk(2023, 100), blk(2025, 70)], h).full).toBeNull();
    expect(trend([], h)).toEqual({ full: null, ytd: null });
  });

  it("is null when the earlier headline is 0", () => {
    expect(trend([blk(2024, 0), blk(2025, 70)], h).full).toBeNull();
  });

  it("is null when either headline is not published (null)", () => {
    const hidden = (t: T) => (t.h === 7 ? null : t.h);
    expect(trend([blk(2024, 7), blk(2025, 70)], hidden).full).toBeNull();
    expect(trend([blk(2024, 70), blk(2025, 7)], hidden).full).toBeNull();
  });
});

describe("trend: year to date", () => {
  it("compares the partial year's first `through` months with the same months a year earlier", () => {
    expect(trend([blk(2025, 60, { months: Array(12).fill(5) }), ytd2026(first3)], h).ytd).toEqual({
      from: 2025,
      to: 2026,
      period: "ytd",
      through: 3,
      change: 1,
    });
  });

  it("works in quarters for Canadian blocks", () => {
    const prev = blk(2025, 100, { months: [10, 30, 30, 30] });
    const cur = blk(2026, 30, { partial: true, through: 2, months: [20, 40, 0, 0] });
    expect(trend([prev, cur], h).ytd).toEqual({ from: 2025, to: 2026, period: "ytd", through: 2, change: 0.5 });
  });

  it("is null without the year before, when either block is tooFew, or when the earlier months sum to 0", () => {
    expect(trend([ytd2026(first3)], h).ytd).toBeNull();
    expect(trend([blk(2024, 60, { months: Array(12).fill(5) }), ytd2026(first3)], h).ytd).toBeNull();
    expect(trend([tooFew(2025), ytd2026(first3)], h).ytd).toBeNull();
    expect(trend([blk(2025, 60, { months: Array(12).fill(5) }), tooFew(2026, true, 3)], h).ytd).toBeNull();
    expect(trend([blk(2025, 60, { months: [0, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0] }), ytd2026(first3)], h).ytd).toBeNull();
  });

  it("is null when either block's headline is not published, even with months", () => {
    const hidden = (t: T) => (t.h === 30 ? null : t.h);
    expect(trend([blk(2025, 60, { months: Array(12).fill(5) }), ytd2026(first3)], hidden).ytd).toBeNull();
    const hiddenPrev = (t: T) => (t.h === 60 ? null : t.h);
    expect(trend([blk(2025, 60, { months: Array(12).fill(5) }), ytd2026(first3)], hiddenPrev).ytd).toBeNull();
  });

  it("is null when either block has no published months", () => {
    const noMonths = (year: number, headline: number, partial = false): YearBlock<T> => ({
      year,
      partial,
      ...(partial ? { through: 3 } : {}),
      total: { h: headline },
      cells: [],
    });
    expect(trend([noMonths(2025, 60), ytd2026(first3)], h).ytd).toBeNull();
    expect(trend([blk(2025, 60, { months: Array(12).fill(5) }), noMonths(2026, 30, true)], h).ytd).toBeNull();
  });

  it("is null when there is no partial year", () => {
    expect(trend([blk(2024, 100), blk(2025, 70)], h).ytd).toBeNull();
  });
});

const usTotal = (o: Partial<UsCell>): UsCell => ({ role: "all", place: "all", filings: 0, denied: 0, withdrawn: 0, ...o });
const caTotal = (o: Partial<CaCell>): CaCell => ({ role: "all", place: "all", lmias: 0, positions: 0, streams: {}, ...o });

describe("headlineOf", () => {
  it("is new hires plus changes of employer for LCA, filings for PERM, positions for LMIA", () => {
    expect(headlineOf("lca", usTotal({ filings: 9, workers: 20, newHires: 4, changeEmployer: 3, continuing: 13 }))).toBe(7);
    expect(headlineOf("perm", usTotal({ filings: 9 }))).toBe(9);
    expect(headlineOf("lmia", caTotal({ lmias: 4, positions: 11 }))).toBe(11);
  });
});

describe("publishedHeadline", () => {
  it("is the headline when every part is published", () => {
    expect(publishedHeadline("lca", usTotal({ filings: 9, workers: 9, newHires: 4, changeEmployer: 3 }))).toBe(7);
    expect(publishedHeadline("perm", usTotal({ filings: 9 }))).toBe(9);
    expect(publishedHeadline("lmia", caTotal({ lmias: 4, positions: 11 }))).toBe(11);
  });

  it("is null for a total whose worker split was withheld whole (R30)", () => {
    const shown = withholdUs(
      usTotal({ filings: 10, workers: 10, newHires: 1, changeEmployer: 1, continuing: 8, levels: { III: 10 } }),
    );
    expect(shown.newHires ?? shown.changeEmployer ?? shown.continuing).toBeUndefined();
    expect(publishedHeadline("lca", shown)).toBeNull();
  });

  it("is null for LCA when newHires or changeEmployer is withheld (or zero, which is omitted too)", () => {
    expect(publishedHeadline("lca", usTotal({ filings: 9, workers: 9, newHires: 4 }))).toBeNull();
    expect(publishedHeadline("lca", usTotal({ filings: 9, workers: 9, changeEmployer: 3 }))).toBeNull();
    expect(publishedHeadline("lca", usTotal({ filings: 9, workers: 9 }))).toBeNull();
  });
});

describe("headlineFor", () => {
  const block = (year: number, total: UsCell) => ({ year, partial: false, months: Array(12).fill(0), total, cells: [] });
  const s: Sponsorship = {
    lca: [{ year: 2024, partial: false, tooFew: true }, block(2025, usTotal({ filings: 5, newHires: 2, changeEmployer: 1 }))],
    perm: [block(2025, usTotal({ filings: 4 }))],
    lmia: [{ year: 2025, partial: false, months: [1, 1, 1, 3], total: caTotal({ lmias: 3, positions: 6 }), cells: [] }],
    trends: {},
  };

  it("is the year's headline", () => {
    expect(headlineFor(s, "lca", 2025)).toBe(3);
    expect(headlineFor(s, "perm", 2025)).toBe(4);
    expect(headlineFor(s, "lmia", 2025)).toBe(6);
  });

  it("counts a withheld part as 0, a lower bound for sorting", () => {
    const partial: Sponsorship = { lca: [block(2025, usTotal({ filings: 9, workers: 9, newHires: 4 }))], trends: {} };
    expect(headlineFor(partial, "lca", 2025)).toBe(4);
  });

  it("is 0 when the block is tooFew or missing", () => {
    expect(headlineFor(s, "lca", 2024)).toBe(0);
    expect(headlineFor(s, "lca", 2023)).toBe(0);
    expect(headlineFor({ trends: {} }, "perm", 2025)).toBe(0);
  });
});
