import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { NAV } from "../../src/app/routes";

// capabilities.json is what gets passed to the Artifact tool's `capabilities` on publish. A
// non-empty declaration replaces the stored one, so it must restate every capability the page uses.
const manifest = JSON.parse(readFileSync("capabilities.json", "utf8")) as {
  db: { rules: { path: string; read: string; write: string }[] };
  [name: string]: unknown;
};

describe("capabilities.json", () => {
  it("declares every capability the page uses", () => {
    expect(Object.keys(manifest).sort()).toEqual(["assets", "db", "downloads", "sample", "user"]);
  });

  it("hides each private page's records from everyone below Editor", () => {
    const privateKeys = NAV.filter((n) => n.private).map((n) => n.key).sort();
    expect(privateKeys).toEqual(["answers", "assets", "contacts", "profile"]);
    for (const path of privateKeys) {
      expect(manifest.db.rules).toContainEqual({ path, read: "admin", write: "admin" });
    }
    expect(manifest.db.rules).toHaveLength(privateKeys.length);
  });
});
