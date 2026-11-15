// @vitest-environment node
import { describe, expect, it } from "vitest";
import { annualize, fiscalYearMonth, lcaStatus, parseAmount, permStatus, wageLevel } from "../../pipeline/normalize/us";

describe("parseAmount", () => {
  it("handles currency symbols, commas, spaces and plain digits", () => {
    expect(parseAmount("$120,000.00")).toBe(120000);
    expect(parseAmount(" 95000 ")).toBe(95000);
    expect(parseAmount("62.5")).toBe(62.5);
  });
  it("returns null for empty, non-numeric or negative input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
    expect(parseAmount("12abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});

describe("annualize", () => {
  it("converts each unit to a yearly figure", () => {
    expect(annualize(60, "Hour")).toBe(124800);
    expect(annualize(2000, "Week")).toBe(104000);
    expect(annualize(2000, "Bi-Weekly")).toBe(52000);
    expect(annualize(10000, "Month")).toBe(120000);
    expect(annualize(150000, "Year")).toBe(150000);
  });
  it("matches units case-insensitively and tolerates spelling variants", () => {
    expect(annualize(60, " hour ")).toBe(124800);
    expect(annualize(2000, "bi-weekly")).toBe(52000);
    expect(annualize(2000, "Biweekly")).toBe(52000);
    expect(annualize(2000, "Bi Weekly")).toBe(52000);
  });
  it("excludes out-of-bounds pay and unknown units", () => {
    expect(annualize(1500, "Hour")).toBeNull();
    expect(annualize(45, "Year")).toBeNull();
    expect(annualize(2000000, "Year")).toBeNull();
    expect(annualize(100, "Fortnight")).toBeNull();
    expect(annualize(null, "Year")).toBeNull();
    expect(annualize(0, "Year")).toBeNull();
  });
  it("applies the bounds inclusively", () => {
    expect(annualize(15000, "Year")).toBe(15000);
    expect(annualize(1500000, "Year")).toBe(1500000);
    expect(annualize(1000, "Hour")).toBeNull(); // 2,080,000 a year
    expect(annualize(15, "Hour")).toBe(31200);
  });
});

describe("fiscalYearMonth", () => {
  it("starts the fiscal year in October", () => {
    expect(fiscalYearMonth("2025-10-01")).toEqual({ year: 2026, month: 1 });
    expect(fiscalYearMonth("2026-03-15")).toEqual({ year: 2026, month: 6 });
    expect(fiscalYearMonth("2026-09-30")).toEqual({ year: 2026, month: 12 });
    expect(fiscalYearMonth("2025-12-31")).toEqual({ year: 2026, month: 3 });
    expect(fiscalYearMonth("2026-01-01")).toEqual({ year: 2026, month: 4 });
  });
  it("throws on malformed input", () => {
    expect(() => fiscalYearMonth("")).toThrow();
    expect(() => fiscalYearMonth("03/15/2026")).toThrow();
    expect(() => fiscalYearMonth("2026-13-01")).toThrow();
    expect(() => fiscalYearMonth("2026-3-5")).toThrow();
  });
});

describe("statuses", () => {
  it("maps LCA statuses, with or without spaces around the hyphen", () => {
    expect(lcaStatus("Certified")).toBe("certified");
    expect(lcaStatus("Certified-Withdrawn")).toBe("certified");
    expect(lcaStatus("Certified - Withdrawn")).toBe("certified");
    expect(lcaStatus("  certified  -  withdrawn ")).toBe("certified");
    expect(lcaStatus("Denied")).toBe("denied");
    expect(lcaStatus("Withdrawn")).toBe("withdrawn");
    expect(lcaStatus("odd")).toBeNull();
    expect(lcaStatus("")).toBeNull();
  });
  it("maps PERM statuses", () => {
    expect(permStatus("Certified-Expired")).toBe("certified");
    expect(permStatus("Certified - Expired")).toBe("certified");
    expect(permStatus("Certified")).toBe("certified");
    expect(permStatus("Denied")).toBe("denied");
    expect(permStatus("Withdrawn")).toBe("withdrawn");
    expect(permStatus("odd")).toBeNull();
  });
});

describe("wageLevel", () => {
  it("accepts roman levels and falls back to N/A", () => {
    expect(wageLevel("II")).toBe("II");
    expect(wageLevel(" iv ")).toBe("IV");
    expect(wageLevel("")).toBe("N/A");
    expect(wageLevel("N/A")).toBe("N/A");
    expect(wageLevel("garbage")).toBe("N/A");
  });
});
