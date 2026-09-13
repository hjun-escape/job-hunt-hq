import { describe, it, expect, afterEach } from "vitest";
import { createCapabilities } from "../../src/capabilities/resolve";

describe("createCapabilities", () => {
  afterEach(() => {
    delete (window as unknown as { claude?: unknown }).claude;
  });

  it("uses window.claude.use when present", async () => {
    const calls: string[] = [];
    (window as unknown as { claude: unknown }).claude = { use: async (name: string) => { calls.push(name); return name === "db" ? { marker: "real" } : null; } };
    const caps = createCapabilities();
    expect(await caps.db).toEqual({ marker: "real" });
    expect(await caps.sample).toBeNull();
    expect(calls.sort()).toEqual(["assets", "db", "downloads", "sample"]);
  });

  it("falls back to a persistent fake db and anchor downloads without window.claude", async () => {
    const caps = createCapabilities();
    const db = await caps.db;
    expect(db).not.toBeNull();
    expect(typeof db!.doc("a/b").set).toBe("function");
    expect(await caps.downloads).not.toBeNull();
    expect(await caps.assets).not.toBeNull();
    expect(await caps.sample).toBeNull();
  });
});
