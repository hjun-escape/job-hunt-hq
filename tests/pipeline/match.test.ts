// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OwnerResult } from "../../pipeline/aggregate/accumulate";
import { buildEntityMap, ownerForCa, ownerForUs } from "../../pipeline/match/entities";
import { buildReport } from "../../pipeline/match/report";
import { aggregateCa, aggregateUs, formatCaTable, formatUsTable } from "../../pipeline/cli/find";
import { caEmployerId, normalizeName, usEmployerId } from "../../pipeline/normalize/names";
import { ProfileSchema, type Profile } from "../../pipeline/schema/profile";
import type { Sponsorship } from "../../pipeline/schema/published";

const profile = (p: Partial<Profile> & { id: string; name: string }): Profile =>
  ProfileSchema.parse({ countries: ["US"], entities: {}, ...p });

const google = profile({
  id: "google.com",
  name: "Google",
  otherNames: ["Alphabet"],
  entities: { usFeins: ["123456789"], usNames: ["Google LLC"] },
});
const shopify = profile({
  id: "shopify.com",
  name: "Shopify",
  countries: ["CA"],
  entities: { caNames: [{ name: "Shopify Inc.", province: "ON" }], usNames: ["Shopify (USA) Inc."] },
});
const trade = profile({ id: "acme.com", name: "Acme", entities: { usNames: ["Acme Holdings"] } });
const map = buildEntityMap([google, shopify, trade]);

const us = (o: Partial<{ fein: string | null; name: string; tradeName: string | null; state: string | null }>) => ({
  fein: null,
  name: "X",
  tradeName: null,
  state: "CA",
  ...o,
});

describe("entity map", () => {
  it("FEIN beats name", () => {
    expect(map.us(us({ fein: "123456789", name: "Unrelated LLC" }))).toBe("google.com");
    expect(map.us(us({ fein: "123456789", name: "Shopify (USA) Inc." }))).toBe("google.com");
  });
  it("legal name without FEIN, normalised", () => {
    expect(map.us(us({ name: "Google LLC" }))).toBe("google.com");
    expect(map.us(us({ name: "GOOGLE, L.L.C." }))).toBe("google.com");
  });
  it("trade name hit after the legal name misses", () => {
    expect(map.us(us({ name: "Other Corp", tradeName: "Acme Holdings" }))).toBe("acme.com");
    expect(map.us(us({ name: "Google LLC", tradeName: "Acme Holdings" }))).toBe("google.com");
  });
  it("no fuzzy match", () => {
    expect(map.us(us({ name: "Google Cloud Services LLC" }))).toBeUndefined();
    expect(map.us(us({ fein: "999999999", name: "Nobody" }))).toBeUndefined();
  });
  it("Canadian hit requires the province", () => {
    expect(map.ca({ name: "Shopify Inc.", province: "ON" })).toBe("shopify.com");
    expect(map.ca({ name: "SHOPIFY INC", province: "ON" })).toBe("shopify.com");
    expect(map.ca({ name: "Shopify Inc.", province: "BC" })).toBeUndefined();
  });
  it("ownerFor falls back to generated ids", () => {
    const e = us({ name: "Acme LLC" });
    expect(ownerForUs(e, map)).toBe(usEmployerId(null, normalizeName("Acme LLC"), "CA"));
    expect(ownerForUs(e, map)).toMatch(/^us-/);
    const f = us({ fein: "555555555", name: "Acme LLC" });
    expect(ownerForUs(f, map)).toBe(usEmployerId("555555555", normalizeName("Acme LLC"), "CA"));
    const c = { name: "Shopify Inc.", province: "BC" };
    expect(ownerForCa(c, map)).toBe(caEmployerId(normalizeName(c.name), "BC"));
    expect(ownerForUs(us({ name: "Google LLC" }), map)).toBe("google.com");
    expect(ownerForCa({ name: "Shopify Inc.", province: "ON" }, map)).toBe("shopify.com");
  });
});

const lcaBlock = (year: number, partial: boolean, hires: number) => ({
  year,
  partial,
  months: Array(12).fill(0),
  total: { role: "all", place: "all", filings: hires, newHires: hires, changeEmployer: 0 },
  cells: [],
});
const owner = (name: string, hires: number, year = 2025, extra: Partial<Sponsorship> = {}): OwnerResult => ({
  name,
  also: [],
  countries: ["US"],
  region: null,
  sponsorship: { lca: [lcaBlock(year, false, hires)], trends: {}, ...extra } as Sponsorship,
});
const gid = (n: string) => usEmployerId(null, normalizeName(n), "CA");

describe("buildReport", () => {
  const owners = new Map<string, OwnerResult>([
    ["google.com", owner("Google LLC", 9000)],
    [gid("GOOGLE CLOUD SERVICES LLC"), owner("GOOGLE CLOUD SERVICES LLC", 40)],
    [gid("Google"), owner("Google", 5)],
    [gid("Googleplex Cafe"), owner("Googleplex Cafe", 99)],
    [gid("Alphabet Ventures"), owner("Alphabet Ventures", 12)],
    [gid("Zeta Corp"), owner("Zeta Corp", 500)],
    [gid("Old Co"), owner("Old Co", 700, 2024)],
    [gid("Partial Co"), { ...owner("Partial Co", 0), sponsorship: { lca: [lcaBlock(2026, true, 9999)], trends: {} } as Sponsorship }],
  ]);
  const report = buildReport(owners, [google, shopify]);

  it("unprofiledTop excludes profiled owners and ranks by latest complete year", () => {
    const ids = report.unprofiledTop.map((o) => o.id);
    expect(ids).not.toContain("google.com");
    expect(report.unprofiledTop[0]).toEqual({ id: gid("Zeta Corp"), name: "Zeta Corp", headline: 500 });
    // Old Co has 0 in 2025 and Partial Co's 2026 block is partial, so both rank last by id
    expect(report.unprofiledTop.find((o) => o.id === gid("Old Co"))?.headline).toBe(0);
    expect(report.unprofiledTop.find((o) => o.id === gid("Partial Co"))?.headline).toBe(0);
  });
  it("unprofiledTop is capped at 20, ties by id", () => {
    const many = new Map<string, OwnerResult>();
    for (let i = 0; i < 30; i++) many.set(gid(`Co ${i}`), owner(`Co ${i}`, 10));
    const r = buildReport(many, []);
    expect(r.unprofiledTop).toHaveLength(20);
    const ids = r.unprofiledTop.map((o) => o.id);
    expect(ids).toEqual([...ids].sort());
  });
  it("proposals: prefix plus space, or equality; sorted by headline", () => {
    const g = report.proposals.filter((p) => p.profile === "google.com");
    expect(g).toContainEqual(expect.objectContaining({ profile: "google.com", name: "GOOGLE CLOUD SERVICES LLC" }));
    expect(g.map((p) => p.name)).toEqual(["GOOGLE CLOUD SERVICES LLC", "Alphabet Ventures", "Google"]);
    expect(g.map((p) => p.name)).not.toContain("Googleplex Cafe");
    expect(g.map((p) => p.id)).not.toContain("google.com");
  });
  it("proposals are capped at 10 per profile", () => {
    const many = new Map<string, OwnerResult>();
    for (let i = 0; i < 15; i++) many.set(gid(`Google Unit ${i}`), owner(`Google Unit ${i}`, i));
    expect(buildReport(many, [google]).proposals).toHaveLength(10);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(buildReport(owners, [google, shopify]))).toBe(JSON.stringify(report));
  });
  it("a person-like name dropped by the gate is absent because it is not in the input", () => {
    const gated = new Map(owners);
    const json = JSON.stringify(buildReport(gated, [google, shopify]));
    expect(json).not.toContain("Jane Q Public");
  });
});

describe("find tables", () => {
  it("aggregates US rows by name, fein and state, certified only", () => {
    const rows = [
      { EMPLOYER_NAME: "Shopify (USA) Inc.", EMPLOYER_FEIN: "12-3456789", EMPLOYER_STATE: "NY", CASE_STATUS: "Certified" },
      { EMPLOYER_NAME: "Shopify (USA) Inc.", EMPLOYER_FEIN: "12-3456789", EMPLOYER_STATE: "NY", CASE_STATUS: "Certified - Withdrawn" },
      { EMPLOYER_NAME: "Shopify (USA) Inc.", EMPLOYER_FEIN: "12-3456789", EMPLOYER_STATE: "NY", CASE_STATUS: "Denied" },
      { EMPLOYER_NAME: "Shopify Holdings LLC", EMPLOYER_FEIN: "", EMPLOYER_STATE: "CA", CASE_STATUS: "Certified" },
      { EMPLOYER_NAME: "Other Inc", EMPLOYER_FEIN: "", EMPLOYER_STATE: "CA", CASE_STATUS: "Certified" },
    ];
    const t = aggregateUs(rows, "lca", normalizeName("shopify"));
    expect(t).toEqual([
      { name: "Shopify (USA) Inc.", fein: "123456789", state: "NY", certified: 2 },
      { name: "Shopify Holdings LLC", fein: "", state: "CA", certified: 1 },
    ]);
    expect(formatUsTable(t, 1)).not.toContain("Holdings");
  });
  it("aggregates PERM rows with its own columns", () => {
    const rows = [{ EMP_BUSINESS_NAME: "Shopify Inc", EMP_FEIN: "111111111", EMP_STATE: "TX", CASE_STATUS: "Certified" }];
    expect(aggregateUs(rows, "perm", "SHOPIFY")).toEqual([
      { name: "Shopify Inc", fein: "111111111", state: "TX", certified: 1 },
    ]);
  });
  it("aggregates Canadian rows by province and stream, never printing the address", () => {
    const rows = [
      { Employer: "Shopify Inc.", Address: "151 O'Connor St, Ottawa, ON K2P 2L8", "Province/Territory": "Ontario", "Program Stream": "Global Talent Stream", "Approved Positions": "3" },
      { Employer: "Shopify Inc.", Address: "1 Main St, Ottawa, ON", "Province/Territory": "Ontario", "Program Stream": "High Wage", "Approved Positions": "2" },
      { Employer: "Shopify Inc.", Address: "", "Province/Territory": "British Columbia", "Program Stream": "High Wage", "Approved Positions": "1" },
      { Employer: "Other Ltd", Address: "", "Province/Territory": "Ontario", "Program Stream": "High Wage", "Approved Positions": "9" },
    ];
    const t = aggregateCa(rows, "SHOPIFY");
    expect(t).toEqual([
      { name: "Shopify Inc.", province: "ON", positions: 5, streams: { "Global Talent Stream": 3, "High Wage": 2 } },
      { name: "Shopify Inc.", province: "BC", positions: 1, streams: { "High Wage": 1 } },
    ]);
    const out = formatCaTable(t, 50);
    expect(out).toContain("Global Talent Stream");
    expect(out).not.toContain("O'Connor");
    expect(out).not.toContain("K2P");
  });
});
