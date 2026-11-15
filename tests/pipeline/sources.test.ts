// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  currentFiscalYear,
  selectYears,
  latestQuarterFiles,
  lcaUrl,
  permUrl,
  EXPECTED_COLUMNS,
} from "../../pipeline/sources";
import {
  parseLmiaResource,
  selectLmiaResources,
  planLmiaDownloads,
  isManifestFresh,
  probePlan,
} from "../../pipeline/cli/download";

describe("currentFiscalYear", () => {
  it("rolls over on October 1", () => {
    expect(currentFiscalYear(new Date("2026-11-14"))).toBe(2027);
    expect(currentFiscalYear(new Date("2026-09-30"))).toBe(2026);
  });
});

describe("selectYears", () => {
  it("keeps three complete years and a partial latest year", () => {
    expect(selectYears({ 2023: 4, 2024: 4, 2025: 4, 2026: 3 })).toEqual({
      complete: [2023, 2024, 2025],
      partial: { year: 2026, through: 3 },
    });
  });
  it("drops a latest year with no quarters and older years", () => {
    expect(selectYears({ 2022: 4, 2023: 4, 2024: 4, 2025: 4, 2026: 4, 2027: 0 })).toEqual({
      complete: [2024, 2025, 2026],
    });
  });
  it("handles a short history", () => {
    expect(selectYears({ 2025: 4, 2026: 1 })).toEqual({
      complete: [2025],
      partial: { year: 2026, through: 1 },
    });
  });
});

describe("latestQuarterFiles", () => {
  it("uses only the latest quarter of each year (quarterly files are cumulative)", () => {
    expect(
      latestQuarterFiles([
        { year: 2026, quarter: 2 },
        { year: 2026, quarter: 3 },
        { year: 2025, quarter: 4 },
      ]),
    ).toEqual([
      { year: 2025, quarter: 4 },
      { year: 2026, quarter: 3 },
    ]);
  });
});

describe("url builders and columns", () => {
  it("builds LCA and PERM urls", () => {
    expect(lcaUrl(2026, 3)).toContain("LCA_Disclosure_Data_FY2026_Q3.xlsx");
    expect(permUrl(2025, 4)).toContain("PERM_Disclosure_Data_FY2025_Q4.xlsx");
  });
  it("never allows personal columns", () => {
    const all = [...EXPECTED_COLUMNS.lca, ...EXPECTED_COLUMNS.perm, ...EXPECTED_COLUMNS.lmia];
    const banned = /^(EMPLOYER_POC_|EMP_POC_|AGENT_ATTORNEY_|ATTY_AG_|LAWFIRM_|PREPARER_)|PHONE/i;
    expect(all.filter((c) => banned.test(c))).toEqual([]);
    const usOnly = [...EXPECTED_COLUMNS.lca, ...EXPECTED_COLUMNS.perm];
    expect(usOnly.filter((c) => /ADDRESS|_ADDR/i.test(c))).toEqual([]);
  });
});

describe("download planning", () => {
  it("probePlan lists fiscal years back 5 years, quarter 4 down to 1", () => {
    const plan = probePlan(new Date("2026-11-14"));
    expect(plan[0]).toEqual({ year: 2027, quarter: 4 });
    expect(plan[3]).toEqual({ year: 2027, quarter: 1 });
    expect(plan[4]).toEqual({ year: 2026, quarter: 4 });
    expect(plan).toHaveLength(20);
  });

  it("parses year and quarter from resource names in several forms", () => {
    for (const s of ["x_2026q2.xlsx", "x_2026_Q2.csv", "Q2 2026", "pos-q2-2026.xlsx", "POS 2026Q2"]) {
      expect(parseLmiaResource(s)).toEqual({ year: 2026, quarter: 2 });
    }
    expect(parseLmiaResource("readme.txt")).toBeNull();
  });

  it("keeps English xlsx or csv resources only", () => {
    const resources = [
      { name: "Positive LMIA 2026Q1 (EN)", language: ["en"], format: "XLSX", url: "https://x/a_2026q1_en.xlsx" },
      { name: "Positive LMIA 2026Q1 (FR)", language: ["fr"], format: "XLSX", url: "https://x/a_2026q1_fr.xlsx" },
      { name: "Positive LMIA 2026Q1 notes", language: ["en"], format: "PDF", url: "https://x/a_2026q1.pdf" },
      { name: "Positive LMIA 2025Q4 (EN)", language: ["en"], format: "CSV", url: "https://x/a_2025q4_en.csv" },
    ];
    const kept = selectLmiaResources(resources);
    expect(kept.map((r) => `${r.year}Q${r.quarter}`)).toEqual(["2026Q1", "2025Q4"]);
  });

  it("downloads every quarter of the selected calendar years for LMIA", () => {
    const kept = [
      { year: 2022, quarter: 4, url: "u22" },
      { year: 2023, quarter: 4, url: "u23" },
      { year: 2024, quarter: 1, url: "u24a" },
      { year: 2024, quarter: 4, url: "u24" },
      { year: 2025, quarter: 4, url: "u25" },
      { year: 2026, quarter: 1, url: "u26a" },
      { year: 2026, quarter: 2, url: "u26b" },
    ];
    const plan = planLmiaDownloads(kept);
    expect(plan.map((r) => r.url)).toEqual(["u23", "u24a", "u24", "u25", "u26a", "u26b"]);
  });

  it("skips a manifest entry only when the file hash matches", () => {
    const entry = { sha256: "abc" } as { sha256: string };
    expect(isManifestFresh(entry as never, "abc")).toBe(true);
    expect(isManifestFresh(entry as never, "def")).toBe(false);
    expect(isManifestFresh(undefined, "abc")).toBe(false);
  });
});
