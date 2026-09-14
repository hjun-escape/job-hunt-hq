import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import { applyStatusChange, appendActivity, findStatus, ACTIVITY_CAP } from "../../src/domain/status";

const NOW = "2026-09-11T00:00:00.000Z";
const LATER = "2026-09-12T00:00:00.000Z";
const settings = defaultSettings("America/Toronto", NOW);
const base = () =>
  buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW);

describe("findStatus", () => {
  it("finds by id and returns undefined otherwise", () => {
    expect(findStatus(settings, "interviewing")?.label).toBe("Interviewing");
    expect(findStatus(settings, "nope")).toBeUndefined();
  });
});

describe("applyStatusChange", () => {
  it("appends a status activity and raises maxStageRank", () => {
    const next = applyStatusChange(base(), findStatus(settings, "interviewing")!, LATER, "recruiter emailed");
    expect(next.statusId).toBe("interviewing");
    expect(next.maxStageRank).toBe(6);
    expect(next.updatedAt).toBe(LATER);
    expect(next.activity).toEqual([{ at: LATER, type: "status", from: "applied", to: "interviewing", text: "recruiter emailed" }]);
  });

  it("sets closedAt when moving to a lost status and keeps maxStageRank", () => {
    const next = applyStatusChange(base(), findStatus(settings, "rejected")!, LATER);
    expect(next.closedAt).toBe(LATER);
    expect(next.maxStageRank).toBe(3);
  });

  it("clears closedAt and closedReasonId when reopening", () => {
    const closed = { ...applyStatusChange(base(), findStatus(settings, "rejected")!, LATER), closedReasonId: "no-response" };
    const reopened = applyStatusChange(closed, findStatus(settings, "applied")!, LATER);
    expect(reopened.closedAt).toBeUndefined();
    expect(reopened.closedReasonId).toBeUndefined();
  });

  it("is a no-op for the same status", () => {
    const app = base();
    expect(applyStatusChange(app, findStatus(settings, "applied")!, LATER)).toBe(app);
  });

  it("does not mutate the input", () => {
    const app = base();
    applyStatusChange(app, findStatus(settings, "offer")!, LATER);
    expect(app.statusId).toBe("applied");
    expect(app.activity).toEqual([]);
  });

  it("moving between two closed statuses re-stamps closedAt and keeps the reason", () => {
    const rejected = findStatus(settings, "rejected")!;
    const withdrawn = findStatus(settings, "withdrawn")!;
    const closed = { ...applyStatusChange(base(), rejected, "2026-09-01T00:00:00.000Z"), closedReasonId: "no-response" };
    const next = applyStatusChange(closed, withdrawn, "2026-09-02T00:00:00.000Z");
    expect(next.closedAt).toBe("2026-09-02T00:00:00.000Z");
    expect(next.closedReasonId).toBe("no-response");
    expect(next.statusId).toBe("withdrawn");
  });
});

describe("appendActivity", () => {
  it("caps the log at ACTIVITY_CAP keeping the newest", () => {
    let app = base();
    for (let i = 0; i < ACTIVITY_CAP + 5; i++) app = appendActivity(app, { type: "note", text: `n${i}` }, LATER);
    expect(app.activity).toHaveLength(ACTIVITY_CAP);
    expect(app.activity[app.activity.length - 1].text).toBe(`n${ACTIVITY_CAP + 4}`);
    expect(app.activity[0].text).toBe("n5");
  });
});
