// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentFiscalYear,
  selectYears,
  latestQuarterFiles,
  lcaUrl,
  permUrl,
  lcaUrlCandidates,
  permUrlCandidates,
  contiguousQuarters,
  filesToRead,
  CUMULATIVE,
  FIRST_YEAR,
  EXPECTED_COLUMNS,
} from "../../pipeline/sources";
import {
  parseLmiaResource,
  selectLmiaResources,
  planLmiaDownloads,
  isManifestFresh,
  probePlan,
  fetchToFile,
  selectionFor,
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
  it("lists the legacy and the /media/ location for each quarter", () => {
    expect(lcaUrlCandidates(2026, 4)).toEqual([lcaUrl(2026, 4), "https://www.dol.gov/media/LCA_Disclosure_Data_FY2026_Q4.xlsx"]);
    expect(permUrlCandidates(2026, 4)[1]).toBe("https://www.dol.gov/media/PERM_Disclosure_Data_FY2026_Q4.xlsx");
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
      { name: "Positive LMIA 2023Q2 (EN)", language: ["en"], format: "XLS", url: "https://x/tfwp_2023q2_pos_en.xlsx" },
      { name: "Positive LMIA 2020Q2 (EN)", language: ["en"], format: "XLS", url: "https://x/old_2020q2.xls" },
    ];
    const kept = selectLmiaResources(resources);
    expect(kept.map((r) => `${r.year}Q${r.quarter}`)).toEqual(["2026Q1", "2025Q4", "2023Q2"]);
  });

  it("downloads every quarter of the selected calendar years for LMIA", () => {
    const q = (year: number, quarters: number[]) => quarters.map((quarter) => ({ year, quarter, url: `u${year}${quarter}` }));
    const kept = [...q(2022, [1, 2, 3, 4]), ...q(2023, [4]), ...q(2024, [1, 2, 3, 4]), ...q(2025, [1, 2, 3, 4]), ...q(2026, [1, 2])];
    const plan = planLmiaDownloads(kept);
    // 2023 has no Q1 to Q3, so it is not complete; 2022 is older than the 3 most recent complete years
    expect(plan.map((r) => `${r.year}q${r.quarter}`)).toEqual([
      "2022q1", "2022q2", "2022q3", "2022q4", "2024q1", "2024q2", "2024q3", "2024q4",
      "2025q1", "2025q2", "2025q3", "2025q4", "2026q1", "2026q2",
    ]);
  });

  it("never selects years before the source's first year", () => {
    expect(selectYears({ 2023: 4, 2024: 4, 2025: 4 }, FIRST_YEAR.lca)).toEqual({ complete: [2024, 2025] });
    const found = [4, 3, 2, 1].flatMap((quarter) => [2024, 2025].map((year) => ({ year, quarter })));
    expect(selectionFor("perm", found)).toEqual({ complete: [2025] });
  });

  it("skips a manifest entry only when the file hash matches", () => {
    const entry = { sha256: "abc" } as { sha256: string };
    expect(isManifestFresh(entry as never, "abc")).toBe(true);
    expect(isManifestFresh(entry as never, "def")).toBe(false);
    expect(isManifestFresh(undefined, "abc")).toBe(false);
  });
});

describe("fetchToFile", () => {
  const body = (n: number) => new Response("x".repeat(n), { headers: { "content-type": "application/octet-stream" } });

  it("saves a data file and reports its hash", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dl-"));
    const dest = path.join(dir, "a.xlsx");
    const r = await fetchToFile("https://x.test/a", dest, async () => body(5000));
    expect(r.bytes).toBe(5000);
    expect((await readFile(dest)).length).toBe(5000);
  });

  it("rejects an HTML 200 page and leaves nothing behind", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dl-"));
    const dest = path.join(dir, "a.xlsx");
    const html = async () => new Response("<html>" + "x".repeat(5000), { headers: { "content-type": "text/html; charset=UTF-8" } });
    await expect(fetchToFile("https://x.test/a", dest, html)).rejects.toThrow(/HTML/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(dest + ".part")).toBe(false);
  });

  it("rejects a body under 1 KB and removes the .part file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dl-"));
    const dest = path.join(dir, "a.xlsx");
    await expect(fetchToFile("https://x.test/a", dest, async () => body(200))).rejects.toThrow(/200 bytes/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(dest + ".part")).toBe(false);
  });
});

describe("per-quarter sources", () => {
  it("contiguousQuarters finds the highest q with Q1..q all present", () => {
    expect(contiguousQuarters([1, 2, 3, 4])).toBe(4);
    expect(contiguousQuarters([1, 2])).toBe(2);
    expect(contiguousQuarters([4])).toBe(0);
    expect(contiguousQuarters([1, 3, 4])).toBe(1);
    expect(contiguousQuarters([])).toBe(0);
  });

  const entries = [2024, 2025, 2026].flatMap((year) =>
    [1, 2, 3, 4].filter((q) => year < 2026 || q <= 3).map((quarter) => ({ year, quarter })),
  );
  const sel = { complete: [2024, 2025], partial: { year: 2026, through: 2 as const } };

  it("declares which sources are cumulative", () => {
    expect(CUMULATIVE).toEqual({ lca: false, perm: true, lmia: false });
  });

  it("filesToRead reads every quarter up to through for per-quarter sources", () => {
    const got = filesToRead("lca", entries, sel).map((e) => `${e.year}q${e.quarter}`);
    expect(got).toEqual(["2024q1", "2024q2", "2024q3", "2024q4", "2025q1", "2025q2", "2025q3", "2025q4", "2026q1", "2026q2"]);
  });

  it("filesToRead reads only the latest quarter per selected year for cumulative sources", () => {
    const got = filesToRead("perm", entries, sel).map((e) => `${e.year}q${e.quarter}`);
    expect(got).toEqual(["2024q4", "2025q4", "2026q2"]);
  });
});
