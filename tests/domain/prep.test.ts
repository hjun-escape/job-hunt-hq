import { describe, it, expect } from "vitest";
import { buildPrep } from "../../src/domain/factories";
import { allPatterns, filterPrep, logAttempt } from "../../src/domain/prep";

const NOW = "2026-09-11T00:00:00.000Z";
const items = [
  buildPrep({ kindId: "coding", title: "Two Sum", patterns: ["hash map"], difficulty: "easy", companyTags: ["Shopify"] }, "pr_1", NOW),
  buildPrep({ kindId: "coding", title: "LRU Cache", patterns: ["hash map", "linked list"], difficulty: "medium" }, "pr_2", NOW),
  buildPrep({ kindId: "system-design", title: "Rate limiter", patterns: ["distributed"], difficulty: null }, "pr_3", NOW),
];
const f = { text: "", kindId: "", pattern: "", difficulty: "" };

describe("prep domain", () => {
  it("filters by text (title, patterns, company tags), kind, pattern and difficulty", () => {
    expect(filterPrep(items, { ...f, text: "shopify" }).map((p) => p.id)).toEqual(["pr_1"]);
    expect(filterPrep(items, { ...f, kindId: "system-design" }).map((p) => p.id)).toEqual(["pr_3"]);
    expect(filterPrep(items, { ...f, pattern: "hash map" }).map((p) => p.id)).toEqual(["pr_1", "pr_2"]);
    expect(filterPrep(items, { ...f, difficulty: "medium" }).map((p) => p.id)).toEqual(["pr_2"]);
  });
  it("lists unique patterns sorted", () => {
    expect(allPatterns(items)).toEqual(["distributed", "hash map", "linked list"]);
  });
  it("logs an attempt", () => {
    expect(logAttempt(items[0], "2026-09-13")).toEqual({ attempts: 1, lastAttemptedAt: "2026-09-13" });
  });
});
