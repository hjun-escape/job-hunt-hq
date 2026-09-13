import { describe, it, expect } from "vitest";
import { describeDbError, isTransient, errorCode } from "../../src/capabilities/errors";

describe("db error helpers", () => {
  it("maps known codes to user text", () => {
    expect(describeDbError({ code: "quota_exceeded", message: "x" })).toMatch(/full/i);
    expect(describeDbError({ code: "resource_exhausted", message: "x" })).toMatch(/wait/i);
    expect(describeDbError({ code: "revoked", message: "x" })).toMatch(/reload/i);
    expect(describeDbError(new Error("boom"))).toMatch(/could not save/i);
  });
  it("flags only unavailable as transient", () => {
    expect(isTransient({ code: "unavailable", message: "" })).toBe(true);
    expect(isTransient({ code: "quota_exceeded", message: "" })).toBe(false);
    expect(errorCode("nope")).toBeUndefined();
  });
});
