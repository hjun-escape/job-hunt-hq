import { describe, it, expect } from "vitest";
import { defaultSettings, defaultProfile, SCHEMA_VERSION } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { PickListName } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

describe("defaultSettings", () => {
  const s = defaultSettings("America/Toronto", NOW);

  it("has the current schema version and home timezone", () => {
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.homeTz).toBe("America/Toronto");
    expect(s.displayCurrency).toBe("CAD");
  });

  it("has 13 statuses with open/won/lost groups", () => {
    const st = s.pickLists.statuses;
    expect(st).toHaveLength(13);
    expect(st.filter((x) => x.group === "open")).toHaveLength(9);
    expect(st.filter((x) => x.group === "won").map((x) => x.id)).toEqual(["accepted"]);
    expect(st.filter((x) => x.group === "lost").map((x) => x.id)).toEqual(["rejected", "withdrawn", "ghosted"]);
  });

  it("ranks won above every open stage and lost at zero", () => {
    const st = s.pickLists.statuses;
    const maxOpen = Math.max(...st.filter((x) => x.group === "open").map((x) => x.stageRank));
    const won = st.find((x) => x.id === "accepted")!;
    expect(won.stageRank).toBe(maxOpen + 1);
    for (const lost of st.filter((x) => x.group === "lost")) expect(lost.stageRank).toBe(0);
  });

  it("has unique ids inside every pick list", () => {
    for (const name of Object.keys(s.pickLists) as PickListName[]) {
      const ids = s.pickLists[name].map((e) => e.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has CA, US, KR countries", () => {
    expect(s.pickLists.countries.map((c) => c.id)).toEqual(["CA", "US", "KR"]);
  });
});

describe("defaultProfile", () => {
  it("has a work-auth block per default country", () => {
    const p = defaultProfile(NOW);
    expect(Object.keys(p.workAuth).sort()).toEqual(["CA", "KR", "US"]);
    expect(p.sensitiveNote).toBe("");
  });
});

describe("factories", () => {
  it("buildApplication fills every required array and null field", () => {
    const a = buildApplication(
      { companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "saved" },
      "app_1",
      NOW,
    );
    expect(a).toMatchObject({
      id: "app_1", createdAt: NOW, updatedAt: NOW, tier: null, desire: null, fit: null, likelihood: null,
      needsSponsorship: null, sponsorshipOffered: null, answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 0,
    });
  });

  it("buildApplication honours an explicit maxStageRank", () => {
    const a = buildApplication(
      { companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 },
      "app_2",
      NOW,
    );
    expect(a.maxStageRank).toBe(3);
  });

  it("buildCompany fills arrays and strings", () => {
    const c = buildCompany({ name: "Shopify" }, "co_1", NOW);
    expect(c).toMatchObject({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "" });
  });
});
