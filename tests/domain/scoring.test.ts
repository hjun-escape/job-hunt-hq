import { describe, it, expect } from "vitest";
import { priorityScore, suggestedTier } from "../../src/domain/scoring";

const W = { desire: 0.4, fit: 0.35, likelihood: 0.25 };

describe("priorityScore", () => {
  it("is 100 for all fives and 20 for all ones", () => {
    expect(priorityScore({ desire: 5, fit: 5, likelihood: 5 }, W)).toBe(100);
    expect(priorityScore({ desire: 1, fit: 1, likelihood: 1 }, W)).toBe(20);
  });
  it("weights each factor", () => {
    // 0.4*5 + 0.35*3 + 0.25*1 = 3.3 ; 3.3 / 5 = 0.66
    expect(priorityScore({ desire: 5, fit: 3, likelihood: 1 }, W)).toBe(66);
  });
  it("returns null when any rating is missing", () => {
    expect(priorityScore({ desire: 5, fit: null, likelihood: 5 }, W)).toBeNull();
  });
  it("returns null when weights sum to zero", () => {
    expect(priorityScore({ desire: 5, fit: 5, likelihood: 5 }, { desire: 0, fit: 0, likelihood: 0 })).toBeNull();
  });
});

describe("suggestedTier", () => {
  it("maps thresholds", () => {
    expect(suggestedTier(75)).toBe("A");
    expect(suggestedTier(74)).toBe("B");
    expect(suggestedTier(50)).toBe("B");
    expect(suggestedTier(49)).toBe("C");
    expect(suggestedTier(null)).toBeNull();
  });
});
