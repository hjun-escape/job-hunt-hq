import { describe, it, expect } from "vitest";
import { normalizeAmount, formatMoney, formatCompRange } from "../../src/domain/money";

const settings = { displayCurrency: "CAD", fxRates: { USD: 1.36, KRW: 0.001 } };

describe("normalizeAmount", () => {
  it("returns the amount unchanged in the display currency", () => {
    expect(normalizeAmount(100000, "CAD", settings)).toBe(100000);
  });
  it("applies a known rate and rounds", () => {
    expect(normalizeAmount(100000, "USD", settings)).toBe(136000);
    expect(normalizeAmount(70_000_000, "KRW", settings)).toBe(70000);
  });
  it("returns null without a rate", () => {
    expect(normalizeAmount(100, "JPY", settings)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats with thousands separators and no decimals", () => {
    expect(formatMoney(1000000, "KRW")).toMatch(/1,000,000/);
    expect(formatMoney(95000, "CAD")).toMatch(/95,000/);
  });
});

describe("formatCompRange", () => {
  it("renders a dash without amounts", () => {
    expect(formatCompRange(undefined)).toBe("—");
    expect(formatCompRange({ currency: "CAD", period: "year" })).toBe("—");
  });
  it("renders min–max with currency and period", () => {
    expect(formatCompRange({ min: 90000, max: 110000, currency: "CAD", period: "year" })).toMatch(/90,000.*110,000.*\/ year/);
    expect(formatCompRange({ min: 50, currency: "USD", period: "hour" })).toMatch(/50.*\/ hour/);
  });
});
