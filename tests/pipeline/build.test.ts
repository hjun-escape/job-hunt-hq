// @vitest-environment node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OwnerResult } from "../../pipeline/aggregate/accumulate";
import { readLiveMeta, runBuild, screenNames, staleness, summaryEntries, writeSummaries } from "../../pipeline/build";
import { checkSizes } from "../../pipeline/check/sizes";
import { parseArgs, problemsReport, summaryLines, unexpectedProblem } from "../../pipeline/cli/build";
import { normalizeName, usEmployerId } from "../../pipeline/normalize/names";
import type { IndexEntry, Meta } from "../../pipeline/schema/published";
import { EXPECTED_COLUMNS, lcaUrl, permUrl, type SourceFile } from "../../pipeline/sources";

// Lets a test make chosen rm calls fail, to exercise the summary swap's cleanup.
const rmHook = vi.hoisted(() => ({ fail: null as null | ((target: string) => boolean) }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rm: (target: string, opts?: Parameters<typeof actual.rm>[1]) =>
      rmHook.fail?.(String(target))
        ? Promise.reject(Object.assign(new Error("injected rm failure"), { code: "EBUSY" }))
        : actual.rm(target, opts),
  };
});

const root = mkdtempSync(path.join(tmpdir(), "build-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// Within 150 days of each fixture source's newest quarter (LCA FY2026 Q1 and LMIA 2025 Q4 end 2025-12-31,
// PERM FY2025 Q4 ends 2025-09-30), so the staleness alarm (R44) stays quiet.
const TODAY = new Date("2026-02-15T00:00:00.000Z");
let n = 0;
const fresh = (label: string) => path.join(root, `${label}-${++n}`);

/**
 * Writes a workbook, then repacks it with workbook.xml, styles and shared strings before the sheets (the
 * order the streaming reader resolves without spooling; see rows.test.ts for the exceljs small-file race).
 */
async function xlsx(file: string, rows: unknown[][]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const r of rows) ws.addRow(r);
  mkdirSync(path.dirname(file), { recursive: true });
  await wb.xlsx.writeFile(file);
  const src = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(src.files).filter((f) => !src.files[f].dir);
  const rank = (f: string) =>
    f.startsWith("xl/worksheets/") ? 2 : f === "xl/styles.xml" || f === "xl/sharedStrings.xml" ? 1 : 0;
  names.sort((a, b) => rank(a) - rank(b));
  const out = new JSZip();
  for (const f of names) out.file(f, await src.files[f].async("nodebuffer"));
  writeFileSync(file, await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

// ---- Fixture rows -----------------------------------------------------------------------------------

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** Personal columns the government files carry; readRows must drop every one of them. */
const LCA_PERSONAL = {
  EMPLOYER_POC_EMAIL: "poc@example.com",
  EMPLOYER_POC_LAST_NAME: "Pocname",
  PREPARER_EMAIL: "preparer@example.com",
  DECL_PREP_EMAIL: "declarant@example.com",
};
const LCA_HEADER = ["EMPLOYER_POC_EMAIL", ...EXPECTED_COLUMNS.lca, "EMPLOYER_POC_LAST_NAME", "PREPARER_EMAIL", "DECL_PREP_EMAIL"];

type Lca = {
  name: string; fein: string; date: Date; pay?: number; zip?: string; state?: string; visa?: string; trade?: string;
  caseNo?: string; status?: string;
};
function lcaRow(r: Lca): unknown[] {
  const row: Record<string, unknown> = {
    ...LCA_PERSONAL,
    CASE_NUMBER: r.caseNo ?? "", CASE_STATUS: r.status ?? "Certified", DECISION_DATE: r.date, VISA_CLASS: r.visa ?? "H-1B", JOB_TITLE: "Software Engineer",
    SOC_CODE: "15-1252.00", TOTAL_WORKER_POSITIONS: 1, NEW_EMPLOYMENT: 1, CONTINUED_EMPLOYMENT: 0,
    CHANGE_PREVIOUS_EMPLOYMENT: 0, NEW_CONCURRENT_EMPLOYMENT: 0, CHANGE_EMPLOYER: 0, AMENDED_PETITION: 0,
    EMPLOYER_NAME: r.name, TRADE_NAME_DBA: r.trade ?? "", EMPLOYER_STATE: r.state ?? "CA", EMPLOYER_FEIN: r.fein,
    WORKSITE_COUNTY: "", WORKSITE_STATE: r.state ?? "CA", WORKSITE_POSTAL_CODE: r.zip ?? "94043",
    WAGE_RATE_OF_PAY_FROM: r.pay ?? 150000, WAGE_UNIT_OF_PAY: "Year", PW_WAGE_LEVEL: "II",
  };
  return LCA_HEADER.map((h) => row[h]);
}

const PERM_HEADER = [...EXPECTED_COLUMNS.perm, "EMP_POC_EMAIL", "DECL_PREP_EMAIL"];
function permRow(name: string, fein: string, date: Date): unknown[] {
  const row: Record<string, unknown> = {
    CASE_STATUS: "Certified", DECISION_DATE: date, EMP_BUSINESS_NAME: name, EMP_TRADE_NAME: "", EMP_FEIN: fein,
    EMP_STATE: "CA", JOB_TITLE: "Software Engineer", PWD_SOC_CODE: "15-1252", JOB_OPP_WAGE_FROM: 160000,
    JOB_OPP_WAGE_PER: "Year", PRIMARY_WORKSITE_COUNTY: "", PRIMARY_WORKSITE_STATE: "CA",
    PRIMARY_WORKSITE_POSTAL_CODE: "94043", EMP_POC_EMAIL: "permpoc@example.com", DECL_PREP_EMAIL: "permdecl@example.com",
  };
  return PERM_HEADER.map((h) => row[h]);
}

const LMIA_HEADER = [
  "Province/Territory", "Program Stream", "Employer", "Address", "Occupation", "Incorporate Status",
  "Approved LMIAs", "Approved Positions",
];
function lmiaRow(name: string, province: string, address: string, lmias: number, positions: number): unknown[] {
  return [province, "Global Talent Stream", name, address, "21231-Software engineers and designers", "Yes", lmias, positions];
}
const NORTH_CA = "Northern Lights Software Inc."; // in its own profile by (name, province)
const TORONTO = "111 Richmond Street West, Toronto, ON M5H 2G4";
const VANCOUVER = "1 Testing Lane, Vancouver, BC V6B 1A1";

const G = { name: "GOOGLE LLC", fein: "12-3456789" }; // in the profile by FEIN
const GPS = { name: "Google Public Sector LLC", fein: "98-7654321" }; // in the profile by legal name
const SMALL = { name: "SMALL FIRM LLC", fein: "55-1234567" };
const WEAK = { name: "John A. Smith", fein: "33-3333333" };
const STRONG = { name: "JANE DOE MD PC", fein: "44-4444444" };
const POSTAL = { name: "A1B2C3 HOLDINGS INC", fein: "66-6666666" };
const ACME = { name: "ACME ROBOTICS INC", fein: "77-7777777" };
const ORTHO = { name: "LEE ORTHODONTICS DDS PC", fein: "22-2222222" }; // strong person-like, but profiled
/** FEINs no profile lists: they must never be published (a profiled FEIN is public in its profile). */
const UNLISTED_FEINS = [GPS, ORTHO, SMALL, WEAK, STRONG, POSTAL, ACME].flatMap((e) => [e.fein, e.fein.replace("-", "")]);

const lca = (e: { name: string; fein: string }, date: Date, extra: Partial<Lca> = {}) => lcaRow({ ...e, date, ...extra });

/** FY2025 Q1 to Q4 and FY2026 Q1 (one quarter each), PERM FY2025 Q2 and Q4 (cumulative), LMIA 2025 Q1 to Q4. */
/** R43: a case certified in one quarter is listed again as Certified - Withdrawn in the quarter it is withdrawn. */
const RECENT_CASE = "I-200-24355-000001"; // received 20 December 2024, 12 days before FY2025 Q2
const OLD_CASE = "I-200-24150-000002"; // received 29 May 2024, long before FY2025 Q3
const relisted = (caseNo: string, date: Date) => lca(G, date, { caseNo, status: "Certified - Withdrawn" });
const LCA_FILES: Record<string, unknown[][]> = {
  "2025-1": [
    lca(G, day(2024, 10, 15), { pay: 140000 }), lca(G, day(2024, 11, 15), { pay: 145000 }),
    lca(G, day(2024, 12, 27), { pay: 150000, caseNo: RECENT_CASE }), lca(WEAK, day(2024, 11, 1)), lca(STRONG, day(2024, 11, 2)),
  ],
  "2025-2": [
    relisted(RECENT_CASE, day(2025, 2, 1)), // only the case numbers seen in the earlier file catch this one
    lca(G, day(2025, 1, 15), { pay: 155000 }), lca(G, day(2025, 2, 15), { pay: 160000 }),
    lca(G, day(2025, 3, 15), { pay: 165000 }), lca(GPS, day(2025, 1, 20)), lca(GPS, day(2025, 2, 20)),
    lca(SMALL, day(2025, 2, 1)), lca(SMALL, day(2025, 3, 1)), lca(WEAK, day(2025, 2, 2)),
    lca(STRONG, day(2025, 2, 3)), lca(STRONG, day(2025, 3, 3)),
    lca(ORTHO, day(2025, 1, 5)), lca(ORTHO, day(2025, 2, 5)), lca(ORTHO, day(2025, 3, 5)),
  ],
  "2025-3": [
    relisted(OLD_CASE, day(2025, 5, 1)), // the receipt date catches this one: its first listing is outside the build
    lca(G, day(2025, 4, 15), { pay: 170000 }), lca(G, day(2025, 5, 15), { pay: 175000 }),
    lca(G, day(2025, 6, 15), { pay: 180000 }), lca(G, day(2025, 6, 16), { visa: "H-2B" }),
    lca(POSTAL, day(2025, 4, 1)), lca(POSTAL, day(2025, 5, 1)), lca(POSTAL, day(2025, 6, 1)),
  ],
  "2025-4": [
    lca(G, day(2025, 7, 15), { pay: 185000 }), lca(G, day(2025, 8, 15), { pay: 190000 }),
    lca(G, day(2025, 9, 15), { pay: 195000 }), lca(GPS, day(2025, 7, 20)), lca(GPS, day(2025, 8, 20)),
    ...[1, 2, 3, 4].map((d) => lca(ACME, day(2025, 8, d), { state: "WA", zip: "98101" })),
  ],
  "2026-1": [lca(G, day(2025, 10, 15)), lca(G, day(2025, 11, 15)), lca(G, day(2025, 12, 15))],
};
const PERM_Q4 = [1, 2, 3, 4, 5].map((m) => permRow(G.name, G.fein, day(2025, m, 10)));
const PERM_Q2 = PERM_Q4.slice(0, 3); // cumulative: Q4 repeats these, so reading both would double-count
const LMIA_FILES: Record<string, unknown[][]> = {
  "2025q1": [lmiaRow(NORTH_CA, "Ontario", TORONTO, 2, 3), lmiaRow("Maple Software Ltd", "British Columbia", VANCOUVER, 1, 1)],
  "2025q2": [lmiaRow(NORTH_CA, "Ontario", TORONTO, 1, 2)],
  "2025q3": [["Note: employers whose names include a person's name are not listed", "", "", "", "", "", "", ""]],
  "2025q4": [lmiaRow(NORTH_CA, "Ontario", TORONTO, 1, 1)],
};

function entry(source: "lca" | "perm" | "lmia" | "zcta", rel: string, url: string, year?: number, quarter?: number): SourceFile {
  return { source, ...(year ? { year, quarter } : {}), url, path: rel, sha256: "0".repeat(64), bytes: 1, fetchedAt: "2026-11-10T00:00:00.000Z" } as SourceFile;
}

async function lmiaFile(file: string, rows: unknown[][], header = LMIA_HEADER) {
  await xlsx(file, [["Positive Labour Market Impact Assessment (LMIA) Employers List"], header, ...rows]);
}

async function makeCache(dir: string): Promise<void> {
  const manifest: SourceFile[] = [];
  for (const [key, rows] of Object.entries(LCA_FILES)) {
    const [fy, q] = key.split("-").map(Number);
    const rel = `lca/lca_fy${fy}_q${q}.xlsx`;
    await xlsx(path.join(dir, rel), [LCA_HEADER, ...rows]);
    manifest.push(entry("lca", rel, lcaUrl(fy, q), fy, q));
  }
  for (const [q, rows] of [[2, PERM_Q2], [4, PERM_Q4]] as const) {
    const rel = `perm/perm_fy2025_q${q}.xlsx`;
    await xlsx(path.join(dir, rel), [PERM_HEADER, ...rows]);
    manifest.push(entry("perm", rel, permUrl(2025, q), 2025, q));
  }
  for (const [key, rows] of Object.entries(LMIA_FILES)) {
    const rel = `lmia/lmia_${key}.xlsx`;
    await lmiaFile(path.join(dir, rel), rows);
    const url = `https://open.canada.ca/data/dataset/90fed587/resource/r/download/tfwp_${key}_pos_en.xlsx`;
    manifest.push(entry("lmia", rel, url, 2025, Number(key.slice(-1))));
  }
  // A reference source in the manifest: never read by the build, never listed in meta.json.
  manifest.push(entry("zcta", "zcta/tab20.txt", "https://www2.census.gov/geo/tab20.txt"));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

const GOOGLE_YAML = `id: google.com
name: Google
countries: [US]
entities:
  usFeins: ["123456789"]
  usNames: ["Google Public Sector LLC"]
`;
const NORTH_YAML = `id: northernlights.test
name: Northern Lights
countries: [CA]
entities:
  caNames:
    - { name: Northern Lights Software Inc, province: "ON" }
`;
const ORTHO_YAML = `id: leeortho.test
name: Lee Orthodontics
countries: [US]
entities:
  usNames: ["LEE ORTHODONTICS DDS PC"]
`;
const ROLES_YAML = `- id: software-engineer
  label: Software engineer
  soc: ["15-1"]
  titles: ["software engineer"]
  noc: ["21231"]
`;

function makeDataDir(dir: string, opts: { roles?: string; profiles?: Record<string, string> } = {}): string {
  mkdirSync(path.join(dir, "reference"), { recursive: true });
  mkdirSync(path.join(dir, "companies"), { recursive: true });
  writeFileSync(path.join(dir, "roles.yaml"), opts.roles ?? ROLES_YAML);
  const ref = (name: string, text: string) => writeFileSync(path.join(dir, "reference", name), text);
  ref("us-counties-cbsa.csv", 'state,county,cbsa,title\nCA,Santa Clara County,41940,"San Jose-Sunnyvale-Santa Clara, CA"\nWA,King County,42660,"Seattle-Tacoma-Bellevue, WA"\n');
  ref("us-zip-cbsa.csv", "zip,cbsa\n94043,41940\n98101,42660\n");
  ref("ca-csd-cma.csv", "province,csd,cma,title\nON,Toronto,535,Toronto\nBC,Vancouver,933,Vancouver\n");
  ref("ca-aliases.csv", "province,alias,csd\n");
  for (const [name, text] of Object.entries(opts.profiles ?? { "google.com.yaml": GOOGLE_YAML, "leeortho.test.yaml": ORTHO_YAML, "northernlights.test.yaml": NORTH_YAML })) {
    writeFileSync(path.join(dir, "companies", name), text);
  }
  return dir;
}

// ---- Output helpers ---------------------------------------------------------------------------------

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((rel) => statSync(path.join(dir, rel)).isFile())
    .map((rel) => rel.split(path.sep).join("/"))
    .sort();
}
const allText = (dir: string) => walk(dir).map((rel) => readFileSync(path.join(dir, rel), "utf8")).join("\n");
const readJson = (dir: string, rel: string) => JSON.parse(readFileSync(path.join(dir, rel), "utf8"));
const tree = (dir: string) => Object.fromEntries(walk(dir).map((rel) => [rel, readFileSync(path.join(dir, rel)).toString("base64")]));

function idByName(outDir: string, name: string): string | undefined {
  for (const rel of walk(path.join(outDir, "data/v1/index"))) {
    const entries = readJson(outDir, `data/v1/index/${rel}`) as IndexEntry[];
    const hit = entries.find((e) => e.name === name);
    if (hit) return hit.id;
  }
  return undefined;
}
function blockFor(outDir: string, name: string, year: number) {
  const id = idByName(outDir, name);
  if (!id) return undefined;
  const record = readJson(outDir, `data/v1/employers/${id.slice(0, 2)}/${id.slice(3, 6)}.json`);
  return (record[id].sponsorship.lca as { year: number }[]).find((b) => b.year === year);
}

const metaResponse = (meta: unknown) => async () => new Response(JSON.stringify(meta), { status: 200 });

// ---- Tests --------------------------------------------------------------------------------------------

describe("runBuild end to end", () => {
  const cacheDir = path.join(root, "cache");
  const dataDir = path.join(root, "data");
  const outDir = path.join(root, "out");
  let r: Awaited<ReturnType<typeof runBuild>>;

  beforeAll(async () => {
    await makeCache(cacheDir);
    makeDataDir(dataDir);
    r = await runBuild({ cacheDir, outDir, dataDir, today: TODAY });
  }, 60_000);

  it("builds end to end from small generated files", () => {
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    const google = readJson(outDir, "data/v1/companies/google.com.json");
    expect(google.legalNames).toHaveLength(2);
    expect(google.legalNames).toEqual(["GOOGLE LLC", "Google Public Sector LLC"]);
    const lca2025 = google.sponsorship.lca.find((b: { year: number }) => b.year === 2025);
    expect(lca2025.total.filings).toBe(16);
    // R41: the LCA headline (summary CSV, index h) is certified filings.
    expect(readFileSync(path.join(dataDir, "summary", "lca-2025.csv"), "utf8")).toContain("google.com,Google,US-CA,16,16");
    expect((readJson(outDir, "data/v1/index/profiles.json") as IndexEntry[]).find((e) => e.id === "google.com")!.h).toBe(16);
    const north = readJson(outDir, "data/v1/companies/northernlights.test.json");
    expect(north.legalNames).toEqual([NORTH_CA]);
    expect(north.sponsorship.lmia.find((b: { year: number }) => b.year === 2025).total).toMatchObject({ lmias: 4, positions: 6 });
    expect(blockFor(outDir, "SMALL FIRM LLC", 2025)).toEqual(expect.objectContaining({ tooFew: true }));
  });

  it("publishes no personal columns, street lines, person-named employers or unlisted FEINs, in the site or the summaries", () => {
    const text = `${allText(outDir)}\n${allText(path.join(dataDir, "summary"))}`;
    expect(text).not.toMatch(/example\.com|JANE DOE|John A\. Smith|JOHN A SMITH|Pocname|Richmond|M5H|Testing Lane|V6B/);
    for (const fein of UNLISTED_FEINS) expect(text).not.toContain(fein);
    expect(walk(path.join(dataDir, "summary"))).toEqual(["lca-2025.csv", "lca-2026.csv", "lmia-2025.csv", "perm-2025.csv"]);
  });

  it("keeps a strong person-like employer only when a profile claims it", () => {
    const ortho = readJson(outDir, "data/v1/companies/leeortho.test.json");
    expect(ortho.legalNames).toEqual(["LEE ORTHODONTICS DDS PC"]);
    expect(ortho.sponsorship.lca[0]).toMatchObject({ year: 2025, total: { filings: 3 } });
  });

  it("skips withdrawal relistings across files and by receipt date, and reports only the count (R43)", () => {
    expect(r.stats.files.map((f) => f.skippedRelisted ?? null)).toEqual([0, 1, 1, 0, 0, null, null, null, null, null]);
    const meta = readJson(outDir, "data/v1/meta.json") as Meta;
    const line = meta.warnings.find((w) => w.includes("relist"));
    expect(line).toBe(
      'lca: 2 "Certified - Withdrawn" rows were left out as relistings of cases certified in an earlier quarter',
    );
    expect(r.warnings).toContain(line);
    expect(allText(outDir)).not.toMatch(/I-200-/);
  });

  it("drops a weak person-named unprofiled owner with few filings and counts it", () => {
    expect(r.stats.droppedPersonLike).toBe(1);
    expect(idByName(outDir, WEAK.name)).toBeUndefined();
  });

  it("drops an unprofiled owner whose filed name looks like a postal code, with a warning naming only its id", () => {
    const id = usEmployerId(POSTAL.fein.replace("-", ""), normalizeName(POSTAL.name), "CA");
    expect(r.stats.droppedPostal).toBe(1);
    expect(allText(outDir)).not.toContain("A1B2C3");
    const warning = r.warnings.find((w) => w.includes(id));
    expect(warning).toBeDefined();
    expect(warning).not.toContain("A1B2C3");
    expect((readJson(outDir, "data/v1/meta.json") as Meta).warnings).toContain(warning);
    // Ids appear in the site only for owners that are published.
    expect(allText(path.join(outDir, "data/v1/index"))).not.toContain(id);
    expect(existsSync(path.join(outDir, `data/v1/employers/us/${id.slice(3, 6)}.json`))).toBe(false);
  });

  it("reads every quarter of LCA and LMIA, only the latest PERM quarter, and lists only those in meta", () => {
    const meta = readJson(outDir, "data/v1/meta.json") as Meta;
    expect(meta.years).toEqual({
      lca: { complete: [2025], partial: { year: 2026, through: 1 } },
      perm: { complete: [2025] },
      lmia: { complete: [2025] },
    });
    expect(meta.totals).toEqual({ lca: { "2025": 28, "2026": 3 }, perm: { "2025": 5 }, lmia: { "2025": 5 } });
    expect(meta.sources.map((s) => `${s.source} ${s.year} ${s.quarter}`)).toEqual([
      "lca 2025 1", "lca 2025 2", "lca 2025 3", "lca 2025 4", "lca 2026 1",
      "lmia 2025 1", "lmia 2025 2", "lmia 2025 3", "lmia 2025 4",
      "perm 2025 4",
    ]);
    expect(JSON.stringify(meta.sources)).not.toContain("path");
    expect(meta.builtAt).toBe(TODAY.toISOString());
    expect(r.stats.totals).toEqual(meta.totals);
    expect(r.stats.files.map((f) => f.path)).toHaveLength(10);
  });

  it("labels roles and places from the data dir", () => {
    const meta = readJson(outDir, "data/v1/meta.json") as Meta;
    expect(meta.roles["software-engineer"]).toBe("Software engineer");
    expect(meta.places["cbsa:41940"]).toBe("San Jose-Sunnyvale-Santa Clara, CA");
    expect(meta.places["cma:535"]).toBe("Toronto");
  });

  it("lists what it wrote", () => {
    expect(r.files.map((f) => f.path)).toEqual(walk(outDir));
    expect(r.stats.owners.total).toBe(r.stats.owners.us + r.stats.owners.ca - r.stats.owners.both);
  });

  it("gives byte-identical trees for two runs into fresh out dirs, and passes against its own live meta", async () => {
    const summary = tree(path.join(dataDir, "summary"));
    const out2 = fresh("out");
    const liveMeta = readJson(outDir, "data/v1/meta.json");
    const r2 = await runBuild({
      cacheDir, outDir: out2, dataDir, today: TODAY,
      liveMetaUrl: "https://pages.invalid/data/v1/meta.json", fetchFn: metaResponse(liveMeta),
    });
    expect(r2.problems).toEqual([]);
    expect(r2.ok).toBe(true);
    expect(tree(out2)).toEqual(tree(outDir));
    expect(r2.files).toEqual(r.files);
    expect(tree(path.join(dataDir, "summary"))).toEqual(summary);
  }, 60_000);

  it("fails on a totals jump against the live meta, without writing summaries", async () => {
    const live = readJson(outDir, "data/v1/meta.json");
    live.totals.lca["2025"] = 1000;
    const data2 = makeDataDir(fresh("data"));
    const r3 = await runBuild({
      cacheDir, outDir: fresh("out"), dataDir: data2, today: TODAY,
      liveMetaUrl: "https://pages.invalid/data/v1/meta.json", fetchFn: metaResponse(live),
    });
    expect(r3.ok).toBe(false);
    expect(r3.problems.join("\n")).toContain("lca 2025");
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
  }, 60_000);

  it("passes a totals jump with acceptTotalsChange, recording it as a warning in meta.json (R36)", async () => {
    const live = readJson(outDir, "data/v1/meta.json");
    live.totals.lca["2025"] = 1000;
    const data2 = makeDataDir(fresh("data"));
    const out2 = fresh("out");
    const r = await runBuild({
      cacheDir, outDir: out2, dataDir: data2, today: TODAY, acceptTotalsChange: true,
      liveMetaUrl: "https://pages.invalid/data/v1/meta.json", fetchFn: metaResponse(live),
    });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    const accepted = r.warnings.filter((w) => w.startsWith("accepted totals change: "));
    expect(accepted).toEqual([expect.stringContaining("lca 2025")]);
    expect((readJson(out2, "data/v1/meta.json") as Meta).warnings).toEqual(expect.arrayContaining(accepted));
    expect(existsSync(path.join(data2, "summary", "lca-2025.csv"))).toBe(true);
  }, 60_000);

  it("refuses a build that lost a complete year of the live build, unless the change is accepted", async () => {
    const live = readJson(outDir, "data/v1/meta.json") as Meta;
    live.years.lca = { complete: [2025, 2026] }; // live had FY2026 complete; this build has it partial
    const url = "https://pages.invalid/data/v1/meta.json";
    const data2 = makeDataDir(fresh("data"));
    const refused = await runBuild({ cacheDir, outDir: fresh("out"), dataDir: data2, today: TODAY, liveMetaUrl: url, fetchFn: metaResponse(live) });
    expect(refused.ok).toBe(false);
    expect(refused.problems).toEqual([expect.stringContaining("lca 2026")]);
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
    const accepted = await runBuild({
      cacheDir, outDir: fresh("out"), dataDir: data2, today: TODAY, liveMetaUrl: url, fetchFn: metaResponse(live),
      acceptTotalsChange: true,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/^accepted totals change: lca 2026/)]));
  }, 60_000);

  it("warns when the live meta.json is a 404 and treats the build as a first build", async () => {
    const out2 = fresh("out");
    const r = await runBuild({
      cacheDir, outDir: out2, dataDir: makeDataDir(fresh("data")), today: TODAY,
      liveMetaUrl: "https://pages.invalid/data/v1/meta.json", fetchFn: async () => new Response("", { status: 404 }),
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain("live meta.json returned 404; treated as a first build");
    expect((readJson(out2, "data/v1/meta.json") as Meta).warnings).toContain("live meta.json returned 404; treated as a first build");
  }, 60_000);

  it("passes with a warning when only the cleanup of the previous summaries fails", async () => {
    const data2 = makeDataDir(fresh("data"));
    mkdirSync(path.join(data2, "summary"));
    writeFileSync(path.join(data2, "summary", "lca-2025.csv"), "old\n");
    rmHook.fail = (target) => target.endsWith("-previous");
    let r: Awaited<ReturnType<typeof runBuild>>;
    try {
      r = await runBuild({ cacheDir, outDir: fresh("out"), dataDir: data2, today: TODAY });
    } finally {
      rmHook.fail = null;
    }
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(expect.arrayContaining([expect.stringContaining("could not remove the previous summaries directory")]));
    expect(readFileSync(path.join(data2, "summary", "lca-2025.csv"), "utf8")).not.toBe("old\n");
  }, 60_000);

  it("still refuses an unreadable live meta.json with acceptTotalsChange", async () => {
    const data2 = makeDataDir(fresh("data"));
    const r = await runBuild({
      cacheDir, outDir: fresh("out"), dataDir: data2, today: TODAY, acceptTotalsChange: true,
      liveMetaUrl: "https://pages.invalid/data/v1/meta.json", fetchFn: async () => new Response("", { status: 503 }),
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toContain("refusing to compare");
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
  }, 60_000);

  it("fails without writing summaries when a column is renamed", async () => {
    const cache2 = fresh("cache");
    cpSync(cacheDir, cache2, { recursive: true });
    const renamed = LMIA_HEADER.map((h) => (h === "Approved Positions" ? "Positions Approved" : h));
    await lmiaFile(path.join(cache2, "lmia/lmia_2025q2.xlsx"), LMIA_FILES["2025q2"], renamed);
    const data2 = makeDataDir(fresh("data"));
    const out2 = fresh("out");
    const r4 = await runBuild({ cacheDir: cache2, outDir: out2, dataDir: data2, today: TODAY });
    expect(r4.ok).toBe(false);
    expect(r4.problems.join()).toContain("Approved Positions");
    expect(r4.problems.join()).toContain("lmia_2025q2.xlsx");
    expect(r4.problems.join()).not.toContain(cache2);
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
    expect(existsSync(path.join(out2, "data"))).toBe(false);
    expect(r4.files).toEqual([]);
  }, 60_000);

  it("fails on a profile problem before reading any file", async () => {
    const data2 = makeDataDir(fresh("data"), { profiles: { "google.com.yaml": GOOGLE_YAML.replace("id: google.com", "id: goggle.com") } });
    const out2 = fresh("out");
    const r5 = await runBuild({ cacheDir, outDir: out2, dataDir: data2, today: TODAY });
    expect(r5.ok).toBe(false);
    expect(r5.problems.join("\n")).toContain("google.com.yaml");
    expect(r5.stats.files).toEqual([]);
    expect(existsSync(out2)).toBe(false);
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
  });

  it("reports a site write failure and leaves the previous site in place", async () => {
    const out2 = fresh("out");
    cpSync(outDir, out2, { recursive: true });
    const before = tree(out2);
    const data2 = makeDataDir(fresh("data"), { roles: ROLES_YAML.replace("id: software-engineer", "id: software_engineer") });
    const r6 = await runBuild({ cacheDir, outDir: out2, dataDir: data2, today: TODAY });
    expect(r6.ok).toBe(false);
    expect(r6.problems.join("\n")).toContain("software_engineer");
    expect(tree(out2)).toEqual(before);
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
  }, 60_000);

  it("fails when a source has no files to read, rather than publishing it empty", async () => {
    const cache2 = fresh("cache");
    cpSync(cacheDir, cache2, { recursive: true });
    const manifest = readJson(cache2, "manifest.json") as SourceFile[];
    writeFileSync(path.join(cache2, "manifest.json"), JSON.stringify(manifest.filter((e) => e.source !== "lmia")));
    const out2 = fresh("out");
    const r8 = await runBuild({ cacheDir: cache2, outDir: out2, dataDir, today: TODAY });
    expect(r8.ok).toBe(false);
    expect(r8.problems).toEqual([expect.stringContaining("no lmia files")]);
    expect(existsSync(out2)).toBe(false);
  });

  it("blanks an email or a FEIN typed as a trade name and publishes the owner without it (R34, R35)", async () => {
    const cache2 = fresh("cache");
    cpSync(cacheDir, cache2, { recursive: true });
    const trades = ["hire@acme-robots.invalid", "77-7777777", "777777777", "hire@acme-robots.invalid"];
    const rows = trades.map((trade, i) => lca(ACME, day(2025, 8, i + 1), { state: "WA", zip: "98101", trade }));
    await xlsx(path.join(cache2, "lca/lca_fy2025_q4.xlsx"), [LCA_HEADER, ...LCA_FILES["2025-4"].slice(0, 5), ...rows]);
    const data2 = makeDataDir(fresh("data"));
    const out2 = fresh("out");
    const r9 = await runBuild({ cacheDir: cache2, outDir: out2, dataDir: data2, today: TODAY });
    expect(r9.problems).toEqual([]);
    expect(r9.ok).toBe(true);
    expect(idByName(out2, ACME.name)).toBeDefined();
    expect(`${allText(out2)}\n${allText(path.join(data2, "summary"))}`).not.toMatch(/hire@|777777777|77-7777777/);
    expect(r9.stats.files.reduce((n, f) => n + f.tradeNamesBlanked, 0)).toBe(4);
  }, 60_000);

  it("fails on a personal column name in an unprofiled owner's filed names, naming only its id, and still counts owners", async () => {
    const cache2 = fresh("cache");
    cpSync(cacheDir, cache2, { recursive: true });
    const leaky = { name: "EMPLOYER_POC CONSULTING LLC", fein: "88-8888888" };
    const rows = [1, 2, 3].map((d) => lca(leaky, day(2025, 8, d)));
    await xlsx(path.join(cache2, "lca/lca_fy2025_q4.xlsx"), [LCA_HEADER, ...LCA_FILES["2025-4"], ...rows]);
    const data2 = makeDataDir(fresh("data"));
    const out2 = fresh("out");
    const r9 = await runBuild({ cacheDir: cache2, outDir: out2, dataDir: data2, today: TODAY });
    const id = usEmployerId("888888888", normalizeName(leaky.name), "CA");
    expect(r9.ok).toBe(false);
    expect(r9.problems).toEqual([expect.stringContaining(`owner ${id}`)]);
    expect(r9.problems.join()).not.toMatch(/EMPLOYER_POC|CONSULTING/);
    expect(r9.stats.owners.total).toBeGreaterThan(0);
    expect(existsSync(out2)).toBe(false);
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
  }, 60_000);

  it("fails, naming each stale source and its newest quarter's end, when the files stop advancing (R44)", async () => {
    const data2 = makeDataDir(fresh("data"));
    const out2 = fresh("out");
    const r10 = await runBuild({ cacheDir, outDir: out2, dataDir: data2, today: new Date("2026-03-01T12:00:00.000Z") });
    expect(r10.ok).toBe(false);
    expect(r10.problems).toEqual([
      "perm data looks stale: newest quarter ended 2025-09-30; the source may have moved its files",
    ]);
    expect(existsSync(path.join(data2, "summary"))).toBe(false);
    const late = await runBuild({ cacheDir, outDir: fresh("out"), dataDir: makeDataDir(fresh("data")), today: new Date("2026-11-14T00:00:00.000Z") });
    expect(late.problems).toEqual([
      "lca data looks stale: newest quarter ended 2025-12-31; the source may have moved its files",
      "perm data looks stale: newest quarter ended 2025-09-30; the source may have moved its files",
      "lmia data looks stale: newest quarter ended 2025-12-31; the source may have moved its files",
    ]);
  }, 60_000);

  it("fails when the cache has no manifest", async () => {
    const r7 = await runBuild({ cacheDir: fresh("empty"), outDir: fresh("out"), dataDir, today: TODAY });
    expect(r7.ok).toBe(false);
    expect(r7.problems.join("\n")).toContain("manifest");
  });
});

describe("staleness (R44)", () => {
  const years = {
    lca: { complete: [2024, 2025], partial: { year: 2026, through: 2 as const } },
    perm: { complete: [2025, 2026] },
    lmia: { complete: [2024, 2025], partial: { year: 2026, through: 1 as const } },
  };
  it("uses the newest selected quarter: the partial year's last quarter, else the latest complete year's Q4", () => {
    // LCA FY2026 Q2 ends 2026-03-31, PERM FY2026 Q4 2026-09-30, LMIA 2026 Q1 (calendar) 2026-03-31.
    expect(staleness(years, new Date("2026-08-28T23:00:00Z"))).toEqual([]); // 150 days after 2026-03-31
    expect(staleness(years, new Date("2026-08-29T00:00:00Z"))).toEqual([
      "lca data looks stale: newest quarter ended 2026-03-31; the source may have moved its files",
      "lmia data looks stale: newest quarter ended 2026-03-31; the source may have moved its files",
    ]);
  });
  it("ends fiscal quarters on 31 December, 31 March, 30 June and 30 September", () => {
    const at = (q: 1 | 2 | 3) => staleness({ ...years, lca: { complete: [2025], partial: { year: 2026, through: q } } }, new Date("2030-01-01"))[0];
    expect(at(1)).toContain("ended 2025-12-31");
    expect(at(3)).toContain("ended 2026-06-30");
  });
  it("says nothing for a source with no selected year (the build already fails for that)", () => {
    expect(staleness({ ...years, lca: { complete: [] } }, new Date("2026-04-01"))).toEqual([]);
  });
});

describe("screenNames (R33)", () => {
  const owner = (name: string, also: string[] = []): OwnerResult => ({
    name, also, countries: ["US"], region: null, sponsorship: { trends: {} },
  });

  it("drops an unprofiled owner whose name or other names look like a postal code", () => {
    const owners = new Map([
      ["us-0000000001", owner("A1B2C3 HOLDINGS INC")],
      ["us-0000000002", owner("PLAIN CO", ["k1a 0b1 trading"])],
      ["us-0000000003", owner("ACME INC")],
      ["google.com", owner("A1B2C3 LLC")],
    ]);
    const s = screenNames(owners);
    expect(s.dropped).toEqual(["us-0000000001", "us-0000000002"]);
    expect(s.problems).toEqual([]);
    expect([...s.kept.keys()]).toEqual(["us-0000000003", "google.com"]);
  });

  it("fails on an email or a personal column name, naming the id but never the text", () => {
    const owners = new Map([
      ["us-0000000004", owner("ACME INC", ["sales@leaky.org"])],
      ["ca-0000000005", owner("EMPLOYER_POC A1B2C3 INC")],
    ]);
    const s = screenNames(owners);
    expect(s.problems).toHaveLength(2);
    expect(s.problems[0]).toContain("us-0000000004");
    expect(s.problems[1]).toContain("ca-0000000005");
    expect(s.problems.join("\n")).not.toMatch(/leaky|EMPLOYER_POC|A1B2C3/);
    expect(s.dropped).toEqual([]);
  });

  it("fails on a FEIN in an unprofiled US owner's filed names, never echoing it", () => {
    const own = usEmployerId("123456789", "", null);
    const owners = new Map([
      [own, owner("ACME INC", ["123456789"])], // its own FEIN typed as a trade name
      ["us-0000000006", owner("BETA LLC", ["BETA 98-7654321"])], // the dashed FEIN form
      [usEmployerId("221234567", "", null), owner("EPSILON INC", ["22-1234567"])], // its own, dashed
      ["us-0000000007", owner("GAMMA 555444333 LLC")], // nine digits in the display name
      ["us-0000000008", owner("DELTA 12345678 LLC", ["DELTA 1234567890"])], // 8 and 10 digits: not FEIN-shaped
      ["ca-0000000009", owner("101234567 SASKATCHEWAN LTD")], // a Canadian numbered company
      ["us-0000000010", owner("123456789 Canada Inc.")], // a numbered-company name is a name, not a FEIN (R37)
      [usEmployerId("345678912", "", null), owner("345678912 Canada Inc.")], // ...unless the number is its own FEIN
      ["us-0000000011", owner("ZETA LLC", ["ZETA_123456789"])], // an underscore separator
      ["google.com", owner("GOOGLE LLC", ["77-0493581"])], // profiled: guarded by its profile
    ]);
    const s = screenNames(owners);
    expect(s.problems).toHaveLength(6);
    expect(s.problems[4]).toContain(`owner ${usEmployerId("345678912", "", null)}`);
    expect(s.problems[4]).toContain("its own FEIN");
    expect(s.problems[5]).toContain("us-0000000011");
    expect(s.problems[0]).toContain(`owner ${own}`);
    expect(s.problems[0]).toContain("its own FEIN");
    expect(s.problems[1]).toContain("us-0000000006");
    expect(s.problems[1]).toContain("a FEIN-shaped number");
    expect(s.problems[2]).toContain("its own FEIN");
    expect(s.problems[3]).toContain("us-0000000007");
    expect(s.problems.join("\n")).not.toMatch(/123456789|7654321|1234567|555444333|345678912/);
    expect([...s.kept.keys()]).toEqual(["us-0000000008", "ca-0000000009", "us-0000000010", "google.com"]);
  });
});

describe("summaries", () => {
  it("swaps a complete set into place, keeping earlier years' files and leaving no staging dir", async () => {
    const data = fresh("summary-data");
    mkdirSync(path.join(data, "summary"), { recursive: true });
    writeFileSync(path.join(data, "summary", "lca-2023.csv"), "old 2023\n");
    writeFileSync(path.join(data, "summary", "lca-2024.csv"), "old 2024\n");
    await writeSummaries(data, { "lca-2024.csv": "new 2024\n", "lca-2025.csv": "new 2025\n" });
    expect(tree(path.join(data, "summary"))).toEqual({
      "lca-2023.csv": Buffer.from("old 2023\n").toString("base64"),
      "lca-2024.csv": Buffer.from("new 2024\n").toString("base64"),
      "lca-2025.csv": Buffer.from("new 2025\n").toString("base64"),
    });
    expect(readdirSync(data)).toEqual(["summary"]);
  });

  it("leaves the old summaries untouched when a write fails", async () => {
    const data = fresh("summary-data");
    mkdirSync(path.join(data, "summary"), { recursive: true });
    writeFileSync(path.join(data, "summary", "lca-2024.csv"), "old 2024\n");
    const before = tree(path.join(data, "summary"));
    await expect(writeSummaries(data, { "lca-2024.csv": "new\n", "no-such-dir/lca-2025.csv": "x\n" })).rejects.toThrow();
    expect(tree(path.join(data, "summary"))).toEqual(before);
    expect(readdirSync(data)).toEqual(["summary"]);
  });

  it("warns, and keeps the new summaries, when only removing the previous directory fails", async () => {
    const data = fresh("summary-data");
    mkdirSync(path.join(data, "summary"), { recursive: true });
    writeFileSync(path.join(data, "summary", "lca-2024.csv"), "old 2024\n");
    rmHook.fail = (target) => target.endsWith("-previous");
    try {
      const warnings = await writeSummaries(data, { "lca-2024.csv": "new 2024\n" });
      expect(warnings).toEqual([expect.stringContaining("could not remove the previous summaries directory")]);
    } finally {
      rmHook.fail = null;
    }
    expect(readFileSync(path.join(data, "summary", "lca-2024.csv"), "utf8")).toBe("new 2024\n");
    expect(await writeSummaries(fresh("summary-data"), { "lca-2025.csv": "x\n" })).toEqual([]);
  });

  it("lists the summaries for the size check, under the 50 MB per-file limit", () => {
    const entries = summaryEntries({ "lca-2025.csv": "id,name\n" });
    expect(entries).toEqual([{ path: "summary/lca-2025.csv", bytes: 8, gzipBytes: 0 }]);
    expect(checkSizes([{ ...entries[0], bytes: 50_000_001 }])).toEqual([expect.stringContaining("summary/lca-2025.csv")]);
  });
});

describe("readLiveMeta", () => {
  const URL_ = "https://pages.invalid/data/v1/meta.json";
  const REFUSE = "could not read the live meta.json; refusing to compare";

  it("treats a 404 as the first build", async () => {
    expect(await readLiveMeta(URL_, async () => new Response("not found", { status: 404 }))).toEqual({ ok: true, meta: null });
  });

  it("refuses a network error or any other status", async () => {
    const down = await readLiveMeta(URL_, async () => {
      throw new Error("ECONNRESET");
    });
    expect(down).toMatchObject({ ok: false });
    expect(!down.ok && down.problem).toContain(REFUSE);
    const r503 = await readLiveMeta(URL_, async () => new Response("", { status: 503 }));
    expect(!r503.ok && r503.problem).toContain(REFUSE);
    expect(!r503.ok && r503.problem).toContain("503");
  });

  it("refuses a 200 that is not a valid meta.json", async () => {
    const notJson = await readLiveMeta(URL_, async () => new Response("<html>", { status: 200 }));
    expect(notJson.ok).toBe(false);
    const wrongShape = await readLiveMeta(URL_, metaResponse({ schemaVersion: 1 }));
    expect(wrongShape.ok).toBe(false);
  });
});

describe("dataset:build CLI", () => {
  it("parses --out, --live, --cache, --data and --accept-totals-change, and refuses anything else", () => {
    expect(parseArgs(["--out", "site"])).toEqual({ out: "site", cache: ".cache/dataset", data: "data", acceptTotalsChange: false });
    expect(parseArgs(["--out", "o", "--live", "https://x.invalid/meta.json", "--cache", "c", "--data", "d"])).toEqual({
      out: "o", live: "https://x.invalid/meta.json", cache: "c", data: "d", acceptTotalsChange: false,
    });
    expect(parseArgs(["--accept-totals-change", "--out", "o"])).toMatchObject({ out: "o", acceptTotalsChange: true });
    expect(() => parseArgs(["--accept-totals-change", "yes"])).toThrow("unknown argument");
    expect(() => parseArgs(["--liv", "x"])).toThrow("unknown argument");
    expect(() => parseArgs(["--out"])).toThrow("needs a value");
  });

  it("writes an unexpected error through the safe message: no cache path, nothing personal-looking", () => {
    const cache = path.join(root, "cache");
    expect(unexpectedProblem(new Error(`ENOENT: open '${cache}/lca/x.xlsx'`), cache)).toBe(
      "the build stopped on an unexpected error: ENOENT: open '<cache>/lca/x.xlsx'",
    );
    const leaky = unexpectedProblem(new Error("bad cell near jane@example.org"), cache);
    expect(leaky).not.toContain("jane@");
    expect(leaky).toContain("details withheld");
  });

  it("writes an issue body listing problems and warnings, saying nothing was deployed", () => {
    const body = problemsReport({ problems: ["lca 2025: moved"], warnings: [] }, TODAY);
    expect(body).toContain("## Problems\n\n- lca 2025: moved");
    expect(body).toContain("## Warnings\n\nNone.");
    expect(body).toContain("Nothing was deployed");
  });
});

describe("dataset:build CLI summary", () => {
  it("prints per-source reasons, blanked trade names and seconds, and no names", () => {
    const file = (source: "lca" | "lmia", invalid: Record<string, number>, blanked: number) => ({
      source, path: `${source}/x.xlsx`, year: 2025, quarter: 1, seconds: 1.5, read: 10, kept: 8, skippedPerson: 0,
      skippedInvalid: 2, invalid, tradeNamesBlanked: blanked,
    });
    const lines = summaryLines({
      ok: true, problems: [], warnings: [], files: [],
      stats: {
        years: null, droppedPersonLike: 0, droppedPostal: 0, totals: null,
        owners: { total: 1, us: 1, ca: 0, both: 0, profiled: 0 },
        files: [file("lca", { "email in name": 1, status: 1 }, 3), file("lca", { status: 1 }, 0), file("lmia", {}, 0)],
      },
    });
    expect(lines).toContain(
      "lca: 2 files in 3.0 s, read 20, kept 16, person-named 0, invalid 4 (email in name 1, status 2), trade names blanked 3",
    );
    expect(lines).toContain("lmia: 1 files in 1.5 s, read 10, kept 8, person-named 0, invalid 2, trade names blanked 0");
  });

  it("adds the relisted count for a source whose loader counts them (R43)", () => {
    const file = (skippedRelisted: number) => ({
      source: "lca" as const, path: "lca/x.xlsx", year: 2025, quarter: 1, seconds: 1, read: 10, kept: 8, skippedPerson: 0,
      skippedInvalid: 0, invalid: {}, tradeNamesBlanked: 0, skippedRelisted,
    });
    const lines = summaryLines({
      ok: true, problems: [], warnings: [], files: [],
      stats: {
        years: null, droppedPersonLike: 0, droppedPostal: 0, totals: null,
        owners: { total: 0, us: 0, ca: 0, both: 0, profiled: 0 },
        files: [file(2), file(0)],
      },
    });
    expect(lines).toContain(
      "lca: 2 files in 2.0 s, read 20, kept 16, person-named 0, invalid 0, trade names blanked 0, withdrawal relistings 2",
    );
  });
});
