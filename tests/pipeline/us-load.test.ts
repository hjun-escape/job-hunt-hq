// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { type LoadContext, lcaOutcome, loadUs, mapLcaRow, mapPermRow, permOutcome } from "../../pipeline/load/us";
import { EXPECTED_COLUMNS } from "../../pipeline/sources";
import type { UsFiling } from "../../pipeline/types";

const dir = mkdtempSync(path.join(tmpdir(), "us-load-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const zips: Record<string, string> = { "2139": "metro-boston", "02139": "metro-boston" };
const seen: { title: string; soc: string }[] = [];
const ctx: LoadContext = {
  roles: {
    us: (title: string, soc: string) => (seen.push({ title, soc }), "swe"),
    ca: () => "swe",
    label: (id: string) => id,
    ids: ["swe"],
    defs: [],
  },
  places: {
    us: (county, state, zip) => ({
      metro: zip && zips[zip] ? `cbsa:${zips[zip]}` : county === "KING" ? "cbsa:42660" : null,
      region: state ? `US-${state}` : "US",
    }),
    ca: () => ({ metro: null, region: "CA" }),
    label: (k: string) => k,
  },
};

const lcaRow: Record<string, string> = {
  CASE_STATUS: "Certified", DECISION_DATE: "2026-03-15", VISA_CLASS: "H-1B", JOB_TITLE: "Software Engineer",
  SOC_CODE: "15-1252", TOTAL_WORKER_POSITIONS: "1", NEW_EMPLOYMENT: "1", CONTINUED_EMPLOYMENT: "0",
  CHANGE_PREVIOUS_EMPLOYMENT: "0", NEW_CONCURRENT_EMPLOYMENT: "0", CHANGE_EMPLOYER: "0", AMENDED_PETITION: "0",
  EMPLOYER_NAME: "Acme Software Inc", TRADE_NAME_DBA: "", EMPLOYER_STATE: "WA", EMPLOYER_FEIN: "98-7654321",
  WORKSITE_COUNTY: "KING", WORKSITE_STATE: "WA", WORKSITE_POSTAL_CODE: "98101", WAGE_RATE_OF_PAY_FROM: "150000",
  WAGE_UNIT_OF_PAY: "Year", PW_WAGE_LEVEL: "II",
};
const permRow: Record<string, string> = {
  CASE_STATUS: "Certified", DECISION_DATE: "2025-11-20", EMP_BUSINESS_NAME: "Acme Software Inc",
  EMP_TRADE_NAME: "", EMP_FEIN: "987654321", EMP_STATE: "WA", JOB_TITLE: "Software Engineer",
  PWD_SOC_CODE: "15-1252", JOB_OPP_WAGE_FROM: "70", JOB_OPP_WAGE_PER: "Hour", PRIMARY_WORKSITE_COUNTY: "KING",
  PRIMARY_WORKSITE_STATE: "WA", PRIMARY_WORKSITE_POSTAL_CODE: "98101",
};

describe("mapLcaRow", () => {
  it("maps counts, pay, fiscal date, status and FEIN", () => {
    const f = mapLcaRow({ ...lcaRow, TOTAL_WORKER_POSITIONS: "3", NEW_EMPLOYMENT: "2", CHANGE_EMPLOYER: "1",
      CONTINUED_EMPLOYMENT: "0", WAGE_RATE_OF_PAY_FROM: "60", WAGE_UNIT_OF_PAY: "Hour", DECISION_DATE: "2026-03-15",
      EMPLOYER_FEIN: "12-3456789" }, ctx)!;
    expect(f).toMatchObject({ program: "lca", year: 2026, month: 6, status: "certified", annualPay: 124800,
      employer: { fein: "123456789", name: "Acme Software Inc", tradeName: null, state: "WA" },
      lca: { workers: 3, newHires: 2, changeEmployer: 1, continuing: 0, level: "II", visaClass: "H-1B" } });
  });

  it("sums the new-hire and continuing columns and treats blanks as 0", () => {
    const f = mapLcaRow({ ...lcaRow, TOTAL_WORKER_POSITIONS: "", NEW_EMPLOYMENT: "1", NEW_CONCURRENT_EMPLOYMENT: "2",
      CONTINUED_EMPLOYMENT: "3", CHANGE_PREVIOUS_EMPLOYMENT: "", AMENDED_PETITION: "4", CHANGE_EMPLOYER: "" }, ctx)!;
    expect(f.lca).toMatchObject({ workers: 1, newHires: 3, changeEmployer: 0, continuing: 7 });
  });

  it("nulls a blank or malformed FEIN", () => {
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_FEIN: "" }, ctx)!.employer.fein).toBeNull();
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_FEIN: "12-345" }, ctx)!.employer.fein).toBeNull();
  });

  it("maps statuses, including spaced Certified - Withdrawn, and drops unknown ones", () => {
    expect(mapLcaRow({ ...lcaRow, CASE_STATUS: "Withdrawn" }, ctx)!.status).toBe("withdrawn");
    expect(mapLcaRow({ ...lcaRow, CASE_STATUS: "Certified - Withdrawn" }, ctx)!.status).toBe("certified");
    expect(mapLcaRow({ ...lcaRow, CASE_STATUS: "Denied" }, ctx)!.status).toBe("denied");
    expect(mapLcaRow({ ...lcaRow, CASE_STATUS: "Pending" }, ctx)).toBeNull();
  });

  it("drops a missing or malformed decision date", () => {
    expect(mapLcaRow({ ...lcaRow, DECISION_DATE: "" }, ctx)).toBeNull();
    expect(mapLcaRow({ ...lcaRow, DECISION_DATE: "03/15/2026" }, ctx)).toBeNull();
    expect(mapLcaRow({ ...lcaRow, DECISION_DATE: "2026-13-40" }, ctx)).toBeNull();
  });

  it("keeps H-1B, H-1B1 and E-3 visa classes and drops others", () => {
    for (const v of ["H-1B", "H-1B1 Chile", "H-1B1 Singapore", "E-3 Australian", " e-3 australian "]) {
      expect(mapLcaRow({ ...lcaRow, VISA_CLASS: v }, ctx), v).not.toBeNull();
    }
    expect(mapLcaRow({ ...lcaRow, VISA_CLASS: "H-2B" }, ctx)).toBeNull();
    expect(mapLcaRow({ ...lcaRow, VISA_CLASS: "" }, ctx)).toBeNull();
  });

  it("drops a blank employer name", () => {
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "   " }, ctx)).toBeNull();
  });

  it("drops a strong person-named employer unless it has a profile", () => {
    const row = { ...lcaRow, EMPLOYER_NAME: "JANE DOE MD PC" };
    expect(mapLcaRow(row, ctx)).toBeNull();
    expect(mapLcaRow(row, { ...ctx, profiled: (e) => e.name === "JANE DOE MD PC" })).not.toBeNull();
    expect(mapLcaRow(row, { ...ctx, profiled: () => false })).toBeNull();
  });

  it("keeps a weak person-like employer and flags it personLike", () => {
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "General Motors" }, ctx)!.employer.personLike).toBe(true);
    expect(mapPermRow({ ...permRow, EMP_BUSINESS_NAME: "John A. Smith" }, ctx)!.employer.personLike).toBe(true);
    expect("personLike" in mapLcaRow(lcaRow, ctx)!.employer).toBe(false);
  });

  it("places by ZIP first, padding a numeric ZIP that lost its leading zero", () => {
    expect(mapLcaRow({ ...lcaRow, WORKSITE_POSTAL_CODE: "2139" }, ctx)!.place.metro).toBe("cbsa:metro-boston");
    expect(mapLcaRow({ ...lcaRow, WORKSITE_POSTAL_CODE: "02139-4307" }, ctx)!.place.metro).toBe("cbsa:metro-boston");
    expect(mapLcaRow({ ...lcaRow, WORKSITE_POSTAL_CODE: "bad" }, ctx)!.place.metro).toBe("cbsa:42660");
  });

  it("uses the worksite state for the region and the employer state for the employer", () => {
    const f = mapLcaRow({ ...lcaRow, WORKSITE_STATE: "TX", WORKSITE_COUNTY: "", EMPLOYER_STATE: "" }, ctx)!;
    expect(f.place.region).toBe("US-TX");
    expect(f.employer.state).toBeNull();
  });

  it("gives null pay for an implausible or unknown-unit wage", () => {
    expect(mapLcaRow({ ...lcaRow, WAGE_UNIT_OF_PAY: "Decade" }, ctx)!.annualPay).toBeNull();
    expect(mapLcaRow({ ...lcaRow, WAGE_RATE_OF_PAY_FROM: "" }, ctx)!.annualPay).toBeNull();
  });
});

describe("filed-name cleaning (R34 emails, R35 FEIN-shaped numbers)", () => {
  it("blanks a trade name holding an email", () => {
    expect(mapLcaRow({ ...lcaRow, TRADE_NAME_DBA: "hr@acme.example" }, ctx)!.employer.tradeName).toBeNull();
    expect(mapPermRow({ ...permRow, EMP_TRADE_NAME: "Acme (hr@acme.example)" }, ctx)!.employer.tradeName).toBeNull();
  });

  it("skips a row whose employer name holds an email, with its own reason", () => {
    expect(lcaOutcome({ ...lcaRow, EMPLOYER_NAME: "ACME INC hr@acme.example" }, ctx)).toEqual({ skip: "invalid", reason: "email in name" });
    expect(permOutcome({ ...permRow, EMP_BUSINESS_NAME: "hr@acme.example" }, ctx)).toEqual({ skip: "invalid", reason: "email in name" });
  });

  it("removes FEIN-shaped numbers from the employer name and trims what is left, keeping the FEIN field", () => {
    const f = mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "ACME INC 12-3456789" }, ctx)!;
    expect(f.employer.name).toBe("ACME INC");
    expect(f.employer.fein).toBe("987654321");
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "ACME INC - 12-3456789" }, ctx)!.employer.name).toBe("ACME INC");
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "123456789 ACME INC" }, ctx)!.employer.name).toBe("ACME INC");
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "ACME (12-3456789) INC" }, ctx)!.employer.name).toBe("ACME INC");
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "ACME_123456789" }, ctx)!.employer.name).toBe("ACME");
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "ACME INC 123456789." }, ctx)!.employer.name).toBe("ACME INC");
    expect(mapPermRow({ ...permRow, EMP_BUSINESS_NAME: "Acme Software Inc, 987654321" }, ctx)!.employer.name).toBe("Acme Software Inc");
  });

  it("keeps a Canadian numbered-company name whole (R37)", () => {
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "123456789 Canada Inc." }, ctx)!.employer.name).toBe("123456789 Canada Inc.");
    expect(mapLcaRow({ ...lcaRow, TRADE_NAME_DBA: "101234567 Saskatchewan Ltd." }, ctx)!.employer.tradeName).toBe(
      "101234567 Saskatchewan Ltd.",
    );
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "ACME INC 12-3456789" }, ctx)!.employer.name).toBe("ACME INC");
  });

  it("leaves names without a FEIN-shaped number alone, digits included", () => {
    for (const name of ["3M COMPANY", "ACME 12345678 LLC", "ACME 1234567890 LLC", "ACME INC.", "7-ELEVEN, INC."]) {
      expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: name }, ctx)!.employer.name, name).toBe(name);
    }
  });

  it("blanks a trade name that was only a FEIN-shaped number", () => {
    expect(mapLcaRow({ ...lcaRow, TRADE_NAME_DBA: "123456789" }, ctx)!.employer.tradeName).toBeNull();
    expect(mapPermRow({ ...permRow, EMP_TRADE_NAME: "98-7654321" }, ctx)!.employer.tradeName).toBeNull();
    expect(mapLcaRow({ ...lcaRow, TRADE_NAME_DBA: "ACME DBA 123456789" }, ctx)!.employer.tradeName).toBe("ACME DBA");
  });

  it("skips a row whose employer name was only a number", () => {
    expect(lcaOutcome({ ...lcaRow, EMPLOYER_NAME: "12-3456789" }, ctx)).toEqual({ skip: "invalid", reason: "name was only a number" });
    expect(permOutcome({ ...permRow, EMP_BUSINESS_NAME: " 123456789 " }, ctx)).toEqual({ skip: "invalid", reason: "name was only a number" });
  });

  it("cleans the name before the person-name check and before matching", () => {
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "John Smith 123456789" }, ctx)!.employer.personLike).toBe(true);
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "JANE DOE MD PC 12-3456789" }, ctx)).toBeNull();
    const seen: string[] = [];
    const profiled = (e: UsFiling["employer"]) => (seen.push(e.name), e.name === "LEE DDS PC");
    expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "LEE DDS PC 12-3456789" }, { ...ctx, profiled })).not.toBeNull();
    expect(seen).toEqual(["LEE DDS PC"]);
  });
});

describe("mapPermRow", () => {
  it("maps a PERM row without an lca block", () => {
    const f = mapPermRow(permRow, ctx)!;
    expect(f).toMatchObject({ program: "perm", status: "certified", year: 2026, month: 2, annualPay: 145600,
      employer: { fein: "987654321" }, place: { metro: "cbsa:42660", region: "US-WA" } });
    expect(f.lca).toBeUndefined();
  });

  it("drops unknown statuses, bad dates and person-named employers", () => {
    expect(mapPermRow({ ...permRow, CASE_STATUS: "Unknown" }, ctx)).toBeNull();
    expect(mapPermRow({ ...permRow, DECISION_DATE: "" }, ctx)).toBeNull();
    expect(mapPermRow({ ...permRow, EMP_BUSINESS_NAME: "John Smith DDS" }, ctx)).toBeNull();
  });
});

async function xlsx(name: string, header: string[], rows: string[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  const file = path.join(dir, name);
  await wb.xlsx.writeFile(file);
  // Repack with workbook.xml, styles and shared strings ahead of the sheets, as tests/pipeline/rows.test.ts does.
  const src = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(src.files).filter((n) => !src.files[n].dir);
  names.sort((a, b) => Number(a.startsWith("xl/worksheets/")) - Number(b.startsWith("xl/worksheets/")));
  const out = new JSZip();
  for (const n of names) out.file(n, await src.files[n].async("nodebuffer"));
  writeFileSync(file, await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return file;
}

async function collect(it: AsyncIterable<UsFiling>) {
  const out: UsFiling[] = [];
  for await (const r of it) out.push(r);
  return out;
}

const row = (header: string[], values: Record<string, string>) => header.map((h) => values[h] ?? "");

describe("loadUs", () => {
  it("counts read, kept and skipped rows while streaming an LCA file", async () => {
    const header = EXPECTED_COLUMNS.lca;
    const file = await xlsx("lca-stats.xlsx", header, [
      row(header, lcaRow),
      row(header, { ...lcaRow, EMPLOYER_NAME: "JANE DOE MD PC" }),
      row(header, { ...lcaRow, CASE_STATUS: "Pending" }),
      row(header, { ...lcaRow, VISA_CLASS: "H-2B" }),
      row(header, { ...lcaRow, EMPLOYER_NAME: " ", WORKSITE_POSTAL_CODE: "2139" }),
      row(header, { ...lcaRow, CASE_STATUS: "Certified - Withdrawn" }),
    ]);
    const { rows, stats } = loadUs("lca", file, ctx);
    const filings = await collect(rows);
    expect(filings).toHaveLength(2);
    expect(stats).toEqual({
      read: 6, kept: 2, skippedPerson: 1, skippedInvalid: 3, invalid: { status: 1, visa: 1, employer: 1 }, tradeNamesBlanked: 0,
    });
  });

  it("counts skips by reason and trade names blanked", async () => {
    const header = EXPECTED_COLUMNS.lca;
    const file = await xlsx("lca-names.xlsx", header, [
      row(header, { ...lcaRow, TRADE_NAME_DBA: "hr@acme.example" }),
      row(header, { ...lcaRow, TRADE_NAME_DBA: "12-3456789" }),
      row(header, { ...lcaRow, EMPLOYER_NAME: "info@acme.example" }),
      row(header, { ...lcaRow, EMPLOYER_NAME: "123456789" }),
      row(header, { ...lcaRow, EMPLOYER_NAME: "ACME INC 123456789" }),
    ]);
    const { rows, stats } = loadUs("lca", file, ctx);
    const filings = await collect(rows);
    expect(filings.map((f) => [f.employer.name, f.employer.tradeName])).toEqual([
      ["Acme Software Inc", null], ["Acme Software Inc", null], ["ACME INC", null],
    ]);
    expect(stats).toEqual({
      read: 5, kept: 3, skippedPerson: 0, skippedInvalid: 2,
      invalid: { "email in name": 1, "name was only a number": 1 }, tradeNamesBlanked: 2,
    });
  });

  it("loads a PERM file", async () => {
    const header = EXPECTED_COLUMNS.perm;
    const file = await xlsx("perm.xlsx", header, [row(header, permRow)]);
    const { rows, stats } = loadUs("perm", file, ctx);
    expect(await collect(rows)).toHaveLength(1);
    expect(stats.kept).toBe(1);
  });

  it("never carries personal columns or postal codes from the file into a filing", async () => {
    const lcaHeader = [...EXPECTED_COLUMNS.lca, "EMPLOYER_POC_EMAIL", "PREPARER_EMAIL", "AGENT_ATTORNEY_EMAIL", "EMPLOYER_ADDRESS1"];
    const lcaFile = await xlsx("lca-privacy.xlsx", lcaHeader, [row(lcaHeader, { ...lcaRow, EMPLOYER_POC_EMAIL: "poc@example.com",
      PREPARER_EMAIL: "prep@example.com", AGENT_ATTORNEY_EMAIL: "atty@example.com", EMPLOYER_ADDRESS1: "1 Example Way" })]);
    const permHeader = [...EXPECTED_COLUMNS.perm, "DECL_PREP_EMAIL", "EMP_POC_EMAIL"];
    const permFile = await xlsx("perm-privacy.xlsx", permHeader, [row(permHeader, { ...permRow,
      DECL_PREP_EMAIL: "decl@example.com", EMP_POC_EMAIL: "poc@example.com" })]);
    const lca = await collect(loadUs("lca", lcaFile, ctx).rows);
    const perm = await collect(loadUs("perm", permFile, ctx).rows);
    expect(lca).toHaveLength(1);
    expect(perm).toHaveLength(1);
    const json = JSON.stringify([lca, perm]);
    expect(json).not.toContain("example.com");
    expect(json).not.toContain("Example Way");
    expect(json).not.toContain("98101");
  });
});
