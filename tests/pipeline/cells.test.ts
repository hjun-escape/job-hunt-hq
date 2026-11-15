// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAY_MIN, payStats, rollUp, SUB_MIN, type RawCell } from "../../pipeline/aggregate/cells";

const c = (role: string, metro: string | null, region: string, count: number): RawCell => ({ role, metro, region, count });
const add = (a: RawCell, b: RawCell): RawCell => ({ ...a, count: a.count + b.count });
const steps = (n: number, from: number, step: number) => Array.from({ length: n }, (_, i) => from + i * step);

describe("payStats", () => {
  it("interpolates linearly between ranks", () => {
    // n = 11: p25 at position 2.5, median at 5, p75 at 7.5.
    expect(payStats(steps(11, 100000, 30000))).toEqual({ n: 11, p25: 175000, median: 250000, p75: 325000 });
    // n = 10: positions 2.25, 4.5 and 6.75.
    expect(payStats(steps(10, 0, 40000))).toEqual({ n: 10, p25: 90000, median: 180000, p75: 270000 });
  });

  it("is undefined below PAY_MIN (10) values", () => {
    expect(PAY_MIN).toBe(10);
    expect(SUB_MIN).toBe(3);
    expect(payStats([])).toBeUndefined();
    expect(payStats([1, 2])).toBeUndefined();
    expect(payStats(steps(9, 100000, 10000))).toBeUndefined();
    expect(payStats(steps(10, 100000, 40000))).toEqual({ n: 10, p25: 190000, median: 280000, p75: 370000 });
  });

  it("rounds every figure, the median included, to the nearest 1,000", () => {
    expect(payStats(steps(11, 101000, 100))!.median).toBe(102000);
    expect(
      payStats([100000, 101000, 110300, 110300, 115000, 120000, 125000, 129600, 129600, 135000, 140600]),
    ).toEqual({ n: 11, p25: 110000, median: 120000, p75: 130000 });
  });

  it("sorts its own copy and leaves the input untouched", () => {
    const values = [400000, 100000, 370000, 130000, 340000, 160000, 310000, 190000, 280000, 220000, 250000];
    const copy = [...values];
    expect(payStats(values)).toEqual({ n: 11, p25: 175000, median: 250000, p75: 325000 });
    expect(values).toEqual(copy);
  });

  it("uses position p * (n - 1), the numpy default", () => {
    // n = 13: p25 at position 3, median at 6, p75 at 9 (exact ranks, no interpolation).
    const values = steps(13, 10000, 10000).reverse();
    expect(payStats(values)).toEqual({ n: 13, p25: 40000, median: 70000, p75: 100000 });
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
