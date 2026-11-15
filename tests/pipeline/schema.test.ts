// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ProfileSchema, profileJsonSchema } from "../../pipeline/schema/profile";
import {
  CaCell,
  CompanyFile,
  IndexEntry,
  Meta,
  PayStats,
  TrendPair,
  UsCell,
  YearBlockCa,
  YearBlockUs,
} from "../../pipeline/schema/published";

const minimal = { id: "example.com", name: "Example", countries: ["US"], entities: {} };
const fact = (en: string) => ({
  value: { en },
  kind: "official",
  sources: [{ url: "https://example.com/about", seen: "2026-11-14" }],
  checked: "2026-11-14",
});

describe("ProfileSchema", () => {
  it("accepts a minimal profile and rejects unknown fields", () => {
    expect(ProfileSchema.safeParse(minimal).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, extra: 1 }).success).toBe(false);
  });

  it("rejects unknown fields in nested objects", () => {
    expect(ProfileSchema.safeParse({ ...minimal, entities: { other: 1 } }).success).toBe(false);
    const f = fact("ok");
    expect(ProfileSchema.safeParse({ ...minimal, mission: { ...f, extra: 1 } }).success).toBe(false);
  });

  it("limits summaries to 280 characters, English and Korean separately", () => {
    expect(ProfileSchema.safeParse({ ...minimal, mission: fact("x".repeat(280)) }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, mission: fact("x".repeat(281)) }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, mission: fact("") }).success).toBe(false);
    const ko = (n: number) => ({ ...fact("ok"), value: { en: "x".repeat(280), ko: "가".repeat(n) } });
    expect(ProfileSchema.safeParse({ ...minimal, mission: ko(280) }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, mission: ko(281) }).success).toBe(false);
  });

  it("requires at least one https source and a real ISO date", () => {
    expect(ProfileSchema.safeParse({ ...minimal, mission: { ...fact("ok"), sources: [] } }).success).toBe(false);
    expect(
      ProfileSchema.safeParse({
        ...minimal,
        mission: { ...fact("ok"), sources: [{ url: "http://example.com", seen: "2026-11-14" }] },
      }).success,
    ).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, mission: { ...fact("ok"), checked: "2026-13-01" } }).success).toBe(false);
  });

  it("validates FEINs, wikidata, DART code, countries and links", () => {
    expect(ProfileSchema.safeParse({ ...minimal, entities: { usFeins: ["12-3456789"] } }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, entities: { usFeins: ["123456789"] } }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, wikidata: "Q95" }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, wikidata: "95" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, dartCorpCode: "00126380" }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, dartCorpCode: "126380" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, countries: [] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, countries: ["JP"] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...minimal, links: [{ label: "Jobs", url: "http://x.com" }] }).success).toBe(false);
    expect(
      ProfileSchema.safeParse({ ...minimal, entities: { caNames: [{ name: "Ex", province: "ON" }] } }).success,
    ).toBe(true);
    expect(
      ProfileSchema.safeParse({ ...minimal, entities: { caNames: [{ name: "Ex", province: "Ontario" }] } }).success,
    ).toBe(false);
  });

  it("accepts reapplyWait facts and rejects an unknown stage", () => {
    const wait = (after: string) => ({ ...fact("ok"), value: { after, wait: { en: "6 months" } } });
    expect(ProfileSchema.safeParse({ ...minimal, reapplyWait: [wait("onsite")] }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...minimal, reapplyWait: [wait("offer")] }).success).toBe(false);
  });

  it("produces a JSON schema", () => {
    const js = profileJsonSchema() as { type?: string; properties?: Record<string, unknown> };
    expect(js.type).toBe("object");
    expect(js.properties).toHaveProperty("entities");
  });
});

describe("profile id", () => {
  it("must be a lower-case hostname", () => {
    for (const id of ["stripe.com", "toss.im", "samsung.co.kr", "a-b.example.com"]) {
      expect(ProfileSchema.safeParse({ ...minimal, id }).success, id).toBe(true);
    }
    for (const id of ["Stripe.com", "stripe", "-a.com", "a-.com", "a..com", "a.com.", "a b.com"]) {
      expect(ProfileSchema.safeParse({ ...minimal, id }).success, id).toBe(false);
    }
  });
});

describe("published schemas", () => {
  it("ignores unknown keys so additive v1 fields do not break older consumers", () => {
    const entry = IndexEntry.safeParse({ id: "a.com", name: "A", c: ["US"], h: 1, future: true });
    expect(entry.success).toBe(true);
    expect(entry.data).not.toHaveProperty("future");
  });

  it("pins month and through ranges per country", () => {
    const cell = { role: "all", place: "all", filings: 0, denied: 0, withdrawn: 0 };
    const us = { year: 2025, partial: true, through: 12, months: Array(12).fill(0), total: cell, cells: [] };
    expect(YearBlockUs.safeParse(us).success).toBe(true);
    expect(YearBlockUs.safeParse({ ...us, months: Array(11).fill(0) }).success).toBe(false);
    expect(YearBlockUs.safeParse({ ...us, through: 13 }).success).toBe(false);
    expect(YearBlockUs.safeParse({ ...us, through: 0 }).success).toBe(false);
    const ca = { year: 2025, partial: true, through: 4, months: [0, 0, 0, 0], total: { role: "all", place: "all", lmias: 0, positions: 0, streams: {} }, cells: [] };
    expect(YearBlockCa.safeParse(ca).success).toBe(true);
    expect(YearBlockCa.safeParse({ ...ca, through: 5 }).success).toBe(false);
    expect(YearBlockCa.safeParse({ ...ca, months: Array(12).fill(0) }).success).toBe(false);
    expect(YearBlockCa.safeParse({ year: 2025, partial: true, through: 5, tooFew: true }).success).toBe(false);
  });

  it("requires ISO datetimes and quarters 1-4 in meta", () => {
    const src = { source: "lca", year: 2025, quarter: 1, url: "https://e.com/a", sha256: "ab", bytes: 1, fetchedAt: "2026-11-14T00:00:00Z" };
    const meta = {
      schemaVersion: 1, builtAt: "2026-11-14T00:00:00.000Z",
      years: { lca: { complete: [] }, perm: { complete: [] }, lmia: { complete: [] } },
      sources: [src], totals: { lca: {}, perm: {}, lmia: {} }, warnings: [],
      caveats: { lca: "a", perm: "b", lmia: "c", general: "d" },
      licences: { code: "a", profiles: "b", us: "c", ca: "d" }, roles: {}, places: {},
    };
    expect(Meta.safeParse(meta).success).toBe(true);
    expect(Meta.safeParse({ ...meta, builtAt: "yesterday" }).success).toBe(false);
    expect(Meta.safeParse({ ...meta, sources: [{ ...src, fetchedAt: "2026-11-14" }] }).success).toBe(false);
    expect(Meta.safeParse({ ...meta, sources: [{ ...src, quarter: 5 }] }).success).toBe(false);
    expect(Meta.safeParse({ ...meta, extra: 1 }).success).toBe(true);
  });

  it("takes an optional Statistics Canada notice under meta licences (additive in v1)", () => {
    const meta = {
      schemaVersion: 1, builtAt: "2026-11-14T00:00:00.000Z",
      years: { lca: { complete: [] }, perm: { complete: [] }, lmia: { complete: [] } },
      sources: [], totals: { lca: {}, perm: {}, lmia: {} }, warnings: [],
      caveats: { lca: "a", perm: "b", lmia: "c", general: "d" },
      licences: { code: "a", profiles: "b", us: "c", ca: "d", statcan: "e" }, roles: {}, places: {},
    };
    expect(Meta.parse(meta).licences.statcan).toBe("e");
    const { statcan: _statcan, ...older } = meta.licences;
    expect(Meta.safeParse({ ...meta, licences: older }).success).toBe(true);
    expect(Meta.safeParse({ ...meta, licences: { ...older, statcan: 1 } }).success).toBe(false);
  });

  it("accepts a tooFew year block", () => {
    expect(YearBlockUs.safeParse({ year: 2025, partial: false, tooFew: true }).success).toBe(true);
    expect(YearBlockCa.safeParse({ year: 2025, partial: true, through: 2, tooFew: true }).success).toBe(true);
  });

  it("accepts a full US block and rejects a block with neither cells nor tooFew", () => {
    const cell = { role: "all", place: "all", filings: 3, denied: 0, withdrawn: 0, levels: { II: 3 } };
    const block = { year: 2025, partial: false, months: Array(12).fill(0), total: cell, cells: [cell] };
    expect(YearBlockUs.safeParse(block).success).toBe(true);
    expect(YearBlockUs.safeParse({ year: 2025, partial: false }).success).toBe(false);
  });

  it("treats UsCell.levels as partial but rejects unknown levels and bad counts", () => {
    const base = { role: "all", place: "all", filings: 1, denied: 0, withdrawn: 0 };
    expect(UsCell.safeParse({ ...base, levels: { IV: 1 } }).success).toBe(true);
    expect(UsCell.safeParse({ ...base, levels: { V: 1 } }).success).toBe(false);
    expect(UsCell.safeParse({ ...base, filings: 1.5 }).success).toBe(false);
    expect(UsCell.safeParse({ ...base, filings: -1 }).success).toBe(false);
  });

  it("accepts published cells that carry counts and pay only, with sub-counts and streams omitted", () => {
    expect(UsCell.safeParse({ role: "designer", place: "US-CA", filings: 3 }).success).toBe(true);
    expect(UsCell.safeParse({ role: "designer", place: "US-CA", filings: 3, workers: 4 }).success).toBe(true);
    expect(CaCell.safeParse({ role: "designer", place: "CA-ON", lmias: 3, positions: 5 }).success).toBe(true);
    expect(CaCell.safeParse({ role: "designer", place: "CA-ON", lmias: 3 }).success).toBe(false);
  });

  it("validates pay stats, Canadian cells and trends", () => {
    expect(PayStats.safeParse({ n: 5, p25: 1, median: 2.5, p75: 3 }).success).toBe(true);
    expect(PayStats.safeParse({ n: 5, p25: -1, median: 2, p75: 3 }).success).toBe(false);
    expect(CaCell.safeParse({ role: "all", place: "all", lmias: 1, positions: 2, streams: { "High-wage": 1 } }).success).toBe(true);
    const trend = { from: 2023, to: 2025, period: "full", change: 0.5 };
    expect(TrendPair.safeParse({ full: trend, ytd: null }).success).toBe(true);
    expect(TrendPair.safeParse({ full: { ...trend, period: "half" }, ytd: null }).success).toBe(false);
  });

  it("validates an index entry and a company file", () => {
    expect(IndexEntry.safeParse({ id: "a.com", name: "A", c: ["US", "CA"], h: 10 }).success).toBe(true);
    expect(IndexEntry.safeParse({ id: "a.com", name: "A", c: ["KR"], h: 10 }).success).toBe(false);
    expect(
      CompanyFile.safeParse({ profile: minimal, legalNames: ["Example Inc"], sponsorship: { trends: {} } }).success,
    ).toBe(true);
  });

  it("validates meta with schemaVersion 1 and source entries without a path", () => {
    const meta = {
      schemaVersion: 1,
      builtAt: "2026-11-14T00:00:00.000Z",
      years: { lca: { complete: [2025] }, perm: { complete: [2025], partial: { year: 2026, through: 2 } }, lmia: { complete: [] } },
      sources: [
        { source: "lca", year: 2025, quarter: 1, url: "https://example.com/a.xlsx", sha256: "ab", bytes: 10, fetchedAt: "2026-11-14T00:00:00Z" },
      ],
      totals: { lca: { "2025": 1 }, perm: {}, lmia: {} },
      warnings: [],
      caveats: { lca: "a", perm: "b", lmia: "c", general: "d" },
      licences: { code: "MIT", profiles: "CC-BY-4.0", us: "public domain", ca: "OGL-Canada" },
      roles: { swe: "Software engineer" },
      places: { "US-CA": "California" },
    };
    expect(Meta.safeParse(meta).success).toBe(true);
    expect(Meta.safeParse({ ...meta, schemaVersion: 2 }).success).toBe(false);
    expect(
      Meta.safeParse({ ...meta, years: { ...meta.years, lca: { complete: [2025], partial: { year: 2026, through: 4 } } } }).success,
    ).toBe(false);
  });
});
