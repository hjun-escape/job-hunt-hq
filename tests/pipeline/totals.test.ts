// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { YearPlans } from "../../pipeline/aggregate/accumulate";
import { compareTotals, compareWithPublished } from "../../pipeline/check/totals";
import { selectionFor } from "../../pipeline/cli/download";
import type { Totals } from "../../pipeline/schema/published";
import { PUBLISHED_TOTALS } from "../../pipeline/sources";

const plan: YearPlans = {
  lca: { complete: [2024, 2025] },
  perm: { complete: [2025] },
  lmia: { complete: [2024, 2025] },
};
const planPartial2026: YearPlans = {
  lca: { complete: [2024, 2025], partial: { year: 2026, through: 2 } },
  perm: { complete: [2025], partial: { year: 2026, through: 1 } },
  lmia: { complete: [2024, 2025], partial: { year: 2026, through: 2 } },
};
const t = (lca: Totals["lca"], perm: Totals["perm"] = {}, lmia: Totals["lmia"] = {}): Totals => ({ lca, perm, lmia });

describe("compareTotals", () => {
  it("flags a complete year that moves more than 2%, naming the program and year", () => {
    const problems = compareTotals(t({ "2025": 1000 }), t({ "2025": 1025 }), plan);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("lca");
    expect(problems[0]).toContain("2025");
    expect(problems[0]).toContain("1000");
    expect(problems[0]).toContain("1025");
  });

  it("accepts a complete year that moves 2% or less, either way", () => {
    expect(compareTotals(t({ "2025": 1000 }), t({ "2025": 1010 }), plan)).toEqual([]);
    expect(compareTotals(t({ "2025": 1000 }), t({ "2025": 1020 }), plan)).toEqual([]);
    expect(compareTotals(t({ "2025": 1000 }), t({ "2025": 980 }), plan)).toEqual([]);
  });

  it("flags a complete year that falls more than 2%", () => {
    expect(compareTotals(t({ "2025": 1000 }), t({ "2025": 970 }), plan)).toHaveLength(1);
  });

  it("flags a partial year that decreases, and lets it grow", () => {
    expect(compareTotals(t({ "2026": 500 }), t({ "2026": 490 }), planPartial2026)).toHaveLength(1);
    expect(compareTotals(t({ "2026": 500 }), t({ "2026": 800 }), planPartial2026)).toEqual([]);
    expect(compareTotals(t({ "2026": 500 }), t({ "2026": 500 }), planPartial2026)).toEqual([]);
  });

  it("gives no problems without a previous build", () => {
    expect(compareTotals(null, t({ "2025": 1000 }, { "2025": 50 }, { "2025": 70 }), plan)).toEqual([]);
  });

  it("compares only the year keys present in both builds", () => {
    const prev = t({ "2023": 900, "2024": 1000, "2025": 1000 });
    const next = t({ "2024": 1000, "2025": 1000, "2026": 10 });
    expect(compareTotals(prev, next, planPartial2026)).toEqual([]);
  });

  it("checks PERM and LMIA as well as LCA", () => {
    const problems = compareTotals(t({}, { "2025": 100 }, { "2024": 200 }), t({}, { "2025": 150 }, { "2024": 100 }), plan);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("perm 2025");
    expect(problems.join("\n")).toContain("lmia 2024");
  });

  it("treats a complete year whose previous total was 0 as moved when it is now above 0", () => {
    expect(compareTotals(t({ "2025": 0 }), t({ "2025": 5 }), plan)).toHaveLength(1);
    expect(compareTotals(t({ "2025": 0 }), t({ "2025": 0 }), plan)).toEqual([]);
  });

  it("judges a year that was partial in the previous build as partial: it may grow, not fall", () => {
    const prevPlan: YearPlans = { ...plan, lca: { complete: [2024], partial: { year: 2025, through: 3 } } };
    expect(compareTotals(t({ "2025": 700 }), t({ "2025": 1000 }), plan, prevPlan)).toEqual([]);
    expect(compareTotals(t({ "2025": 700 }), t({ "2025": 690 }), plan, prevPlan)).toHaveLength(1);
    // Complete in both plans: the 2% rule applies.
    expect(compareTotals(t({ "2024": 700 }), t({ "2024": 1000 }), plan, prevPlan)).toHaveLength(1);
  });
});

describe("compareTotals: a complete year the new build lost", () => {
  const quarters = (years: number[], skip = "") =>
    years.flatMap((year) => [1, 2, 3, 4].map((quarter) => ({ year, quarter }))).filter((f) => `${f.year}-${f.quarter}` !== skip);

  it("flags a live complete year missing from this build (one cached quarter gone: FY2025 Q2)", () => {
    const livePlan: YearPlans = { ...plan, lca: selectionFor("lca", quarters([2024, 2025, 2026])) };
    const nextPlan: YearPlans = { ...plan, lca: selectionFor("lca", quarters([2024, 2025, 2026], "2025-2")) };
    expect(nextPlan.lca.complete).toEqual([2024, 2026]);
    const problems = compareTotals(t({ "2024": 100, "2025": 100, "2026": 100 }), t({ "2024": 100, "2026": 100 }), nextPlan, livePlan);
    expect(problems).toEqual([expect.stringContaining("lca 2025")]);
    expect(problems[0]).toContain("missing");
  });

  it("flags a live complete year that is only partial now", () => {
    const livePlan: YearPlans = { ...plan, lca: { complete: [2024, 2025, 2026] } };
    const nextPlan: YearPlans = { ...plan, lca: { complete: [2024, 2025], partial: { year: 2026, through: 3 } } };
    const totals = t({ "2024": 100, "2025": 100, "2026": 100 });
    expect(compareTotals(totals, totals, nextPlan, livePlan)).toEqual([expect.stringContaining("lca 2026")]);
  });

  it("lets the oldest complete year roll off when a newer complete year arrived", () => {
    const livePlan: YearPlans = { ...plan, lca: { complete: [2024, 2025, 2026] } };
    const nextPlan: YearPlans = { ...plan, lca: { complete: [2025, 2026, 2027] } };
    const prev = t({ "2024": 100, "2025": 100, "2026": 100 });
    expect(compareTotals(prev, t({ "2025": 100, "2026": 100, "2027": 90 }), nextPlan, livePlan)).toEqual([]);
    const liveLmia: YearPlans = { ...plan, lmia: { complete: [2023, 2024, 2025] } };
    const nextLmia: YearPlans = { ...plan, lmia: { complete: [2024, 2025, 2026] } };
    expect(compareTotals(t({}), t({}), nextLmia, liveLmia)).toEqual([]);
  });

  it("flags the oldest complete year lost without a newer one (one cached quarter of FY2024 gone)", () => {
    const livePlan: YearPlans = { ...plan, lca: selectionFor("lca", quarters([2024, 2025, 2026])) };
    const nextPlan: YearPlans = { ...plan, lca: selectionFor("lca", quarters([2024, 2025, 2026], "2024-2")) };
    expect(nextPlan.lca.complete).toEqual([2025, 2026]);
    expect(compareTotals(t({}), t({}), nextPlan, livePlan)).toEqual([expect.stringContaining("lca 2024")]);
  });

  it("flags PERM FY2025 lost when its cumulative Q4 file is gone", () => {
    const livePlan: YearPlans = { ...plan, perm: { complete: [2025, 2026] } };
    const nextPlan: YearPlans = { ...plan, perm: { complete: [2026] } };
    expect(compareTotals(t({}), t({}), nextPlan, livePlan)).toEqual([expect.stringContaining("perm 2025")]);
  });

  it("checks every source, and flags them all when this build has no complete year", () => {
    const livePlan: YearPlans = { lca: { complete: [2025] }, perm: { complete: [2025] }, lmia: { complete: [2024, 2025] } };
    const nextPlan: YearPlans = { lca: { complete: [2025] }, perm: { complete: [] }, lmia: { complete: [2025] } };
    const problems = compareTotals(t({}), t({}), nextPlan, livePlan);
    expect(problems).toEqual([expect.stringContaining("perm 2025"), expect.stringContaining("lmia 2024")]);
  });
});

describe("compareWithPublished", () => {
  it("warns when a total is more than 2% from the government's published figure", () => {
    const warnings = compareWithPublished(t({ "2025": 1000 }), { lca: { "2025": 1100 } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("lca 2025");
    expect(compareWithPublished(t({ "2025": 1000 }), { lca: { "2025": 1015 } })).toEqual([]);
  });

  it("skips years and programs the published figures do not cover", () => {
    expect(compareWithPublished(t({ "2025": 1000 }), {})).toEqual([]);
    expect(compareWithPublished(t({ "2025": 1000 }), { lca: { "2024": 1 }, lmia: { "2025": 9 } })).toEqual([]);
  });

  it("has an empty PUBLISHED_TOTALS until figures are filled in by hand", () => {
    expect(PUBLISHED_TOTALS).toEqual({});
    expect(compareWithPublished(t({ "2025": 1000 }), PUBLISHED_TOTALS)).toEqual([]);
  });
});
