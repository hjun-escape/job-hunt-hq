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

  it("stretches the search form across the top bar on small screens", () => {
    const tail = css.slice(css.lastIndexOf("@media (max-width: 720px)"));
    expect(tail).toContain(".topbar form { flex: 1; }");
    expect(tail).toContain(".topbar input { max-width: none; }");
  });

  it("spaces the dashboard stat cards from the section below them", () => {
    expect(css).toMatch(/\.cards \{[^}]*margin-bottom: 14px;/);
  });

  it("keeps exactly one mobile breakpoint block, as the last rule in the file", () => {
    const occurrences = css.split("@media (max-width: 720px)").length - 1;
    expect(occurrences).toBe(1);
    expect(lastMediaStart).toBeGreaterThan(-1);
    // Nothing but the block's own rules (and trailing whitespace) may follow its opening --
    // i.e. its closing brace is the last non-whitespace character in the file.
    const closeIdx = tail.lastIndexOf("}");
    expect(closeIdx).toBeGreaterThan(-1);
    expect(tail.slice(closeIdx + 1).trim()).toBe("");
  });
});
