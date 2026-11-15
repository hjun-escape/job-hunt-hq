// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { loadCa, lmiaPeriodFromName, mapLmiaRow } from "../../pipeline/load/ca";
import type { LoadContext } from "../../pipeline/load/us";
import { EXPECTED_COLUMNS } from "../../pipeline/sources";
import type { CaApproval } from "../../pipeline/types";

const dir = mkdtempSync(path.join(tmpdir(), "ca-load-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const nocSeen: string[] = [];
const ctx: LoadContext = {
  roles: {
    us: () => "swe",
    ca: (noc: string) => (nocSeen.push(noc), /^\s*(?:NOC\s*)?21231/.test(noc) ? "software-engineer" : "noc-unknown"),
    label: (id: string) => id,
    ids: ["software-engineer"],
    defs: [],
  },
  places: {
    us: () => ({ metro: null, region: "US" }),
    ca: (city, province) => ({
      metro: city === "Toronto" && province === "ON" ? "cma:505" : null,
      region: province ? `CA-${province}` : "CA",
    }),
    label: (k: string) => k,
  },
};

const p = { year: 2026, quarter: 2 } as const;
const lmiaRow: Record<string, string> = {
  "Province/Territory": "Ontario",
  "Program Stream": "Global Talent",
  Employer: "Shopify Inc.",
  Address: "123 King St W, Toronto, ON M5V 1J2",
  Occupation: "21231 - Software engineers and designers",
  "Approved LMIAs": "2",
  "Approved Positions": "3",
};

describe("mapLmiaRow", () => {
  it("maps a row, keeping the stream as given", () => {
    expect(mapLmiaRow(lmiaRow, ctx, p)).toEqual({
      year: 2026, quarter: 2, employer: { name: "Shopify Inc.", province: "ON" }, stream: "Global Talent",
      role: "software-engineer", place: { metro: "cma:505", region: "CA-ON" }, lmias: 2, positions: 3,
    });
  });

  it("accepts NOC cell variants", () => {
    for (const o of ["NOC 21231", "21231", "21231 - Software engineers and designers"]) {
      expect(mapLmiaRow({ ...lmiaRow, Occupation: o }, ctx, p)!.role).toBe("software-engineer");
    }
  });

  it("returns null for footnote rows and zero counts", () => {
    const note = { "Province/Territory": "Note: positions include cancelled", Employer: "", Address: "", Occupation: "",
      "Program Stream": "", "Approved LMIAs": "", "Approved Positions": "" };
    expect(mapLmiaRow(note, ctx, p)).toBeNull();
    expect(mapLmiaRow({ ...lmiaRow, "Approved LMIAs": "0", "Approved Positions": "0" }, ctx, p)).toBeNull();
  });

  it("falls back to the province column, English or French", () => {
    expect(mapLmiaRow({ ...lmiaRow, Address: "", "Province/Territory": "Québec" }, ctx, p)!.employer.province).toBe("QC");
    expect(mapLmiaRow({ ...lmiaRow, Address: "", "Province/Territory": "Colombie-Britannique" }, ctx, p)!.employer.province).toBe("BC");
    expect(mapLmiaRow({ ...lmiaRow, Address: "", "Province/Territory": "Newfoundland and Labrador" }, ctx, p)!.employer.province).toBe("NL");
  });

  it("prefers the address province over the column", () => {
    expect(mapLmiaRow({ ...lmiaRow, "Province/Territory": "Alberta" }, ctx, p)!.employer.province).toBe("ON");
  });

  it("keeps a row with no province, using region CA and an empty province", () => {
    const r = mapLmiaRow({ ...lmiaRow, Address: "10 Main St, Paris, France", "Province/Territory": "" }, ctx, p)!;
    expect(r.employer.province).toBe("");
    expect(r.place).toEqual({ metro: null, region: "CA" });
  });

  it("never outputs the street or postal code", () => {
    const out = JSON.stringify(mapLmiaRow(lmiaRow, ctx, p));
    expect(out).not.toContain("King St");
    expect(out).not.toContain("M5V");
    expect(out).not.toContain("123");
  });

  it("parses counts with commas and rejects bad counts", () => {
    const r = mapLmiaRow({ ...lmiaRow, "Approved LMIAs": "1,200", "Approved Positions": "2,500" }, ctx, p)!;
    expect([r.lmias, r.positions]).toEqual([1200, 2500]);
    expect(() => mapLmiaRow({ ...lmiaRow, "Approved LMIAs": "abc" }, ctx, p)).not.toThrow();
  });

  it("trims the stream and employer", () => {
    const r = mapLmiaRow({ ...lmiaRow, "Program Stream": " Low-wage ", Employer: "  Acme Ltd " }, ctx, p)!;
    expect(r.stream).toBe("Low-wage");
    expect(r.employer.name).toBe("Acme Ltd");
  });
});

describe("filed-name cleaning (R34 emails, R35 FEIN-shaped numbers)", () => {
  it("skips an employer name holding an email", () => {
    expect(mapLmiaRow({ ...lmiaRow, Employer: "Acme Ltd hr@acme.example" }, ctx, p)).toBeNull();
  });

  it("removes FEIN-shaped numbers, Canadian 9-digit business numbers included, and trims what is left", () => {
    expect(mapLmiaRow({ ...lmiaRow, Employer: "ACME INC 12-3456789" }, ctx, p)!.employer.name).toBe("ACME INC");
    expect(mapLmiaRow({ ...lmiaRow, Employer: "Acme Ltd - 123456789" }, ctx, p)!.employer.name).toBe("Acme Ltd");
    expect(mapLmiaRow({ ...lmiaRow, Employer: "101234567 Saskatchewan Ltd." }, ctx, p)!.employer.name).toBe("Saskatchewan Ltd.");
  });

  it("leaves other numbered names alone", () => {
    for (const name of ["1234567 Ontario Inc.", "9123-4567 Québec inc.", "12345678 Canada Inc."]) {
      expect(mapLmiaRow({ ...lmiaRow, Employer: name }, ctx, p)!.employer.name, name).toBe(name);
    }
  });

  it("skips an employer name that was only a number", () => {
    expect(mapLmiaRow({ ...lmiaRow, Employer: "123456789" }, ctx, p)).toBeNull();
    expect(mapLmiaRow({ ...lmiaRow, Employer: "12-3456789" }, ctx, p)).toBeNull();
  });
});

describe("lmiaPeriodFromName", () => {
  it("parses year-then-quarter and quarter-then-year forms", () => {
    const q2 = { year: 2026, quarter: 2 };
    for (const n of ["tfwp_2026q2_pos_en.xlsx", "TFWP_2026_Q2_x.xlsx", "Q2-2026.xlsx", "2026 Q2", "q2_2026", "2026Q2", "lmia_2026q2.xlsx"]) {
      expect(lmiaPeriodFromName(n), n).toEqual(q2);
    }
  });

  it("returns null without a period and ignores directory names", () => {
    expect(lmiaPeriodFromName("positive.xlsx")).toBeNull();
    expect(lmiaPeriodFromName("tfwp_2026q5.xlsx")).toBeNull();
    expect(lmiaPeriodFromName("/data/2025q1/positive.xlsx")).toBeNull();
    expect(lmiaPeriodFromName("/data/2025q1/tfwp_2024q3.xlsx")).toEqual({ year: 2024, quarter: 3 });
  });
});

async function xlsx(name: string, rows: unknown[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S");
  for (const r of rows) ws.addRow(r);
  const file = path.join(dir, name);
  await wb.xlsx.writeFile(file);
  // Repack with workbook.xml, styles and shared strings ahead of the sheets (the order the streaming reader expects).
  const src = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(src.files).filter((n) => !src.files[n].dir);
  const rank = (n: string) => (n.startsWith("xl/worksheets/") ? 2 : n === "xl/styles.xml" || n === "xl/sharedStrings.xml" ? 1 : 0);
  names.sort((a, b) => rank(a) - rank(b));
  const out = new JSZip();
  for (const n of names) out.file(n, await src.files[n].async("nodebuffer"));
  writeFileSync(file, await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return file;
}

describe("loadCa", () => {
  it("reads a file with a title row and a footnote row, counting stats", async () => {
    const h = EXPECTED_COLUMNS.lmia;
    const cells = (r: Record<string, string>) => h.map((c) => r[c] ?? "");
    const file = await xlsx("tfwp_2026q2_pos_en.xlsx", [
      ["Positive LMIA employers, 2026 Q2"],
      h,
      cells(lmiaRow),
      cells({ ...lmiaRow, Employer: "Bad Counts Ltd", "Approved LMIAs": "n/a" }),
      cells({ ...lmiaRow, Employer: "Acme Ltd", Address: "", "Province/Territory": "Alberta", "Program Stream": "High-wage" }),
      cells({ "Province/Territory": "Note: positions include cancelled" }),
      cells({ ...lmiaRow, Employer: "jobs@acme.example" }),
      cells({ ...lmiaRow, Employer: "123456789" }),
      cells({ Employer: "Questions: lmia@example.gc.ca" }),
    ]);
    const { rows, stats } = loadCa(file, p, ctx);
    const got: CaApproval[] = [];
    for await (const r of rows) got.push(r);
    expect(got.map((r) => r.employer.name)).toEqual(["Shopify Inc.", "Acme Ltd"]);
    expect(got[1].employer.province).toBe("AB");
    expect(stats).toEqual({
      read: 7, kept: 2, skippedPerson: 0, skippedInvalid: 3,
      invalid: { counts: 1, "email in name": 1, "name was only a number": 1 }, tradeNamesBlanked: 0,
    });
  });
});
