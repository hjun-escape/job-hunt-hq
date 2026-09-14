import { describe, it, expect, beforeEach } from "vitest";
import { ALL_COLUMN_KEYS, loadColumnPrefs, saveColumnPrefs } from "../../src/features/applications/columnPrefs";

describe("column prefs", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to every column, round-trips a choice, and never drops the locked columns", () => {
    expect(loadColumnPrefs()).toEqual(ALL_COLUMN_KEYS);
    saveColumnPrefs(["status", "deadline"]);
    expect(loadColumnPrefs()).toEqual(["company", "title", "status", "deadline"]);
  });
  it("ignores garbage in storage", () => {
    localStorage.setItem("jhq.applications.columns", "{not json");
    expect(loadColumnPrefs()).toEqual(ALL_COLUMN_KEYS);
    localStorage.setItem("jhq.applications.columns", JSON.stringify({ a: 1 }));
    expect(loadColumnPrefs()).toEqual(ALL_COLUMN_KEYS);
  });
});
