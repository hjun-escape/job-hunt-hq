import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildInterview } from "../../src/domain/factories";
import { bucketFor, formatSlot, groupInterviews, roundsFor } from "../../src/domain/interviews";

const NOW = "2026-09-11T00:00:00.000Z";
// Friday 2026-09-11 08:00 in Toronto
const now = DateTime.fromISO("2026-09-11T12:00:00Z", { zone: "utc" });
const z = (at: string, tz = "America/Toronto") => ({ at, tz });

describe("bucketFor", () => {
  it("assigns past, today, this week, next week, later and unscheduled in the home zone", () => {
    expect(bucketFor(z("2026-09-10T20:00:00.000Z"), "America/Toronto", now)).toBe("past");
    expect(bucketFor(z("2026-09-11T11:00:00.000Z"), "America/Toronto", now)).toBe("past");
    expect(bucketFor(z("2026-09-11T20:00:00.000Z"), "America/Toronto", now)).toBe("today");
    expect(bucketFor(z("2026-09-13T15:00:00.000Z"), "America/Toronto", now)).toBe("thisWeek");
    expect(bucketFor(z("2026-09-15T15:00:00.000Z"), "America/Toronto", now)).toBe("nextWeek");
    expect(bucketFor(z("2026-10-01T15:00:00.000Z"), "America/Toronto", now)).toBe("later");
    expect(bucketFor(undefined, "America/Toronto", now)).toBe("unscheduled");
  });
});

describe("groupInterviews / roundsFor / formatSlot", () => {
  const ivs = [
    buildInterview({ applicationId: "app_1", roundTypeId: "coding", scheduledAt: z("2026-09-15T15:00:00.000Z") }, "iv_next", NOW),
    buildInterview({ applicationId: "app_1", roundTypeId: "recruiter-screen", scheduledAt: z("2026-09-10T20:00:00.000Z") }, "iv_past", NOW),
    buildInterview({ applicationId: "app_2", roundTypeId: "oa" }, "iv_none", "2026-09-12T00:00:00.000Z"),
    buildInterview({ applicationId: "app_1", roundTypeId: "system-design", scheduledAt: z("2026-09-11T20:00:00.000Z") }, "iv_today", NOW),
  ];
  it("groups and orders upcoming ascending, past descending", () => {
    const g = groupInterviews(ivs, "America/Toronto", now);
    expect(g.today.map((i) => i.id)).toEqual(["iv_today"]);
    expect(g.nextWeek.map((i) => i.id)).toEqual(["iv_next"]);
    expect(g.past.map((i) => i.id)).toEqual(["iv_past"]);
    expect(g.unscheduled.map((i) => i.id)).toEqual(["iv_none"]);
  });
  it("lists an application's rounds scheduled first, then unscheduled", () => {
    expect(roundsFor("app_1", ivs).map((i) => i.id)).toEqual(["iv_past", "iv_today", "iv_next"]);
    expect(roundsFor("app_2", ivs).map((i) => i.id)).toEqual(["iv_none"]);
  });
  it("formats a slot in the home zone with the source zone when different", () => {
    expect(formatSlot(z("2026-09-15T05:00:00.000Z", "Asia/Seoul"), "America/Toronto")).toMatch(/2026-09-15 .*01:00.*14:00.*there/);
    expect(formatSlot(undefined, "America/Toronto")).toBe("Not scheduled");
  });
});
