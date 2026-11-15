// @vitest-environment node
import { describe, expect, it } from "vitest";
import { payStats, rollUp, type RawCell } from "../../pipeline/aggregate/cells";

const c = (role: string, metro: string | null, region: string, count: number): RawCell => ({ role, metro, region, count });
const add = (a: RawCell, b: RawCell): RawCell => ({ ...a, count: a.count + b.count });

describe("payStats", () => {
  it("interpolates linearly between ranks", () => {
    expect(payStats([100000, 200000, 300000, 400000])).toEqual({ n: 4, p25: 175000, median: 250000, p75: 325000 });
  });

  it("is undefined below 3 values", () => {
    expect(payStats([1, 2])).toBeUndefined();
    expect(payStats([])).toBeUndefined();
  });

  it("rounds every figure, the median included, to the nearest 1,000", () => {
    expect(payStats([101400, 101500, 101600])!.median).toBe(102000);
    expect(payStats([100400, 120000, 140600])).toEqual({ n: 3, p25: 110000, median: 120000, p75: 130000 });
  });

  it("sorts its own copy and leaves the input untouched", () => {
    const values = [400000, 100000, 300000, 200000];
    expect(payStats(values)).toEqual({ n: 4, p25: 175000, median: 250000, p75: 325000 });
    expect(values).toEqual([400000, 100000, 300000, 200000]);
  });

  it("uses position p * (n - 1), the numpy default", () => {
    // n = 5: p25 at position 1, median at 2, p75 at 3 (exact ranks, no interpolation).
    expect(payStats([50000, 10000, 40000, 20000, 30000])).toEqual({ n: 5, p25: 20000, median: 30000, p75: 40000 });
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
