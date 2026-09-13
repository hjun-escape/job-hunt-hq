import { describe, it, expect } from "vitest";
import { parseHash } from "../../src/app/router";

describe("parseHash", () => {
  it("parses empty and root hashes to the dashboard", () => {
    expect(parseHash("")).toMatchObject({ path: "/", parts: [] });
    expect(parseHash("#/")).toMatchObject({ path: "/", parts: [] });
  });
  it("splits parts and query", () => {
    const r = parseHash("#/applications/app_1?tab=notes");
    expect(r.parts).toEqual(["applications", "app_1"]);
    expect(r.path).toBe("/applications/app_1");
    expect(r.query.get("tab")).toBe("notes");
  });
});
