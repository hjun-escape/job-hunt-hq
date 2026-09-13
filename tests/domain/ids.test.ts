import { describe, it, expect } from "vitest";
import { newId, nowIso, ID_PREFIX } from "../../src/domain/ids";

describe("newId", () => {
  it("formats as prefix_base36time_6chars", () => {
    expect(newId("app", 1_700_000_000_000)).toMatch(/^app_[0-9a-z]+_[0-9a-z]{6}$/);
  });
  it("is unique across many calls", () => {
    // 2000 draws made a ~0.1% collision chance per test run; 300 keeps the check meaningful
    // without making the suite occasionally flaky.
    const ids = new Set(Array.from({ length: 300 }, () => newId(ID_PREFIX.applications)));
    expect(ids.size).toBe(300);
  });
});

describe("nowIso", () => {
  it("returns a UTC ISO string", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
