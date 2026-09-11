import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  isValidZone, localToUtcIso, makeDeadline, makeZoned, formatForHome, toLocalInputValue, todayIso, daysUntil, isPastDate, urgency,
} from "../../src/domain/dates";

describe("zones and conversion", () => {
  it("validates IANA zones", () => {
    expect(isValidZone("Asia/Seoul")).toBe(true);
    expect(isValidZone("Mars/Olympus")).toBe(false);
  });
  it("converts a Seoul local time to UTC", () => {
    expect(localToUtcIso("2026-09-20T14:00", "Asia/Seoul")).toBe("2026-09-20T05:00:00.000Z");
  });
  it("throws on an invalid local time", () => {
    expect(() => localToUtcIso("nope", "Asia/Seoul")).toThrow();
  });
});

describe("makeDeadline / makeZoned", () => {
  it("date-only ends the day in the source zone", () => {
    expect(makeDeadline("2026-09-20", "Asia/Seoul", true)).toEqual({ at: "2026-09-20T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true });
  });
  it("timed deadline keeps the instant", () => {
    expect(makeDeadline("2026-09-20T09:30", "America/Toronto", false).at).toBe("2026-09-20T13:30:00.000Z");
  });
  it("makeZoned wraps an instant with its zone", () => {
    expect(makeZoned("2026-09-20T09:30", "America/Vancouver")).toEqual({ at: "2026-09-20T16:30:00.000Z", tz: "America/Vancouver" });
  });
});

describe("formatForHome", () => {
  it("shows home time and the source time when zones differ", () => {
    const r = formatForHome({ at: "2026-09-20T05:00:00.000Z", tz: "Asia/Seoul" }, "America/Toronto");
    expect(r.home).toContain("2026-09-20");
    expect(r.home).toContain("01:00");
    expect(r.source).toContain("14:00");
  });
  it("omits the source when zones match", () => {
    const r = formatForHome({ at: "2026-09-20T05:00:00.000Z", tz: "Asia/Seoul" }, "Asia/Seoul");
    expect(r.source).toBeNull();
  });
  it("never shifts a date-only deadline", () => {
    const r = formatForHome({ at: "2026-09-20T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true }, "America/Toronto");
    expect(r.home).toContain("2026-09-20");
    expect(r.home).not.toMatch(/\d{2}:\d{2}/);
    expect(r.source).toBeNull();
  });
});

describe("input values", () => {
  it("renders datetime-local and date values in the given zone", () => {
    expect(toLocalInputValue("2026-09-20T05:00:00.000Z", "Asia/Seoul", false)).toBe("2026-09-20T14:00");
    expect(toLocalInputValue("2026-09-20T14:59:59.999Z", "Asia/Seoul", true)).toBe("2026-09-20");
  });
});

describe("today / daysUntil / isPastDate / urgency", () => {
  const now = DateTime.fromISO("2026-09-11T12:00:00Z", { zone: "utc" });
  it("todayIso is the home-zone date", () => {
    expect(todayIso("Asia/Seoul", now)).toBe("2026-09-11");
    expect(todayIso("Pacific/Auckland", DateTime.fromISO("2026-09-11T23:30:00Z", { zone: "utc" }))).toBe("2026-09-12");
  });
  it("daysUntil counts whole days in the home zone", () => {
    // 2026-09-13T03:00Z is 2026-09-12 23:00 in Toronto → 1 day after 2026-09-11
    expect(daysUntil("2026-09-13T03:00:00.000Z", "America/Toronto", now)).toBe(1);
    expect(daysUntil("2026-09-10T12:00:00.000Z", "America/Toronto", now)).toBe(-1);
  });
  it("isPastDate compares ISO dates against today", () => {
    expect(isPastDate("2026-09-10", "America/Toronto", now)).toBe(true);
    expect(isPastDate("2026-09-11", "America/Toronto", now)).toBe(false);
  });
  it("urgency bands", () => {
    expect(urgency(-1)).toBe("overdue");
    expect(urgency(0)).toBe("urgent");
    expect(urgency(1)).toBe("urgent");
    expect(urgency(6)).toBe("soon");
    expect(urgency(7)).toBe("later");
  });
});
