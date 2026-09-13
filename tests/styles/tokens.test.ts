import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("danger button contrast tokens", () => {
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  const app = readFileSync("src/styles/app.css", "utf8");
  it("defines --danger-text on the light root and in both dark blocks", () => {
    expect(tokens.split("@media")[0]).toContain("--danger-text:");
    expect(tokens.match(/--danger-text:/g)?.length).toBe(3);
  });
  it("uses the token for the danger button text", () => {
    expect(app).toMatch(/\.btn\.danger \{[^}]*color: var\(--danger-text\)/);
  });
});
