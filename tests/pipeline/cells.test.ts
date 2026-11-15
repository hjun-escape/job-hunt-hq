// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  PAY_MIN,
  payStats,
  publishable,
  rollUp,
  SUB_MIN,
  withholdCa,
  withholdUs,
  type RawCell,
} from "../../pipeline/aggregate/cells";

const c = (role: string, metro: string | null, region: string, count: number): RawCell => ({ role, metro, region, count });
const add = (a: RawCell, b: RawCell): RawCell => ({ ...a, count: a.count + b.count });

describe("payStats", () => {
  it("interpolates linearly between ranks", () => {
    // n = 7: p25 at position 1.5, median at 3, p75 at 4.5.
    expect(payStats([100000, 150000, 200000, 250000, 300000, 350000, 400000])).toEqual({
      n: 7,
      p25: 175000,
      median: 250000,
      p75: 325000,
    });
    // n = 6: positions 1.25, 2.5 and 3.75.
    expect(payStats([0, 40000, 80000, 120000, 160000, 200000])).toEqual({ n: 6, p25: 50000, median: 100000, p75: 150000 });
  });

  it("is undefined below PAY_MIN (5) values", () => {
    expect(PAY_MIN).toBe(5);
    expect(payStats([])).toBeUndefined();
    expect(payStats([1, 2])).toBeUndefined();
    expect(payStats([100000, 200000, 300000, 400000])).toBeUndefined();
    expect(payStats([100000, 200000, 300000, 400000, 500000])).toEqual({ n: 5, p25: 200000, median: 300000, p75: 400000 });
  });

  it("rounds every figure, the median included, to the nearest 1,000", () => {
    expect(payStats([101300, 101400, 101500, 101600, 101700])!.median).toBe(102000);
    expect(payStats([100400, 110300, 120000, 129600, 140600])).toEqual({ n: 5, p25: 110000, median: 120000, p75: 130000 });
  });

  it("sorts its own copy and leaves the input untouched", () => {
    const values = [400000, 100000, 350000, 150000, 300000, 200000, 250000];
    expect(payStats(values)).toEqual({ n: 7, p25: 175000, median: 250000, p75: 325000 });
    expect(values).toEqual([400000, 100000, 350000, 150000, 300000, 200000, 250000]);
  });

  it("uses position p * (n - 1), the numpy default", () => {
    // n = 5: p25 at position 1, median at 2, p75 at 3 (exact ranks, no interpolation).
    expect(payStats([50000, 10000, 40000, 20000, 30000])).toEqual({ n: 5, p25: 20000, median: 30000, p75: 40000 });
  });
});

describe("publishable (one exact-sum group)", () => {
  it("withholds every value under SUB_MIN (3), zeros included", () => {
    expect(SUB_MIN).toBe(3);
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

describe("withholdUs and withholdCa", () => {
  const pay = { n: 8, p25: 118000, median: 135000, p75: 153000 };

  it("withholds small sub-counts of an LCA cell and complements the worker split and the levels", () => {
    expect(
      withholdUs({
        role: "software-engineer",
        place: "cbsa:41940",
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
    ).toStrictEqual({
      role: "software-engineer",
      place: "cbsa:41940",
      filings: 8,
      withdrawn: 3,
      workers: 8,
      newHires: 4,
      levels: { II: 4 },
      pay,
    });
  });

  it("keeps a PERM cell free of LCA keys", () => {
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

describe("rollUp", () => {
  it("drops what is still under the minimum after (role, metro) -> (role, region) -> (all, region)", () => {
    expect(
      rollUp(
        [
          c("software-engineer", "cbsa:41940", "US-CA", 5),
          c("software-engineer", "cbsa:31080", "US-CA", 1),
          c("data-engineer", "cbsa:41940", "US-CA", 1),
        ],
        add,
      ),
    ).toEqual([c("software-engineer", "cbsa:41940", "US-CA", 5)]);
  });

  it("merges small metro cells into their region for the same role", () => {
    expect(
      rollUp([c("software-engineer", "cbsa:31080", "US-CA", 2), c("software-engineer", "cbsa:41940", "US-CA", 1)], add),
    ).toEqual([c("software-engineer", null, "US-CA", 3)]);
  });

  it("starts a null metro at (role, region) and merges small roles into (all, region)", () => {
    expect(rollUp([c("software-engineer", null, "US-WA", 2), c("data-engineer", null, "US-WA", 1)], add)).toEqual([
      c("all", null, "US-WA", 3),
    ]);
  });

  it("joins coarsened metro cells with the role's existing region cell", () => {
    expect(rollUp([c("software-engineer", "cbsa:42660", "US-WA", 1), c("software-engineer", null, "US-WA", 2)], add)).toEqual([
      c("software-engineer", null, "US-WA", 3),
    ]);
  });

  it("keeps a metro that spans regions as one cell, and splits it by region when it is too small", () => {
    expect(
      rollUp([c("software-engineer", "cbsa:35620", "US-NY", 2), c("software-engineer", "cbsa:35620", "US-NJ", 1)], add),
    ).toEqual([c("software-engineer", "cbsa:35620", "US-NJ", 3)]);
    expect(
      rollUp(
        [
          c("software-engineer", "cbsa:35620", "US-NY", 1),
          c("software-engineer", "cbsa:35620", "US-NJ", 1),
          c("software-engineer", null, "US-NY", 2),
          c("software-engineer", null, "US-NJ", 2),
        ],
        add,
      ),
    ).toEqual([c("software-engineer", null, "US-NJ", 3), c("software-engineer", null, "US-NY", 3)]);
  });

  it("never merges cells that already meet the minimum", () => {
    expect(
      rollUp([c("software-engineer", "cbsa:41940", "US-CA", 3), c("software-engineer", "cbsa:31080", "US-CA", 3)], add),
    ).toEqual([c("software-engineer", "cbsa:31080", "US-CA", 3), c("software-engineer", "cbsa:41940", "US-CA", 3)]);
  });

  it("sorts by role, then published place (metro, else region)", () => {
    const out = rollUp(
      [
        c("software-engineer", null, "US-CA", 4),
        c("data-engineer", "cbsa:41940", "US-CA", 3),
        c("software-engineer", "cbsa:41940", "US-CA", 3),
        c("all", null, "US-TX", 3),
      ],
      add,
    );
    expect(out.map((x) => `${x.role} ${x.metro ?? x.region}`)).toEqual([
      "all US-TX",
      "data-engineer cbsa:41940",
      "software-engineer US-CA",
      "software-engineer cbsa:41940",
    ]);
  });

  it("honours a custom minimum", () => {
    expect(rollUp([c("software-engineer", "cbsa:41940", "US-CA", 1)], add, 1)).toEqual([
      c("software-engineer", "cbsa:41940", "US-CA", 1),
    ]);
  });

  it("gives the same result whatever the input order", () => {
    const cells = [
      c("software-engineer", "cbsa:35620", "US-NY", 2),
      c("software-engineer", "cbsa:35620", "US-NJ", 1),
      c("data-engineer", "cbsa:41940", "US-CA", 1),
      c("data-scientist", null, "US-CA", 2),
    ];
    expect(rollUp([...cells].reverse(), add)).toEqual(rollUp(cells, add));
  });
});
