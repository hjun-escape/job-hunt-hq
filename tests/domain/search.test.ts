import { describe, it, expect } from "vitest";
import { buildAnswer, buildApplication, buildCompany, buildContact } from "../../src/domain/factories";
import { searchAll } from "../../src/domain/search";
import type { RecordSets } from "../../src/domain/types";

const NOW = "2026-09-14T00:00:00.000Z";
const records: RecordSets = {
  applications: { app_1: buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW) },
  companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW), co_2: buildCompany({ name: "Shopping Cart Inc" }, "co_2", NOW) },
  contacts: { ct_1: buildContact({ name: "Dana Shop", relationshipId: "recruiter", companyId: "co_1" }, "ct_1", NOW) },
  assets: {}, answers: { an_1: buildAnswer({ kindId: "answer", title: "Why Shopify" }, "an_1", NOW) }, interviews: {}, prep: {},
};

describe("searchAll", () => {
  it("matches applications by title or company, companies, contacts and answers, prefix matches first", () => {
    const hits = searchAll(records, "shop");
    expect(hits.map((h) => `${h.kind}:${h.id}`)).toEqual(["company:co_1", "company:co_2", "application:app_1", "contact:ct_1", "answer:an_1"]);
    expect(hits[2]).toMatchObject({ title: "Backend Engineer", subtitle: "Shopify", href: "#/applications/app_1" });
    expect(hits[3].href).toBe("#/contacts/ct_1");
  });

  it("is case-insensitive, trims, returns nothing for a blank query, and caps results", () => {
    expect(searchAll(records, "  BACKEND ")).toHaveLength(1);
    expect(searchAll(records, "   ")).toEqual([]);
    expect(searchAll(records, "o", 2)).toHaveLength(2);
  });
});
