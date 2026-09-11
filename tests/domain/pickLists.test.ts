import { describe, it, expect } from "vitest";
import { addEntry, moveEntry, referencedPickIds, removeEntry, slugId, updateEntry } from "../../src/domain/pickLists";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { emptyState } from "../../src/store/store";
import type { PickEntry } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
const list: PickEntry[] = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];

describe("slugId", () => {
  it("slugs ascii, keeps Korean letters, and de-duplicates", () => {
    expect(slugId("Hacker News", [])).toBe("hacker-news");
    expect(slugId("  Cold   Email! ", [])).toBe("cold-email");
    expect(slugId("잡플래닛", [])).toBe("잡플래닛");
    expect(slugId("A", list)).toBe("a-2");
    expect(slugId("!!!", [])).toBe("item");
  });
});

describe("list reducers", () => {
  it("addEntry appends and rejects duplicates or blank labels", () => {
    expect(addEntry(list, { id: "d", label: "D" }).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(() => addEntry(list, { id: "a", label: "Again" })).toThrow(/duplicate/i);
    expect(() => addEntry(list, { id: "e", label: "  " })).toThrow(/label/i);
  });
  it("updateEntry patches one entry without mutating", () => {
    const out = updateEntry(list, "b", { label: "Bee", color: "blue" });
    expect(out[1]).toEqual({ id: "b", label: "Bee", color: "blue" });
    expect(list[1].label).toBe("B");
  });
  it("moveEntry swaps neighbours and ignores out-of-range moves", () => {
    expect(moveEntry(list, 0, 1).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(moveEntry(list, 0, -1)).toBe(list);
    expect(moveEntry(list, 2, 1)).toBe(list);
  });
  it("removeEntry drops by id", () => {
    expect(removeEntry(list, "b").map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("referencedPickIds", () => {
  it("collects ids used by records for statuses, channels and countries", () => {
    const state = emptyState();
    state.applications.app_1 = buildApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW);
    state.companies.co_1 = buildCompany({ name: "x", sponsorship: { KR: { policy: "yes" } } }, "co_1", NOW);
    expect([...referencedPickIds(state, "statuses")]).toEqual(["applied"]);
    expect([...referencedPickIds(state, "channels")]).toEqual(["linkedin"]);
    expect([...referencedPickIds(state, "countries")].sort()).toEqual(["CA", "KR"]);
    expect(referencedPickIds(state, "roundTypes").size).toBe(0);
  });
});
