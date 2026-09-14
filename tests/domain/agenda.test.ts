import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { dueThisWeek, followUpFlags, overdue, upcomingInterviews } from "../../src/domain/agenda";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";

const NOW = "2026-09-14T00:00:00.000Z";
// Monday 2026-09-14 09:00 in Toronto
const now = DateTime.fromISO("2026-09-14T13:00:00.000Z", { zone: "utc" });
const settings = defaultSettings("America/Toronto", NOW);
const app = (id: string, extra: Partial<Parameters<typeof buildApplication>[0]> = {}) =>
  buildApplication({ companyId: "co_1", title: `Role ${id}`, countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3, ...extra }, id, NOW);
const base = () => ({ applications: {}, companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW) }, contacts: {}, interviews: {} });

describe("agenda", () => {
  it("merges deadlines, next actions and interviews inside the next seven home-zone days, sorted by time", () => {
    const records = base();
    records.applications = {
      a: app("a", { deadline: { at: "2026-09-16T03:59:59.000Z", tz: "America/Toronto", dateOnly: true } }), // Tue 15 (date-only)
      b: app("b", { nextAction: "Ping recruiter", nextActionDue: "2026-09-14" }),                             // today
      c: app("c", { deadline: { at: "2026-09-22T03:59:59.000Z", tz: "America/Toronto", dateOnly: true } }), // Mon 21: outside
      d: app("d", { statusId: "rejected", nextActionDue: "2026-09-15" }),                                    // closed: ignored
    };
    records.interviews = {
      iv1: buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at: "2026-09-18T14:00:00.000Z", tz: "Asia/Seoul" } }, "iv1", NOW),
      iv2: buildInterview({ applicationId: "a", roundTypeId: "final", scheduledAt: { at: "2026-09-18T15:00:00.000Z", tz: "Asia/Seoul" }, outcome: "cancelled" }, "iv2", NOW),
    };
    const items = dueThisWeek(records, settings, now);
    expect(items.map((i) => `${i.kind}:${i.applicationId}`)).toEqual(["nextAction:b", "deadline:a", "interview:a"]);
    expect(items[0]).toMatchObject({ company: "Shopify", title: "Role b", detail: "Next action: Ping recruiter", dateOnly: true });
    expect(items[2]).toMatchObject({ interviewId: "iv1", detail: "Coding interview", dateOnly: false, tz: "Asia/Seoul" });
    expect(items[1]).toMatchObject({ tz: "America/Toronto", dateOnly: true });
  });

  it("lists overdue next actions and passed deadlines that were never applied to, for open applications only", () => {
    const records = base();
    records.applications = {
      a: app("a", { nextAction: "Send thank-you", nextActionDue: "2026-09-10" }),
      b: app("b", { deadline: { at: "2026-09-12T03:59:59.000Z", tz: "America/Toronto", dateOnly: true } }),
      c: app("c", { deadline: { at: "2026-09-12T03:59:59.000Z", tz: "America/Toronto", dateOnly: true }, appliedAt: "2026-09-11" }),
      d: app("d", { statusId: "ghosted", nextActionDue: "2026-09-01" }),
      e: app("e", { nextActionDue: "2026-09-14" }), // today is not overdue
    };
    const items = overdue(records, settings, now);
    expect(items.map((i) => `${i.kind}:${i.applicationId}`)).toEqual(["nextAction:a", "deadline:b"]);
    expect(items[1].detail).toBe("Deadline passed, not applied");
  });

  it("flags contacts that are due for a follow-up, never-contacted first", () => {
    const records = base();
    records.applications = { a: app("a", { recruiterContactId: "ct_1", referrerContactId: "ct_2" }) };
    records.contacts = {
      ct_1: buildContact({ name: "Dana", relationshipId: "recruiter", lastContactedAt: "2026-08-01" }, "ct_1", NOW),
      ct_2: buildContact({ name: "Min", relationshipId: "referrer" }, "ct_2", NOW),
      ct_3: buildContact({ name: "Unlinked", relationshipId: "peer" }, "ct_3", NOW),
    };
    const flags = followUpFlags(records, settings, now);
    expect(flags.map((f) => f.contact.name)).toEqual(["Min", "Dana"]);
    expect(flags[1].followUp.daysSince).toBe(44);
  });

  it("returns the next pending interviews in time order, capped", () => {
    const mk = (id: string, at: string, outcome: "pending" | "passed" = "pending") =>
      buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at, tz: "America/Toronto" }, outcome }, id, NOW);
    const list = [mk("late", "2026-10-01T14:00:00.000Z"), mk("soon", "2026-09-15T14:00:00.000Z"), mk("past", "2026-09-01T14:00:00.000Z"), mk("done", "2026-09-16T14:00:00.000Z", "passed"),
      buildInterview({ applicationId: "a", roundTypeId: "coding" }, "unscheduled", NOW)];
    expect(upcomingInterviews(list, "America/Toronto", now).map((i) => i.id)).toEqual(["soon", "late"]);
    expect(upcomingInterviews(list, "America/Toronto", now, 1).map((i) => i.id)).toEqual(["soon"]);
  });

  it("ignores interviews whose application no longer exists", () => {
    const records = base();
    records.applications = { a: app("a") };
    records.interviews = {
      keep: buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at: "2026-09-16T14:00:00.000Z", tz: "America/Toronto" } }, "keep", NOW),
      orphan: buildInterview({ applicationId: "gone", roundTypeId: "coding", scheduledAt: { at: "2026-09-16T15:00:00.000Z", tz: "America/Toronto" } }, "orphan", NOW),
    };
    expect(dueThisWeek(records, settings, now).map((i) => i.interviewId)).toEqual(["keep"]);
    expect(upcomingInterviews(Object.values(records.interviews), "America/Toronto", now, 5, records.applications).map((i) => i.id)).toEqual(["keep"]);
  });
});
