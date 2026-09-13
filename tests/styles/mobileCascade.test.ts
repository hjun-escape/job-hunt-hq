import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * Cascade regression: same-specificity rules resolve by source order, and a
 * media query adds no specificity. The mobile overrides for the drawer must
 * therefore appear AFTER the unconditional `.drawer-backdrop` / `.drawer-foot`
 * rules, or the fixed bottom nav (z-index 40) paints over drawer footers.
 */
describe("src/styles/app.css mobile drawer overrides", () => {
  const css = readFileSync("src/styles/app.css", "utf8");
  const lastMediaStart = css.lastIndexOf("@media (max-width: 720px)");
  const tail = css.slice(lastMediaStart);

  it("raises the drawer backdrop above the bottom nav after the base rule", () => {
    const base = css.indexOf(".drawer-backdrop, .modal-backdrop {");
    const override = css.indexOf(".drawer-backdrop { z-index: 45; }");
    expect(base).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(base);
    expect(tail).toContain(".drawer-backdrop { z-index: 45; }");
  });

  it("pads the drawer footer for the bottom nav after the base rule", () => {
    const base = css.indexOf(".drawer-foot { padding: 12px 16px;");
    const override = css.indexOf(".drawer-foot { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }");
    expect(base).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(base);
    expect(tail).toContain(".drawer-foot { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }");
  });
});
