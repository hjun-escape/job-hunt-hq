import { describe, it, expect } from "vitest";
import { emptyFilter, filterApplications } from "../../src/domain/applicationFilters";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";
const settings = defaultSettings("UTC", NOW);
const companies = { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW), co_2: buildCompany({ name: "Kakao" }, "co_2", NOW) };
const apps = [
  buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", tier: "A", tags: ["remote-ok"] }, "a1", NOW),
  buildApplication({ companyId: "co_2", title: "백엔드 개발자", countryId: "KR", channelId: "wanted", statusId: "rejected" }, "a2", NOW),
  buildApplication({ companyId: "co_1", title: "Data Engineer", countryId: "US", channelId: "referral", statusId: "interviewing", city: "Austin" }, "a3", NOW),
];
const ctx = { companies, settings };

describe("filterApplications", () => {
  it("hides closed applications unless includeClosed or a closed status is chosen", () => {
    expect(filterApplications(apps, emptyFilter(), ctx).map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), includeClosed: true }, ctx)).toHaveLength(3);
    expect(filterApplications(apps, { ...emptyFilter(), statusId: "rejected" }, ctx).map((a) => a.id)).toEqual(["a2"]);
  });
  it("matches text against company, title, city, tags, case-insensitively", () => {
    expect(filterApplications(apps, { ...emptyFilter(), text: "shop" }, ctx).map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), text: "austin" }, ctx).map((a) => a.id)).toEqual(["a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), text: "remote-ok" }, ctx).map((a) => a.id)).toEqual(["a1"]);
    expect(filterApplications(apps, { ...emptyFilter(), text: "백엔드", includeClosed: true }, ctx).map((a) => a.id)).toEqual(["a2"]);
  });
  it("filters by country, tier and channel", () => {
    expect(filterApplications(apps, { ...emptyFilter(), countryId: "US" }, ctx).map((a) => a.id)).toEqual(["a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), tier: "A" }, ctx).map((a) => a.id)).toEqual(["a1"]);
    expect(filterApplications(apps, { ...emptyFilter(), channelId: "referral" }, ctx).map((a) => a.id)).toEqual(["a3"]);
  });
});
