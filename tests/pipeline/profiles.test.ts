// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadProfiles } from "../../pipeline/profiles/load";
import { validateProfiles } from "../../pipeline/profiles/validate";

const DIR = path.join(__dirname, "fixtures", "companies");
const TODAY = new Date("2026-06-01T00:00:00Z");

// Fixture files have descriptive names; the profile is validated under "<id>.yaml" like a real file,
// except id-mismatch.yaml, which keeps its own name to trigger the rule.
function entry(file: string) {
  const profile = parse(readFileSync(path.join(DIR, file), "utf8")) as { id: string };
  return { file: file === "id-mismatch.yaml" ? file : `${profile.id}.yaml`, profile: profile as unknown };
}
function messages(file: string): string[] {
  return validateProfiles([entry(file)], TODAY).problems.map((p) => p.message);
}

describe("validateProfiles", () => {
  it("accepts a valid profile (www and officialHosts subdomains count)", () => {
    const r = validateProfiles([entry("example.com.yaml")], TODAY);
    expect(r.problems).toEqual([]);
    expect(r.profiles).toHaveLength(1);
  });
  it("requires id to equal the file name", () => {
    expect(messages("id-mismatch.yaml")).toContain("id must equal the file name");
  });
  it("rejects official facts citing a host outside the company, with a fact path", () => {
    expect(messages("official-from-reddit.yaml")).toContain("official fact cites a host outside the company");
    const p = validateProfiles([entry("official-from-reddit.yaml")], TODAY).problems[0];
    expect(p).toMatchObject({ file: "official-reddit-example.com.yaml", path: "mission.sources[0].url" });
  });
  it("lets reported facts cite any host", () => {
    expect(messages("reported-from-reddit.yaml")).toEqual([]);
  });
  it("rejects dates in the future", () => {
    expect(messages("future-date.yaml")).toContain("date is in the future");
  });
  it("rejects a FEIN claimed by two profiles and names the other file", () => {
    const { problems } = validateProfiles([entry("a.com.yaml"), entry("b.com.yaml")], TODAY);
    expect(problems).toEqual([expect.objectContaining({ message: expect.stringContaining("a.com.yaml") })]);
    expect(problems[0].file).toBe("b.com.yaml");
  });
  it("rejects a normalised US name or a (CA name, province) pair claimed twice", () => {
    const mk = (id: string, entities: unknown) => ({
      file: `${id}.yaml`,
      profile: { id, name: id, countries: ["US"], entities },
    });
    const us = validateProfiles(
      [mk("a.com", { usNames: ["Acme, Inc."] }), mk("b.com", { usNames: ["ACME LLC"] })],
      TODAY,
    ).problems;
    expect(us).toHaveLength(1);
    expect(us[0].message).toContain("a.com.yaml");
    const ca = validateProfiles(
      [
        mk("a.com", { caNames: [{ name: "Acme Ltd.", province: "ON" }] }),
        mk("b.com", { caNames: [{ name: "ACME", province: "ON" }] }),
        mk("c.com", { caNames: [{ name: "ACME", province: "BC" }] }),
      ],
      TODAY,
    ).problems;
    expect(ca).toHaveLength(1);
    expect(ca[0].file).toBe("b.com.yaml");
  });
  it("requires a Korean summary for KR companies", () => {
    expect(messages("kr-without-ko.yaml")).toContain("Korean companies need a Korean summary");
  });
  it("maps schema errors to problems", () => {
    const r = validateProfiles([{ file: "x.com.yaml", profile: { id: "x.com", extra: 1 } }], TODAY);
    expect(r.profiles).toEqual([]);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.problems[0].file).toBe("x.com.yaml");
  });
});

describe("loadProfiles", () => {
  it("loads yaml files sorted by name and ignores other files", async () => {
    const r = await loadProfiles(DIR, TODAY);
    const files = [...new Set(r.problems.map((p) => p.file))];
    expect(files).toEqual([...files].sort());
    expect(r.profiles.map((p) => p.id)).toContain("example.com");
  });
  it("returns nothing for a missing directory", async () => {
    const r = await loadProfiles(path.join(DIR, "does-not-exist"), TODAY);
    expect(r).toEqual({ profiles: [], problems: [] });
  });
});
