import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("public/index.html is a valid artifact fragment", () => {
  const html = readFileSync("public/index.html", "utf8");

  it("has no document wrapper tags", () => {
    expect(html).not.toMatch(/<!doctype/i);
    expect(html).not.toMatch(/<html|<head|<body/i);
  });

  it("references bundled files by relative path", () => {
    expect(html).toContain('href="app.css"');
    expect(html).toContain('src="app.js"');
    expect(html).not.toMatch(/(href|src)="\//);
  });

  it("declares the title", () => {
    expect(html).toMatch(/<title>Job Hunt HQ<\/title>/);
  });
});
