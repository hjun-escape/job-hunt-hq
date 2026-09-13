import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildContact, buildInterview } from "../../src/domain/factories";
import { contactLinks, followUpDue, isContactReferenced } from "../../src/domain/contacts";

const NOW = "2026-09-11T00:00:00.000Z";
const statuses = defaultSettings("UTC", NOW).pickLists.statuses;
const apps = [
  buildApplication({ companyId: "co_1", title: "A", countryId: "CA", channelId: "referral", statusId: "applied", referrerContactId: "ct_1", recruiterContactId: "ct_2" }, "app_1", NOW),
  buildApplication({ companyId: "co_1", title: "B", countryId: "CA", channelId: "linkedin", statusId: "rejected", referrerContactId: "ct_1" }, "app_2", NOW),
];
const interviews = [buildInterview({ applicationId: "app_1", roundTypeId: "coding", interviewerContactIds: ["ct_3"] }, "iv_1", NOW)];

describe("contactLinks / isContactReferenced", () => {
  it("collects the applications and interviews a contact is attached to", () => {
    const links = contactLinks("ct_1", apps, interviews);
    expect(links.asReferrer.map((a) => a.id)).toEqual(["app_1", "app_2"]);
    expect(links.asRecruiter).toEqual([]);
    expect(contactLinks("ct_3", apps, interviews).asInterviewer.map((i) => i.id)).toEqual(["iv_1"]);
    expect(isContactReferenced("ct_2", apps, interviews)).toBe(true);
    expect(isContactReferenced("ct_9", apps, interviews)).toBe(false);
  });
});

describe("followUpDue", () => {
  const today = "2026-09-11";
  it("is due when linked to an open application and last contact is older than the cadence", () => {
    const c = buildContact({ name: "Dana", relationshipId: "referrer", lastContactedAt: "2026-09-01" }, "ct_1", NOW);
    expect(followUpDue(c, apps, statuses, 7, today)).toEqual({ due: true, daysSince: 10, reason: "Last contacted 10 days ago" });
  });
  it("respects a per-contact cadence override", () => {
    const c = buildContact({ name: "Dana", relationshipId: "referrer", lastContactedAt: "2026-09-01", followUpEveryDays: 14 }, "ct_1", NOW);
    expect(followUpDue(c, apps, statuses, 7, today).due).toBe(false);
  });
  it("is due when never contacted but linked to an open application", () => {
    const c = buildContact({ name: "Rae", relationshipId: "recruiter" }, "ct_2", NOW);
    expect(followUpDue(c, apps, statuses, 7, today)).toEqual({ due: true, daysSince: null, reason: "Never contacted" });
  });
  it("is not due when only linked to closed applications or not linked at all", () => {
    const onlyClosed = buildContact({ name: "X", relationshipId: "referrer", lastContactedAt: "2026-01-01" }, "ct_x", NOW);
    const closedApps = apps.filter((a) => a.id === "app_2");
    expect(followUpDue(onlyClosed, closedApps, statuses, 7, today).due).toBe(false);
    const unlinked = buildContact({ name: "Y", relationshipId: "peer", lastContactedAt: "2026-01-01" }, "ct_y", NOW);
    expect(followUpDue(unlinked, apps, statuses, 7, today).due).toBe(false);
  });
});
