import { describe, it, expect } from "vitest";
import { allTags, emptyFilter, filterApplications, type AppFilter } from "../../src/domain/applicationFilters";
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
  it("matches the requisition id in text search", () => {
    const withReq = [buildApplication({ companyId: "co_1", title: "SRE", countryId: "CA", channelId: "linkedin", statusId: "applied", reqId: "REQ-4471" }, "a9", NOW)];
    expect(filterApplications(withReq, { ...emptyFilter(), text: "4471" }, ctx).map((a) => a.id)).toEqual(["a9"]);
  });
  it("filters by sponsorship need/offer and by tag, and lists tags in use", () => {
    const sponsored = [
      buildApplication({ companyId: "co_1", title: "A", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: true, tags: ["remote", "go"] }, "a", NOW),
      buildApplication({ companyId: "co_1", title: "B", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: false, sponsorshipOffered: true, tags: ["go"] }, "b", NOW),
      buildApplication({ companyId: "co_1", title: "C", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "c", NOW),
    ];
    const ctxNone = { companies: {}, settings };
    const ids = (f: Partial<AppFilter>) => filterApplications(sponsored, { ...emptyFilter(), ...f }, ctxNone).map((a) => a.id);
    expect(ids({ sponsorship: "needs" })).toEqual(["a"]);
    expect(ids({ sponsorship: "no_need" })).toEqual(["b"]);
    expect(ids({ sponsorship: "offered" })).toEqual(["b"]);
    expect(ids({ sponsorship: "not_offered" })).toEqual([]);
    expect(ids({ tag: "go" })).toEqual(["a", "b"]);
    expect(allTags(sponsored)).toEqual(["go", "remote"]);
  });
});
