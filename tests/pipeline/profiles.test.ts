// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

describe("personal text scan", () => {
  const base = { id: "zeta.test", name: "Zeta", countries: ["US"], entities: {} };
  const fact = (en: string, url = "https://zeta.test/about", kind = "official") => ({
    value: { en },
    kind,
    sources: [{ url, seen: "2026-01-01" }],
    checked: "2026-01-01",
  });
  const check = (profile: Record<string, unknown>) =>
    validateProfiles([{ file: "zeta.test.yaml", profile: { ...base, ...profile } }], TODAY);

  it("reports an email address with the fact path, never the address, and drops the profile", () => {
    const r = check({ mission: fact("Write to careers@zeta.example to apply.") });
    expect(r.problems).toEqual([{ file: "zeta.test.yaml", path: "mission.value.en", message: "contains an email address" }]);
    expect(JSON.stringify(r.problems)).not.toContain("careers@");
    expect(r.profiles).toEqual([]);
  });
  it("reports email-shaped text such as an image name in any text field", () => {
    expect(check({ otherNames: ["Zeta logo@2x.png"] }).problems).toEqual([
      { file: "zeta.test.yaml", path: "otherNames[0]", message: "contains an email address" },
    ]);
  });
  it("reports an upper-case Canadian postal code", () => {
    expect(check({ hiringProcess: fact("Interviews are held at our office, M5V 1J2.") }).problems).toEqual([
      { file: "zeta.test.yaml", path: "hiringProcess.value.en", message: "contains what looks like a postal code" },
    ]);
  });
  it("reports a contact or preparer column name", () => {
    expect(check({ applicationRules: [fact("Copied from EMPLOYER_POC_EMAIL.")] }).problems).toEqual([
      { file: "zeta.test.yaml", path: "applicationRules[0].value.en", message: "contains a contact or preparer column name" },
    ]);
  });
  it("lets short links whose path looks like a postal code through, in either case", () => {
    for (const url of ["https://bit.ly/a1b2c3", "https://bit.ly/A1B2C3"]) {
      const r = check({
        mission: fact("We build tools.", url, "reported"),
        links: [{ label: "Blind", url }],
        otherNames: [url],
      });
      expect(r.problems, url).toEqual([]);
      expect(r.profiles, url).toHaveLength(1);
    }
  });
  it("still scans URLs: user names, passwords and email-shaped text are refused", () => {
    const cases: [string, string][] = [
      ["https://jane:pw@zeta.test/x", "contains a user name or password in a URL"],
      ["https://zeta.test/?contact=jane@doe.example", "contains an email address"],
      ["https://zeta.test/?contact=jane%40doe.example", "contains an email address"],
      ["https://zeta.test/apply#jane@doe.example", "contains an email address"],
      ["https://zeta.test/logo@2x.png", "contains an email address"],
      ["https://zeta.test/export?f=EMPLOYER_POC_EMAIL", "contains a contact or preparer column name"],
    ];
    for (const [url, message] of cases) {
      expect(check({ mission: fact("We build tools.", url, "reported") }).problems, url).toEqual([
        { file: "zeta.test.yaml", path: "mission.sources[0].url", message },
      ]);
      expect(check({ links: [{ label: "Page", url }] }).problems, url).toEqual([
        { file: "zeta.test.yaml", path: "links[0].url", message },
      ]);
    }
  });
  it("catches postal codes in text in any case, and a short link written as text", () => {
    for (const text of ["Our office is at m5v 1j2.", "Our office is at M5V1J2.", "see bit.ly/a1b2c3"]) {
      expect(check({ otherNames: [text] }).problems, text).toEqual([
        { file: "zeta.test.yaml", path: "otherNames[0]", message: "contains what looks like a postal code" },
      ]);
    }
  });
});

describe("text fragments in source URLs", () => {
  const check = (url: string) =>
    validateProfiles(
      [
        {
          file: "zeta.test.yaml",
          profile: {
            id: "zeta.test",
            name: "Zeta",
            countries: ["US"],
            entities: {},
            mission: { value: { en: "We build tools." }, kind: "official", sources: [{ url, seen: "2026-01-01" }], checked: "2026-01-01" },
          },
        },
      ],
      TODAY,
    ).problems;

  it("accepts a passage the way a browser's Copy link to highlight writes it", () => {
    expect(check("https://zeta.test/about#:~:text=We%20build,tools.")).toEqual([]);
    expect(check("https://zeta.test/about#:~:text=our-,mission,-is&text=Values")).toEqual([]);
  });
  it("refuses a malformed one, with the source path", () => {
    for (const url of ["https://zeta.test/about#:~:text=", "https://zeta.test/about#:~:text=a,b,c", "https://zeta.test/about#:~:text=We build"]) {
      expect(check(url), url).toEqual([
        { file: "zeta.test.yaml", path: "mission.sources[0].url", message: "text fragment (#:~:text=) is malformed" },
      ]);
    }
  });
});

describe("loadProfiles", () => {
  it("loads yaml files sorted by name", async () => {
    const r = await loadProfiles(DIR, TODAY);
    const files = [...new Set(r.problems.map((p) => p.file))];
    expect(files).toEqual([...files].sort());
    expect(r.profiles.map((p) => p.id)).toContain("example.com");
  });
  it("reports every file that is not .yaml or a dotfile, so a contributor's file is never silently ignored", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "profiles-load-"));
    try {
      writeFileSync(path.join(dir, "example.com.yaml"), readFileSync(path.join(DIR, "example.com.yaml")));
      writeFileSync(path.join(dir, "stripe.com.yml"), "id: stripe.com\n");
      writeFileSync(path.join(dir, "notes.md"), "x\n");
      writeFileSync(path.join(dir, ".gitkeep"), "");
      writeFileSync(path.join(dir, ".DS_Store"), "x");
      mkdirSync(path.join(dir, "drafts"));
      const r = await loadProfiles(dir, TODAY);
      expect(r.profiles.map((p) => p.id)).toEqual(["example.com"]);
      expect(r.problems).toEqual(
        ["drafts", "notes.md", "stripe.com.yml"].map((file) => ({
          file,
          path: "(file)",
          message: "not a profile: profiles are files named <domain>.yaml (rename it, or move it out of this folder)",
        })),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("returns nothing for a missing directory", async () => {
    const r = await loadProfiles(path.join(DIR, "does-not-exist"), TODAY);
    expect(r).toEqual({ profiles: [], problems: [] });
  });
});
