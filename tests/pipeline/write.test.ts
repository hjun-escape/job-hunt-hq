// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccumulator, isUnprofiledId, type OwnerResult, type YearPlans } from "../../pipeline/aggregate/accumulate";
import { headlineFor, publishedHeadline } from "../../pipeline/aggregate/trend";
import { buildEntityMap, ownerForCa, ownerForUs } from "../../pipeline/match/entities";
import { buildReport } from "../../pipeline/match/report";
import { caEmployerId, normalizeName, usEmployerId } from "../../pipeline/normalize/names";
import { CAVEATS, LICENCES, STATCAN_NOTICE } from "../../pipeline/publish/copy";
import { summaryCsvs, writeSite, type SiteModel, type WrittenFile } from "../../pipeline/publish/write";
import { profileJsonSchema, ProfileSchema, type Profile } from "../../pipeline/schema/profile";
import {
  CompanyFile,
  EmployerFile,
  IndexEntry,
  Meta,
  ReverseFile,
  type CaCell,
  type UsCell,
} from "../../pipeline/schema/published";
import type { SourceFile } from "../../pipeline/sources";
import type { CaApproval, UsFiling } from "../../pipeline/types";

// Lets a test make one chosen rename inside writeSite fail, to exercise the rollback.
const renameHook = vi.hoisted(() => ({ fail: null as null | ((from: string, to: string) => boolean) }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: (from: string, to: string) =>
      renameHook.fail?.(String(from), String(to))
        ? Promise.reject(Object.assign(new Error("injected rename failure"), { code: "EIO" }))
        : actual.rename(from, to),
  };
});

const ROOT = path.join(__dirname, "..", "..");
const SJ = "cbsa:41940";
const SEA = "cbsa:42660";
const NYC = "cbsa:35620";
const TOR = "cma:535";
const VAN = "cma:933";

const plan: YearPlans = {
  lca: { complete: [2024, 2025], partial: { year: 2026, through: 1 } },
  perm: { complete: [2025], partial: { year: 2026, through: 1 } },
  lmia: { complete: [2024, 2025], partial: { year: 2026, through: 2 } },
};

const google: Profile = ProfileSchema.parse({
  id: "google.com",
  name: "Google",
  otherNames: ["Alphabet"],
  countries: ["US", "KR"],
  entities: {
    usFeins: ["123456789", "234567890"],
    caNames: [{ name: "Google Canada Corporation", province: "ON" }],
  },
});
// A profile with no filings at all, hiring in Korea and Canada.
const quiet: Profile = ProfileSchema.parse({ id: "quiet.test", name: "Quiet Co", countries: ["KR", "CA"], entities: {} });

type Employer = { fein: string; name: string; state: string; tradeName?: string };
type UsOpts = {
  program?: "lca" | "perm";
  year?: number;
  month?: number;
  role?: string;
  metro?: string | null;
  region?: string;
  pay?: number;
  newHires?: number;
  changeEmployer?: number;
};

function usFiling(e: Employer, o: UsOpts = {}): UsFiling {
  const program = o.program ?? "lca";
  const f: UsFiling = {
    program,
    year: o.year ?? 2025,
    month: o.month ?? 2,
    status: "certified",
    employer: { fein: e.fein, name: e.name, tradeName: e.tradeName ?? null, state: e.state },
    role: o.role ?? "software-engineer",
    place: { metro: o.metro === undefined ? SJ : o.metro, region: o.region ?? "US-CA" },
    annualPay: o.pay ?? 150000,
  };
  if (program === "lca") {
    f.lca = {
      visaClass: "H-1B",
      workers: 1,
      newHires: o.newHires ?? 1,
      changeEmployer: o.changeEmployer ?? 0,
      continuing: 0,
      level: "II",
    };
  }
  return f;
}

type CaOpts = { year?: number; role?: string; metro?: string | null; region?: string; stream?: string };
function caRow(name: string, province: string, lmias: number, positions: number, o: CaOpts = {}): CaApproval {
  return {
    year: o.year ?? 2025,
    quarter: 1,
    employer: { name, province },
    stream: o.stream ?? "Global Talent Stream",
    role: o.role ?? "software-engineer",
    place: { metro: o.metro === undefined ? TOR : o.metro, region: o.region ?? "CA-ON" },
    lmias,
    positions,
  };
}

const GOOGLE_LLC: Employer = { fein: "123456789", name: "GOOGLE LLC", state: "CA" };
const GOOGLE_CLOUD: Employer = { fein: "234567890", name: "GOOGLE CLOUD LLC", state: "CA" };
const ACME: Employer = { fein: "987654321", name: "ACME ROBOTICS INC", state: "CA", tradeName: "ACME BOTS" };
const SMALL: Employer = { fein: "555000111", name: "SMALL FIRM LLC", state: "NY" };
const ECOLE: Employer = { fein: "300000001", name: "ÉCOLE TECHNIQUE INC", state: "NY" };
const DIGITS: Employer = { fein: "300000002", name: "123 DATA LLC", state: "TX" };
const WIDGETS: Employer = { fein: "300000003", name: 'WIDGETS, "WORLDWIDE" INC', state: "WA" };
const SPONSORS: Employer[] = Array.from({ length: 52 }, (_, i) => ({
  fein: String(400000000 + i),
  name: `SPONSOR ${String(i).padStart(2, "0")} INC`,
  state: "CA",
}));
const sponsorFilings = (i: number) => 3 + (i % 4);

const usId = (e: Employer) => usEmployerId(e.fein, normalizeName(e.name), e.state);
const ACME_ID = usId(ACME);
const SMALL_ID = usId(SMALL);
const ECOLE_ID = usId(ECOLE);
const DIGITS_ID = usId(DIGITS);
const WIDGETS_ID = usId(WIDGETS);
const MAPLE_ID = caEmployerId(normalizeName("MAPLE SOFTWARE LTD"), "BC");
const TINY_ID = caEmployerId(normalizeName("TINY CAFE LTD"), "ON");

const SOURCES: SourceFile[] = [
  {
    source: "lmia",
    year: 2025,
    quarter: 4,
    url: "https://open.canada.ca/data/lmia_2025q4.xlsx",
    path: "/private/cache/lmia_2025q4.xlsx",
    sha256: "cd".repeat(32),
    bytes: 2000,
    fetchedAt: "2026-11-02T00:00:00.000Z",
  },
  {
    source: "lca",
    year: 2025,
    quarter: 1,
    url: "https://www.dol.gov/files/LCA_FY2025_Q1.xlsx",
    path: "/private/cache/LCA_FY2025_Q1.xlsx",
    sha256: "ab".repeat(32),
    bytes: 1000,
    fetchedAt: "2026-11-01T00:00:00.000Z",
  },
];

function buildModel(): SiteModel {
  const profiles = [google, quiet];
  const map = buildEntityMap(profiles);
  const acc = createAccumulator();
  const us = (e: Employer, n: number, o: UsOpts = {}) => {
    for (let i = 0; i < n; i++) {
      const f = usFiling(e, { pay: 120000 + i * 5000, ...o });
      acc.addUs(ownerForUs(f.employer, map), f);
    }
  };
  const ca = (a: CaApproval) => acc.addCa(ownerForCa(a.employer, map), a);

  // Google: two US entities and a Canadian one. 2025 LCA headline: 15 certified filings (R41).
  us(GOOGLE_LLC, 8);
  us(GOOGLE_LLC, 4, { newHires: 0, changeEmployer: 1 });
  us(GOOGLE_CLOUD, 3, { role: "data-engineer", metro: SEA, region: "US-WA" });
  us(GOOGLE_LLC, 5, { year: 2024 });
  us(GOOGLE_LLC, 3, { year: 2026, month: 1 });
  us(GOOGLE_LLC, 4, { program: "perm" });
  ca(caRow("Google Canada Corporation", "ON", 4, 10));

  // ACME: 11 software engineers (one change of employer, so the hire split is withheld) and three single
  // filings in other roles that only survive as an all-roles cell for California.
  us(ACME, 10);
  us(ACME, 1, { newHires: 0, changeEmployer: 1 });
  us(ACME, 1, { role: "designer" });
  us(ACME, 1, { role: "product-manager" });
  us(ACME, 1, { role: "qa-engineer" });
  us(ACME, 3, { year: 2024, role: "nurse" });
  us(ACME, 3, { program: "perm" });

  us(SMALL, 2, { metro: NYC, region: "US-NY" });
  us(ECOLE, 3, { metro: NYC, region: "US-NY" });
  us(DIGITS, 3, { role: "soc-15", metro: null, region: "US-TX" });
  us(WIDGETS, 3, { metro: null, region: "US-WA" });
  SPONSORS.forEach((e, i) => us(e, sponsorFilings(i)));

  ca(caRow("MAPLE SOFTWARE LTD", "BC", 5, 8, { metro: VAN, region: "CA-BC" }));
  ca(caRow("MAPLE SOFTWARE LTD", "BC", 3, 3, { year: 2024, role: "nurse", metro: VAN, region: "CA-BC" }));
  ca(caRow("TINY CAFE LTD", "ON", 2, 2, { stream: "Low Wage" }));

  const { owners, totals } = acc.finish(plan);
  return {
    owners,
    profiles: new Map(profiles.map((p) => [p.id, p])),
    years: plan,
    sources: SOURCES,
    report: buildReport(owners, profiles),
    totals,
    warnings: ["PERM FY2026 Q2 is not posted yet"],
    roleLabels: {
      "software-engineer": "Software engineer",
      "data-engineer": "Data engineer",
      nurse: "Nurse",
      designer: "Designer",
      "product-manager": "Product manager",
    },
    placeLabels: {
      [SJ]: "San Jose-Sunnyvale-Santa Clara, CA",
      [SEA]: "Seattle-Tacoma-Bellevue, WA",
      [NYC]: "New York-Newark-Jersey City, NY-NJ-PA",
      [TOR]: "Toronto",
      [VAN]: "Vancouver",
      "US-CA": "California",
      "US-NY": "New York",
      "US-TX": "Texas",
      "US-FL": "Florida",
      "CA-BC": "British Columbia",
      "CA-ON": "Ontario",
    },
    builtAt: "2026-11-14T12:00:00.000Z",
  };
}

const model = buildModel();
const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "write-test-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Every file under `dir`, as forward-slash paths relative to it, sorted. */
function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(dir, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(path.join(dir, rel)).isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

/** Every file and directory under `dir` (directories end with "/"), sorted. */
function listEntries(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(dir, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(path.join(dir, rel)).isDirectory()) out.push(`${rel}/`, ...listEntries(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}
/** Every file's bytes by path, for byte-for-byte comparison of whole trees. */
const snapshot = (dir: string) => new Map(listFiles(dir).map((f) => [f, readFileSync(path.join(dir, f)).toString("base64")]));

let out = "";
let written: WrittenFile[] = [];
const file = (rel: string) => readFileSync(path.join(out, rel), "utf8");
const readJson = (rel: string) => JSON.parse(file(rel));
const exists = (rel: string) => existsSync(path.join(out, rel));
const shardFor = (id: string) => `data/v1/employers/${id.slice(0, 2)}/${id.slice(3, 6)}.json`;
const allOutputText = () => listFiles(out).map(file).join("\n");
const jsonFiles = () => listFiles(out).filter((f) => f.endsWith(".json"));

beforeAll(async () => {
  out = tempDir();
  written = await writeSite(out, model);
});

const SHARDS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0"];
const allIndex = (): IndexEntry[] => SHARDS.flatMap((s) => readJson(`data/v1/index/${s}.json`));

describe("brief checks", () => {
  it("writes the profiled company, the unprofiled employer and the index entry", () => {
    expect(exists("data/v1/companies/google.com.json")).toBe(true);
    expect(readJson(shardFor(ACME_ID))[ACME_ID].name).toBe("ACME ROBOTICS INC");
    expect(readJson("data/v1/index/G.json")).toContainEqual(expect.objectContaining({ id: "google.com", p: "google.com" }));
  });
  it("never writes an unprofiled employer's FEIN", () => {
    const text = allOutputText();
    expect(text).not.toContain("987654321");
    for (const e of [SMALL, ECOLE, DIGITS, WIDGETS, ...SPONSORS]) expect(text).not.toContain(e.fein);
  });
  it("stores the general caveat in meta.json", () => {
    expect(readJson("data/v1/meta.json").caveats.general).toBe(
      "These figures show past filings, not whether a company will sponsor you.",
    );
  });
  it("leaves an owner with 2 filings out of the summary CSV", () => {
    expect(summaryCsvs(model)["lca-2025.csv"]).not.toContain("SMALL FIRM LLC");
  });
});

describe("decision 1: summary CSVs", () => {
  const csvs = summaryCsvs(model);
  const rows = (name: string) => csvs[name].split("\n").slice(1, -1);
  const row = (name: string, id: string) => rows(name).find((r) => r.startsWith(`${id},`));

  it("has one file per program and planned year, complete and partial", () => {
    expect(Object.keys(csvs).sort()).toEqual([
      "lca-2024.csv",
      "lca-2025.csv",
      "lca-2026.csv",
      "lmia-2024.csv",
      "lmia-2025.csv",
      "lmia-2026.csv",
      "perm-2025.csv",
      "perm-2026.csv",
    ]);
  });
  it("writes the header, LF line endings and a trailing newline, even with no rows", () => {
    for (const text of Object.values(csvs)) {
      expect(text.startsWith("id,name,region,filings,headline\n")).toBe(true);
      expect(text.endsWith("\n")).toBe(true);
      expect(text).not.toContain("\r");
    }
    expect(csvs["perm-2026.csv"]).toBe("id,name,region,filings,headline\n");
    expect(csvs["lmia-2026.csv"]).toBe("id,name,region,filings,headline\n");
  });
  it("lists owners whose block is not tooFew, sorted by id", () => {
    const ids = rows("lca-2025.csv").map((r) => r.split(",")[0]);
    expect(ids).toEqual([...ids].sort());
    const expected = [...model.owners]
      .filter(([, o]) => o.sponsorship.lca?.some((b) => b.year === 2025 && !("tooFew" in b)))
      .map(([id]) => id)
      .sort();
    expect(ids).toEqual(expected);
    expect(ids).not.toContain(SMALL_ID);
    expect(ids).toContain("google.com");
    expect(rows("lmia-2025.csv").map((r) => r.split(",")[0])).toEqual(["google.com", MAPLE_ID].sort());
    expect(csvs["lmia-2025.csv"]).not.toContain(TINY_ID);
  });
  it("uses published filings or LMIAs and the published headline (LCA filings, R41)", () => {
    expect(row("lca-2025.csv", "google.com")).toBe("google.com,Google,US-CA,15,15");
    // ACME's hire split is withheld (one change of employer); its headline is its filings all the same.
    expect(row("lca-2025.csv", ACME_ID)).toBe(`${ACME_ID},ACME ROBOTICS INC,US-CA,14,14`);
    expect(row("perm-2025.csv", ACME_ID)).toBe(`${ACME_ID},ACME ROBOTICS INC,US-CA,3,3`);
    expect(row("lmia-2025.csv", "google.com")).toBe("google.com,Google,US-CA,4,10");
    expect(row("lmia-2025.csv", MAPLE_ID)).toBe(`${MAPLE_ID},MAPLE SOFTWARE LTD,CA-BC,5,8`);
    // Every headline cell equals publishedHeadline, never a value computed from raw parts.
    for (const [name, text] of Object.entries(csvs)) {
      const [program, year] = name.replace(".csv", "").split("-") as ["lca" | "perm" | "lmia", string];
      for (const r of text.split("\n").slice(1, -1)) {
        const id = r.split(",")[0];
        const block = model.owners.get(id)!.sponsorship[program]!.find((b) => b.year === Number(year))!;
        if ("tooFew" in block) throw new Error("tooFew row");
        const h = publishedHeadline(program, block.total as UsCell & CaCell);
        expect(r.endsWith(`,${h}`)).toBe(true);
      }
    }
  });
  it("writes a field that a spreadsheet would run as a formula with a leading apostrophe", () => {
    const names: [string, string][] = [
      ["=HYPERLINK(1)", "'=HYPERLINK(1)"],
      ["+1 LLC", "'+1 LLC"],
      ["-DASH INC", "'-DASH INC"],
      ["@HOME LLC", "'@HOME LLC"],
      ["\tTAB INC", "'\tTAB INC"],
      ["\rCR INC", '"\'\rCR INC"'],
      ["=SUM(A1,B1)", `"'=SUM(A1,B1)"`],
      ["PLAIN-NAME INC", "PLAIN-NAME INC"],
    ];
    for (const [name, field] of names) {
      const m = buildModel();
      m.owners.get(ACME_ID)!.name = name;
      const line = summaryCsvs(m)["lca-2025.csv"].split("\n").find((r) => r.startsWith(`${ACME_ID},`));
      expect(line, JSON.stringify(name)).toBe(`${ACME_ID},${field},US-CA,14,14`);
    }
  });
  it("quotes fields per RFC 4180", () => {
    expect(row("lca-2025.csv", WIDGETS_ID)).toBe(`${WIDGETS_ID},"WIDGETS, ""WORLDWIDE"" INC",US-WA,3,3`);
  });
});

describe("decision 2: index", () => {
  it("gives profiled companies the profile's identity, countries and headline (LCA filings plus LMIA positions)", () => {
    const g = allIndex().find((e) => e.id === "google.com");
    const s = model.owners.get("google.com")!.sponsorship;
    expect(headlineFor(s, "lca", 2025) + headlineFor(s, "lmia", 2025)).toBe(25);
    expect(g).toStrictEqual({ id: "google.com", name: "Google", also: ["Alphabet"], c: ["CA", "US"], h: 25, p: "google.com" });
  });
  it("lists a profile with no data with h 0 and its US/CA countries only", () => {
    expect(readJson("data/v1/index/Q.json")).toStrictEqual([
      { id: "quiet.test", name: "Quiet Co", c: ["CA"], h: 0, p: "quiet.test" },
    ]);
  });
  it("gives unprofiled owners id, name, also only when non-empty, c and h, and no p", () => {
    const entries = allIndex();
    const acme = entries.find((e) => e.id === ACME_ID)!;
    // h counts ACME's 14 certified filings, whether or not its hire split is shown (R41).
    expect(acme).toStrictEqual({ id: ACME_ID, name: "ACME ROBOTICS INC", also: ["ACME BOTS"], c: ["US"], h: 14 });
    expect(entries.find((e) => e.id === SMALL_ID)).toStrictEqual({ id: SMALL_ID, name: "SMALL FIRM LLC", c: ["US"], h: 0 });
    expect(entries.find((e) => e.id === MAPLE_ID)).toStrictEqual({ id: MAPLE_ID, name: "MAPLE SOFTWARE LTD", c: ["CA"], h: 8 });
    // ECOLE has 3 certified filings.
    expect(entries.find((e) => e.id === ECOLE_ID)!.h).toBe(3);
    for (const e of entries) expect(isUnprofiledId(e.id) === (e.p === undefined)).toBe(true);
  });
  it("lists every owner and profile exactly once and validates each entry", () => {
    const entries = allIndex();
    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual([...new Set([...model.owners.keys(), ...model.profiles.keys()])].sort());
    for (const e of entries) expect(IndexEntry.parse(e)).toStrictEqual(e);
  });
  it("shards by the first character of the normalised name, else 0, and writes all 27 shards", () => {
    for (const s of SHARDS) expect(exists(`data/v1/index/${s}.json`)).toBe(true);
    expect(readJson("data/v1/index/E.json").map((e: IndexEntry) => e.id)).toEqual([ECOLE_ID]);
    expect(readJson("data/v1/index/0.json").map((e: IndexEntry) => e.id)).toEqual([DIGITS_ID]);
    for (const s of SHARDS) {
      for (const e of readJson(`data/v1/index/${s}.json`) as IndexEntry[]) {
        const first = normalizeName(e.name)[0] ?? "";
        expect(/^[A-Z]$/.test(first) ? first : "0").toBe(s);
      }
    }
  });
  it("sorts each shard by name, then id", () => {
    for (const s of SHARDS) {
      const entries: IndexEntry[] = readJson(`data/v1/index/${s}.json`);
      const sorted = [...entries].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      expect(entries).toStrictEqual(sorted);
    }
    // 52 sponsors and SMALL FIRM LLC.
    expect(readJson("data/v1/index/S.json")).toHaveLength(53);
  });
  it("writes profiles.json with the profiled entries only, sorted by id", () => {
    const entries: IndexEntry[] = readJson("data/v1/index/profiles.json");
    expect(entries.map((e) => e.id)).toEqual(["google.com", "quiet.test"]);
    expect(entries[0]).toStrictEqual(allIndex().find((e) => e.id === "google.com"));
  });
});

describe("decision 3: employer files", () => {
  const unprofiled = () => [...model.owners.keys()].filter(isUnprofiledId).sort();

  it("writes every unprofiled owner, once, in its country and bucket file, with sorted keys", () => {
    const seen: string[] = [];
    for (const f of listFiles(out).filter((p) => p.startsWith("data/v1/employers/"))) {
      expect(f).toMatch(/^data\/v1\/employers\/(us|ca)\/[0-9a-f]{3}\.json$/);
      const record = readJson(f) as Record<string, EmployerFile>;
      expect(Object.keys(record)).toEqual(Object.keys(record).sort());
      for (const id of Object.keys(record)) {
        expect(shardFor(id)).toBe(f);
        seen.push(id);
      }
    }
    expect(seen.sort()).toEqual(unprofiled());
  });
  it("holds the owner's published data", () => {
    const acme = readJson(shardFor(ACME_ID))[ACME_ID];
    const o = model.owners.get(ACME_ID)!;
    expect(acme).toStrictEqual({
      id: ACME_ID,
      name: o.name,
      also: ["ACME BOTS"],
      countries: ["US"],
      region: "US-CA",
      sponsorship: JSON.parse(JSON.stringify(o.sponsorship)),
    });
    expect(EmployerFile.parse(acme)).toStrictEqual(acme);
    const small = readJson(shardFor(SMALL_ID))[SMALL_ID];
    expect(small.also).toBeUndefined();
    expect(small.sponsorship.lca).toStrictEqual([{ year: 2025, partial: false, tooFew: true }]);
    expect(readJson(shardFor(MAPLE_ID))[MAPLE_ID].countries).toEqual(["CA"]);
  });
});

describe("decision 4: company files", () => {
  it("writes the profile, sorted distinct legal names and the sponsorship", () => {
    const g = readJson("data/v1/companies/google.com.json");
    expect(g.profile).toStrictEqual(google);
    expect(g.legalNames).toEqual(["GOOGLE CLOUD LLC", "GOOGLE LLC", "Google Canada Corporation"]);
    expect(g.sponsorship).toStrictEqual(JSON.parse(JSON.stringify(model.owners.get("google.com")!.sponsorship)));
    expect(CompanyFile.parse(g)).toStrictEqual(g);
    // A profile's own FEINs are public and needed for matching.
    expect(file("data/v1/companies/google.com.json")).toContain("123456789");
  });
  it("writes a profile with no data with no legal names and an empty sponsorship", () => {
    expect(readJson("data/v1/companies/quiet.test.json")).toStrictEqual({
      profile: quiet,
      legalNames: [],
      sponsorship: { trends: {} },
    });
  });
  it("writes one company file per profile and nothing else there", () => {
    expect(listFiles(out).filter((f) => f.startsWith("data/v1/companies/"))).toEqual([
      "data/v1/companies/google.com.json",
      "data/v1/companies/quiet.test.json",
    ]);
  });
});

describe("decision 5: reverse files", () => {
  it("writes one file per role id in a published cell of the latest complete year, never `all`", () => {
    const files = listFiles(out).filter((f) => f.startsWith("data/v1/reverse/"));
    expect(files).toEqual([
      "data/v1/reverse/ca/software-engineer.json",
      "data/v1/reverse/us/data-engineer.json",
      "data/v1/reverse/us/soc-15.json",
      "data/v1/reverse/us/software-engineer.json",
    ]);
    // nurse has cells in 2024 only (both countries); designer and friends only survive inside an `all` cell.
    for (const f of files) expect(ReverseFile.parse(readJson(f))).toStrictEqual(readJson(f));
  });
  it("ranks the top 50 per place by cell filings, then id, with display names", () => {
    const r = readJson("data/v1/reverse/us/software-engineer.json") as ReverseFile;
    expect(r.country).toBe("US");
    expect(r.role).toBe("software-engineer");
    expect(r.year).toBe(2025);
    expect(Object.keys(r.places).sort()).toEqual([NYC, SJ, "US-WA"].sort());
    const expected = [
      { id: "google.com", name: "Google", n: 12 },
      // n is the cell's filings (ACME has 14 in all, 11 of them in this cell), never the owner's headline.
      { id: ACME_ID, name: "ACME ROBOTICS INC", n: 11 },
      ...SPONSORS.map((e, i) => ({ id: usId(e), name: e.name, n: sponsorFilings(i) })),
    ]
      .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, 50);
    expect(r.places[SJ]).toStrictEqual(expected);
    expect(r.places["US-WA"]).toStrictEqual([{ id: WIDGETS_ID, name: 'WIDGETS, "WORLDWIDE" INC', n: 3 }]);
    expect(r.places[NYC]).toStrictEqual([{ id: ECOLE_ID, name: "ÉCOLE TECHNIQUE INC", n: 3 }]);
    expect(readJson("data/v1/reverse/us/data-engineer.json").places).toStrictEqual({
      [SEA]: [{ id: "google.com", name: "Google", n: 3 }],
    });
  });
  it("ranks Canadian places by cell positions for the latest complete LMIA year", () => {
    expect(readJson("data/v1/reverse/ca/software-engineer.json")).toStrictEqual({
      country: "CA",
      role: "software-engineer",
      year: 2025,
      places: {
        [TOR]: [{ id: "google.com", name: "Google", n: 10 }],
        [VAN]: [{ id: MAPLE_ID, name: "MAPLE SOFTWARE LTD", n: 8 }],
      },
    });
  });
});

describe("decision 6: privacy", () => {
  /** Every key and string value in every JSON file. */
  function strings(v: unknown, acc: string[] = []): string[] {
    if (typeof v === "string") acc.push(v);
    else if (Array.isArray(v)) v.forEach((x) => strings(x, acc));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        acc.push(k);
        strings(x, acc);
      }
    }
    return acc;
  }
  it("writes no contact field names, email addresses or postal codes", () => {
    const text = allOutputText();
    expect(text).not.toContain("EMPLOYER_POC");
    expect(text).not.toMatch(/@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
    expect(text).not.toMatch(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/);
    // The profile JSON schema is fixed text whose date pattern holds digit runs such as 13579.
    const data = jsonFiles().filter((f) => f !== "data/v1/schema/profile.json");
    const all = [...data.flatMap((f) => strings(readJson(f))), file("index.html")];
    // A US ZIP or ZIP+4 on its own (metro keys such as cbsa:41940 are CBSA codes, not ZIPs).
    for (const s of all) expect(s).not.toMatch(/(?<![\w:])\d{5}(?:-\d{4})?(?!\w)/);
  });
  it("writes no cache paths from the source list", () => {
    expect(allOutputText()).not.toContain("/private/cache");
  });
});

describe("decision 7: JSON format, file list and determinism", () => {
  const sortedDeep = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sortedDeep)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sortedDeep((v as Record<string, unknown>)[k])]),
          )
        : v;

  it("writes sorted keys at every level, no indentation and one trailing newline", () => {
    for (const f of jsonFiles()) {
      const raw = file(f);
      expect(raw).toBe(`${JSON.stringify(sortedDeep(JSON.parse(raw)))}\n`);
    }
  });
  it("returns every written file once, sorted by path, with its bytes and gzip level 9 bytes", () => {
    expect(written.map((w) => w.path)).toEqual(listFiles(out));
    expect(written.map((w) => w.path)).toEqual([...written.map((w) => w.path)].sort());
    for (const w of written) {
      expect(w.path).not.toContain("\\");
      expect(path.isAbsolute(w.path)).toBe(false);
      const buf = readFileSync(path.join(out, w.path));
      expect(w.bytes).toBe(buf.length);
      expect(w.gzipBytes).toBe(gzipSync(buf, { level: 9 }).length);
    }
  });
  it("produces byte-identical trees from the same model", async () => {
    const a = tempDir();
    const b = tempDir();
    const first = await writeSite(a, model);
    const second = await writeSite(b, buildModel());
    expect(second).toStrictEqual(first);
    expect(listFiles(b)).toEqual(listFiles(a));
    for (const f of listFiles(a)) {
      expect(readFileSync(path.join(b, f)).equals(readFileSync(path.join(a, f)))).toBe(true);
    }
  });
  it("replaces a previous data/v1 tree and leaves other files alone", async () => {
    const d = tempDir();
    mkdirSync(path.join(d, "data", "v1", "employers", "us"), { recursive: true });
    writeFileSync(path.join(d, "data", "v1", "employers", "us", "zzz.json"), "{}");
    writeFileSync(path.join(d, "keep.txt"), "mine");
    const files = await writeSite(d, model);
    expect(existsSync(path.join(d, "data", "v1", "employers", "us", "zzz.json"))).toBe(false);
    expect(readFileSync(path.join(d, "keep.txt"), "utf8")).toBe("mine");
    expect(files.map((w) => w.path)).not.toContain("keep.txt");
  });
  it("removes stale files on a successful second run and leaves no staging directory", async () => {
    const d = tempDir();
    await writeSite(d, model);
    writeFileSync(path.join(d, "data", "v1", "employers", "us", "zzz.json"), "{}");
    writeFileSync(path.join(d, "data", "v1", "stale.json"), "{}");
    const files = await writeSite(d, model);
    expect(listFiles(d)).toEqual(files.map((w) => w.path));
    expect(readdirSync(d).sort()).toEqual(["data", "index.html"]);
    expect(readdirSync(path.join(d, "data"))).toEqual(["v1"]);
    expect(snapshot(d)).toEqual(snapshot(out));
  });
  it("puts back the previous tree or page left in a killed run's staging directory", async () => {
    const acme2025 = (m: SiteModel) => {
      const b = m.owners.get(ACME_ID)!.sponsorship.lca!.find((x) => x.year === 2025)!;
      if ("tooFew" in b) throw new Error("unexpected tooFew");
      return b;
    };
    // Even when the next build fails, whether after the checks or at the privacy gate itself, the old site
    // comes back and the leftover is gone.
    const failures: [string, (m: SiteModel) => void, RegExp][] = [
      ["a role id that cannot be a file name", (m) => (acme2025(m).cells.find((c) => c.role === "software-engineer")!.role = "Bad Role"), /Bad Role/],
      ["the privacy gate", (m) => Object.assign(acme2025(m).cells[0], { denied: 5 }), new RegExp(`${ACME_ID} lca 2025: a cell carries denied`)],
      ["the text scan", (m) => (m.owners.get(ACME_ID)!.name = "ACME ROBOTICS INC m5v 1j2"), /contains what looks like a postal code/],
    ];
    // A run killed between moving the old page (or tree) away and moving the new one in.
    for (const kept of ["previous-index.html", "previous-v1"]) {
      for (const [what, breakIt, message] of failures) {
        const label = `${kept}, then ${what}`;
        const d = tempDir();
        await writeSite(d, model);
        writeFileSync(path.join(d, "index.html"), "<p>old page</p>");
        const files = snapshot(d);
        const entries = listEntries(d);
        const dead = path.join(d, ".site-staging-dead12");
        mkdirSync(path.join(dead, "data", "v1"), { recursive: true });
        writeFileSync(path.join(dead, "data", "v1", "partial.json"), "{}");
        const live = kept === "previous-v1" ? path.join(d, "data", "v1") : path.join(d, "index.html");
        renameSync(live, path.join(dead, kept));
        const bad = buildModel();
        breakIt(bad);
        await expect(writeSite(d, bad), label).rejects.toThrow(message);
        expect(listEntries(d), label).toEqual(entries);
        expect(snapshot(d), label).toEqual(files);
      }
    }
  });
  it("starts from a missing output directory", async () => {
    const d = path.join(tempDir(), "fresh", "site");
    const files = await writeSite(d, model);
    expect(listFiles(d)).toEqual(files.map((w) => w.path));
  });
  it("restores both data/v1 and index.html when the swap fails part way", async () => {
    const points: [string, (d: string, to: string) => boolean][] = [
      ["moving the old page away", (_d, to) => to.endsWith(`${path.sep}previous-index.html`)],
      ["moving the new page in", (d, to) => to === path.join(d, "index.html")],
      ["moving the old tree away", (_d, to) => to.endsWith(`${path.sep}previous-v1`)],
      ["moving the new tree in", (d, to) => to === path.join(d, "data", "v1")],
    ];
    for (const [what, fails] of points) {
      const d = tempDir();
      await writeSite(d, model);
      writeFileSync(path.join(d, "index.html"), "<p>old page</p>");
      const files = snapshot(d);
      const entries = listEntries(d);
      let fired = false;
      renameHook.fail = (_from, to) => !fired && fails(d, to) && (fired = true);
      try {
        await expect(writeSite(d, model), what).rejects.toThrow("injected rename failure");
      } finally {
        renameHook.fail = null;
      }
      expect(fired, what).toBe(true);
      expect(listEntries(d), what).toEqual(entries);
      expect(snapshot(d), what).toEqual(files);
    }
  });
  it("clears a staging directory left by a killed run", async () => {
    const d = tempDir();
    mkdirSync(path.join(d, ".site-staging-dead12", "data", "v1"), { recursive: true });
    writeFileSync(path.join(d, ".site-staging-dead12", "data", "v1", "meta.json"), "{}");
    await writeSite(d, model);
    expect(readdirSync(d).sort()).toEqual(["data", "index.html"]);
  });
  it("leaves the previous tree byte-identical, with no staging directory, when a later step throws", async () => {
    const breaks: [string, (m: SiteModel) => void, RegExp][] = [
      [
        "a role id that cannot be a file name (reverse step)",
        (m) => {
          const b = m.owners.get(ACME_ID)!.sponsorship.lca!.find((x) => x.year === 2025)!;
          if ("tooFew" in b) throw new Error("unexpected tooFew");
          b.cells.find((c) => c.role === "software-engineer")!.role = "Bad Role";
        },
        /Bad Role/,
      ],
      [
        "an invalid country (index step)",
        (m) => {
          m.owners.get(ACME_ID)!.countries = ["XX" as "US"];
        },
        /XX|Invalid/,
      ],
    ];
    for (const [what, breakIt, message] of breaks) {
      const d = tempDir();
      await writeSite(d, model);
      writeFileSync(path.join(d, "keep.txt"), "mine");
      const files = snapshot(d);
      const entries = listEntries(d);
      const bad = buildModel();
      breakIt(bad);
      await expect(writeSite(d, bad), what).rejects.toThrow(message);
      expect(listEntries(d), what).toEqual(entries);
      expect(snapshot(d), what).toEqual(files);
    }
  });
  it("writes the report and the profile JSON schema", () => {
    expect(readJson("data/v1/report.json")).toStrictEqual(JSON.parse(JSON.stringify(model.report)));
    expect(readJson("data/v1/schema/profile.json")).toStrictEqual(JSON.parse(JSON.stringify(profileJsonSchema())));
  });
  it("validates what it writes and keeps only schema fields", async () => {
    const extra = buildModel();
    const g = extra.owners.get("google.com")!;
    const block = g.sponsorship.lca!.find((b) => b.year === 2025)!;
    if ("tooFew" in block) throw new Error("unexpected tooFew");
    (block.total as UsCell & { raw?: number[] }).raw = [11, 4];
    const d = tempDir();
    await writeSite(d, extra);
    expect(readFileSync(path.join(d, "data", "v1", "companies", "google.com.json"), "utf8")).not.toContain('"raw"');

    const bad = buildModel();
    const broken: OwnerResult = {
      name: "BROKEN LLC",
      also: [],
      countries: ["US"],
      region: null,
      sponsorship: {
        lca: [{ year: 2025, partial: false, total: { role: "all", place: "all", filings: -1 }, cells: [] }],
        trends: {},
      },
    };
    bad.owners.set("us-0123456789", broken);
    await expect(writeSite(tempDir(), bad)).rejects.toThrow();
  });
  it("refuses blocks that break the published privacy rules, before touching the output", async () => {
    const lcaBlock = (o: OwnerResult) => {
      const b = o.sponsorship.lca!.find((x) => x.year === 2025)!;
      if ("tooFew" in b) throw new Error("unexpected tooFew");
      return b;
    };
    const breaks: [string, (o: OwnerResult) => void][] = [
      ["a sub-count on a cell", (o) => Object.assign(lcaBlock(o).cells[0], { denied: 5 })],
      ["a total sub-count of 1 or 2", (o) => Object.assign(lcaBlock(o).total, { withdrawn: 2 })],
      ["a wage level of 1 or 2", (o) => Object.assign(lcaBlock(o).total, { levels: { I: 1, II: 13 } })],
      ["a month of 1 or 2", (o) => Object.assign(lcaBlock(o), { months: [0, 13, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] })],
      ["pay from under 10 salaries", (o) => Object.assign(lcaBlock(o).cells[0], { pay: { n: 9, p25: 1, median: 2, p75: 3 } })],
      ["a cell under 3 filings", (o) => Object.assign(lcaBlock(o).cells[0], { filings: 2 })],
      // ACME files 14 certified LCAs, all at level II: a shown group short of 14 means a hidden member.
      ["wage levels short of filings", (o) => Object.assign(lcaBlock(o).total, { levels: { II: 11 } })],
      ["wage levels over filings", (o) => Object.assign(lcaBlock(o).total, { levels: { I: 3, II: 14 } })],
    ];
    for (const [what, breakIt] of breaks) {
      const bad = buildModel();
      breakIt(bad.owners.get(ACME_ID)!);
      const d = tempDir();
      writeFileSync(path.join(d, "keep.txt"), "mine");
      await expect(writeSite(d, bad), what).rejects.toThrow(ACME_ID);
      expect(listFiles(d), what).toEqual(["keep.txt"]);
      expect(() => summaryCsvs(bad), what).toThrow(ACME_ID);
    }
    const streams = buildModel();
    const maple = streams.owners.get(MAPLE_ID)!.sponsorship.lmia!.find((x) => x.year === 2025)!;
    if ("tooFew" in maple) throw new Error("unexpected tooFew");
    maple.total.streams = { "Global Talent Stream": 6, "High Wage": 2 };
    await expect(writeSite(tempDir(), streams)).rejects.toThrow(MAPLE_ID);
    // MAPLE has 8 positions in 2025: a shown stream group of 5 hides 3 positions.
    maple.total.streams = { "Global Talent Stream": 5 };
    await expect(writeSite(tempDir(), streams)).rejects.toThrow(/MAPLE|ca-.*streams/);
    expect(() => summaryCsvs(streams)).toThrow(MAPLE_ID);
  });
  it("accepts a wholly withheld group and groups that add up exactly", async () => {
    const ok = buildModel();
    const b = ok.owners.get(ACME_ID)!.sponsorship.lca!.find((x) => x.year === 2025)!;
    if ("tooFew" in b) throw new Error("unexpected tooFew");
    b.total.levels = {};
    const maple = ok.owners.get(MAPLE_ID)!.sponsorship.lmia!.find((x) => x.year === 2025)!;
    if ("tooFew" in maple) throw new Error("unexpected tooFew");
    maple.total.streams = { "Global Talent Stream": 5, "High Wage": 3 };
    await expect(writeSite(tempDir(), ok)).resolves.toBeInstanceOf(Array);
    const g = readJson("data/v1/companies/google.com.json").sponsorship.lca.find((x: { year: number }) => x.year === 2025);
    expect(g.total.levels).toStrictEqual({ II: 15 });
    expect(g.total.filings).toBe(15);
  });
  it("refuses an owner with a profile-style id and no profile", async () => {
    const bad = buildModel();
    bad.owners.set("unknown.com", model.owners.get(ACME_ID)!);
    await expect(writeSite(tempDir(), bad)).rejects.toThrow(/unknown\.com/);
  });
});

describe("fix round 1: text scan before writing", () => {
  const SECRET = "jane.doe@acme-robotics.com";
  const cases: [string, (m: SiteModel) => void, RegExp][] = [
    ["an email in an owner name", (m) => (m.owners.get(ACME_ID)!.name = `ACME ROBOTICS INC ${SECRET}`), new RegExp(`owner ${ACME_ID} contains an email address`)],
    ["a postal code in also", (m) => m.owners.get(MAPLE_ID)!.also.push("MAPLE SOFTWARE LTD V6B 1A1"), /contains what looks like a postal code/],
    ["a postal code without a space", (m) => m.owners.get(MAPLE_ID)!.also.push("MAPLE M5V1J2"), /contains what looks like a postal code/],
    ["a street address in also", (m) => m.owners.get(ACME_ID)!.also.push("123 Main St Suite 4"), new RegExp(`owner ${ACME_ID} has a street address in also`)],
    ["a placeholder in also", (m) => m.owners.get(ACME_ID)!.also.push("N/A"), new RegExp(`owner ${ACME_ID} has a placeholder in also`)],
    ["a dash run in a profiled owner's also", (m) => m.owners.get("google.com")!.also.push("--"), /owner google\.com has a placeholder in also/],
    ["a lower-case postal code in an owner name", (m) => (m.owners.get(MAPLE_ID)!.name = "MAPLE SOFTWARE LTD m5v 1j2"), new RegExp(`owner ${MAPLE_ID} contains what looks like a postal code`)],
    [
      "a user name and password in a profile source URL",
      (m) =>
        m.profiles.set("quiet.test", {
          ...quiet,
          mission: {
            value: { en: "We make tools." },
            kind: "reported",
            sources: [{ url: "https://jane:pw@example.com/x", seen: "2026-01-01" }],
            checked: "2026-01-01",
          },
        }),
      /profile quiet\.test \(mission\.sources\[0\]\.url\) contains a user name or password in a URL/,
    ],
    [
      "an email in a profile link's query",
      (m) => m.profiles.set("quiet.test", { ...quiet, links: [{ label: "Apply", url: `https://example.com/?contact=${SECRET}` }] }),
      /profile quiet\.test \(links\[0\]\.url\) contains an email address/,
    ],
    [
      "an email-shaped image path in a profile link",
      (m) => m.profiles.set("quiet.test", { ...quiet, links: [{ label: "Logo", url: "https://example.com/logo@2x.png" }] }),
      /profile quiet\.test \(links\[0\]\.url\) contains an email address/,
    ],
    [
      "a postal code in profile text",
      (m) =>
        m.profiles.set("quiet.test", {
          ...quiet,
          hiringProcess: {
            value: { en: "Interviews at our office, M5V 1J2." },
            kind: "official",
            sources: [{ url: "https://quiet.test/jobs", seen: "2026-01-01" }],
            checked: "2026-01-01",
          },
        }),
      /profile quiet\.test \(hiringProcess\.value\.en\) contains what looks like a postal code/,
    ],
    [
      "an email deep in profile text",
      (m) =>
        m.profiles.set("quiet.test", {
          ...quiet,
          mission: {
            value: { en: `Write to ${SECRET} to apply.` },
            kind: "official",
            sources: [{ url: "https://quiet.test/about", seen: "2026-01-01" }],
            checked: "2026-01-01",
          },
        }),
      /profile quiet\.test \(mission\.value\.en\) contains an email address/,
    ],
    ["a contact column name in profile other names", (m) => m.profiles.set("quiet.test", { ...quiet, otherNames: ["EMPLOYER_POC_EMAIL"] }), /profile quiet\.test \(otherNames\[0\]\) contains a contact or preparer column name/],
    ...["EMPLOYER_POC", "EMP_POC", "PREPARER_", "DECL_PREP_", "ATTY_AG_", "LAWFIRM_"].map(
      (field): [string, (m: SiteModel) => void, RegExp] => [
        `${field} in a warning`,
        (m) => m.warnings.push(`unexpected column ${field}NAME`),
        /warning 2 contains a contact or preparer column name/,
      ],
    ),
  ];
  it("refuses personal text before touching the output, without echoing it", async () => {
    for (const [what, breakIt, message] of cases) {
      const bad = buildModel();
      breakIt(bad);
      const d = tempDir();
      writeFileSync(path.join(d, "keep.txt"), "mine");
      const err = await writeSite(d, bad).then(
        () => null,
        (e: Error) => e,
      );
      expect(err, what).toBeInstanceOf(Error);
      expect(err!.message, what).toMatch(message);
      expect(err!.message, what).not.toContain(SECRET);
      expect(listEntries(d), what).toEqual(["keep.txt"]);
    }
  });
  it("scans every summary CSV", () => {
    const bad = buildModel();
    bad.owners.get(ACME_ID)!.name = `ACME ROBOTICS INC ${SECRET}`;
    expect(() => summaryCsvs(bad)).toThrow(/lca-2024\.csv contains an email address/);
    const postal = buildModel();
    postal.owners.get(MAPLE_ID)!.region = "CA-BC V6B 1A1";
    expect(() => summaryCsvs(postal)).toThrow(/lmia-2024\.csv contains what looks like a postal code/);
  });
  it("accepts the clean model", () => {
    expect(() => summaryCsvs(model)).not.toThrow();
  });
  it("lets short links whose path looks like a postal code through, in either case", async () => {
    for (const url of ["https://bit.ly/a1b2c3", "https://bit.ly/A1B2C3"]) {
      const ok = buildModel();
      ok.profiles.set("quiet.test", {
        ...quiet,
        mission: {
          value: { en: "We make tools." },
          kind: "reported",
          sources: [{ url, seen: "2026-01-01" }],
          checked: "2026-01-01",
        },
        links: [{ label: "Blind", url }],
        otherNames: [url],
      });
      await expect(writeSite(tempDir(), ok), url).resolves.toBeInstanceOf(Array);
      expect(() => summaryCsvs(ok), url).not.toThrow();
    }
  });
});

describe("decision 8: meta.json", () => {
  it("holds the build, plan, sources without paths, totals, warnings, caveats and licences", () => {
    const meta = readJson("data/v1/meta.json");
    expect(Meta.parse(meta)).toStrictEqual(meta);
    expect(meta.schemaVersion).toBe(1);
    expect(meta.builtAt).toBe("2026-11-14T12:00:00.000Z");
    expect(meta.years).toStrictEqual(plan);
    expect(meta.totals).toStrictEqual(model.totals);
    expect(meta.warnings).toEqual(["PERM FY2026 Q2 is not posted yet"]);
    expect(meta.sources).toStrictEqual(
      [SOURCES[1], SOURCES[0]].map(({ path: _path, ...rest }) => rest),
    );
    expect(meta.caveats).toStrictEqual({
      lca: "A Labor Condition Application (LCA) is a step before an H-1B, H-1B1 or E-3 visa petition, not an approved visa. Counts are certified filings, renewals included. One LCA can cover many positions, so worker counts can far exceed filings.",
      perm: "A certified PERM labour certification is one step toward a green card, not the green card itself.",
      lmia: "A positive LMIA is not a work permit. The list counts positions later cancelled by employers and leaves out businesses whose names include a person's name.",
      general: "These figures show past filings, not whether a company will sponsor you.",
    });
    expect(meta.licences).toStrictEqual({
      code: "MIT",
      profiles: "CC BY 4.0",
      us: "US government work, public domain",
      ca: "Contains information licensed under the Open Government Licence – Canada.",
      statcan:
        "Adapted from Statistics Canada, Geographic Attribute File (catalogue no. 92-151-X), 2021 Census. This does not constitute an endorsement by Statistics Canada of this product.",
    });
    expect(meta.licences.statcan).toBe(STATCAN_NOTICE);
  });
  it("labels every role id and place key that appears, and nothing else", () => {
    const meta = readJson("data/v1/meta.json");
    // designer, product-manager and qa-engineer only appear inside an all-roles cell; soc-15 has no label.
    expect(meta.roles).toStrictEqual({
      "data-engineer": "Data engineer",
      nurse: "Nurse",
      "soc-15": "soc-15",
      "software-engineer": "Software engineer",
    });
    // Cell places plus unprofiled owners' regions; US-WA has no label; US-FL never appears.
    expect(meta.places).toStrictEqual({
      [NYC]: "New York-Newark-Jersey City, NY-NJ-PA",
      [SJ]: "San Jose-Sunnyvale-Santa Clara, CA",
      [SEA]: "Seattle-Tacoma-Bellevue, WA",
      [TOR]: "Toronto",
      [VAN]: "Vancouver",
      "CA-BC": "British Columbia",
      "CA-ON": "Ontario",
      "US-CA": "California",
      "US-NY": "New York",
      "US-TX": "Texas",
      "US-WA": "US-WA",
    });
  });
});

describe("decision 9: copy, landing page and docs", () => {
  it("keeps the exact copy in copy.ts", () => {
    expect(CAVEATS.general).toBe("These figures show past filings, not whether a company will sponsor you.");
    expect(LICENCES.ca).toBe("Contains information licensed under the Open Government Licence – Canada.");
  });
  it("copies site-static/index.html to the output root unchanged", () => {
    const page = readFileSync(path.join(ROOT, "site-static", "index.html"));
    expect(readFileSync(path.join(out, "index.html")).equals(page)).toBe(true);
  });
  it("makes the landing page standalone, with the links and licence lines", () => {
    const page = readFileSync(path.join(ROOT, "site-static", "index.html"), "utf8");
    expect(page).toMatch(/<meta charset="utf-8">/i);
    expect(page).toContain('name="viewport"');
    expect(page).not.toMatch(/<script|<link|@import|https?:\/\/fonts\./i);
    expect(page).toContain('href="data/v1/meta.json"');
    expect(page).toContain("https://github.com/hjun-escape/job-hunt-hq#data");
    expect(page).toContain("https://github.com/hjun-escape/job-hunt-hq/issues/new?template=request-company.yml");
    expect(page).toContain(LICENCES.ca);
    expect(page).toContain(LICENCES.us);
    expect(page).toContain(LICENCES.profiles);
  });
  it("quotes the caveats and licence lines in the README exactly as copy.ts holds them", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    for (const text of [...Object.values(CAVEATS), LICENCES.profiles, LICENCES.us, LICENCES.ca]) {
      expect(readme).toContain(text);
    }
    expect(readme).toContain("https://hjun-escape.github.io/job-hunt-hq/data/v1/");
    expect(readme).toContain("https://github.com/hjun-escape/job-hunt-hq/issues/new?template=request-company.yml");
    expect(readme).toContain("(CONTRIBUTING.md)");
    expect(readme).toContain("(DATA-LICENSE.md)");
  });
  it("carries the Statistics Canada notice verbatim in the README, DATA-LICENSE.md and the page", () => {
    for (const f of ["README.md", "DATA-LICENSE.md", "site-static/index.html"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).toContain(STATCAN_NOTICE);
    }
    const licence = readFileSync(path.join(ROOT, "DATA-LICENSE.md"), "utf8");
    expect(licence).toContain("Statistics Canada Open Licence");
    expect(licence).toContain("data/reference/ca-csd-cma.csv");
  });
  it("explains the README points raised in review", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("pipeline/normalize/names.ts");
    expect(readme).toMatch(/`all` has no label in `meta\.json`/);
    expect(readme).toMatch(/short hash of the employer's FEIN/);
    expect(readme).not.toContain("computed from public data");
    // R41 and the final review: what the LCA headline counts, and the pay and worker rules.
    expect(readme).toMatch(/LCA trend and every LCA ranking .* use certified filings/);
    expect(readme).toMatch(/One LCA can cover many positions .*worker counts can far exceed filings/);
    expect(readme).toMatch(/under 15,000 or over 1,500,000, or an hourly rate over 1,000/);
    expect(readme).toMatch(/`TOTAL_WORKER_POSITIONS` of 0 or blank counts as 1/);
  });
  it("keeps em dashes out of the docs and the page", () => {
    const EM_DASH = String.fromCodePoint(0x2014);
    for (const f of ["README.md", "DATA-LICENSE.md", "site-static/index.html"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8")).not.toContain(EM_DASH);
    }
  });
});
