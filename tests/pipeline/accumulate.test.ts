// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createAccumulator,
  isUnprofiledId,
  PERSON_LIKE_MIN_FILINGS,
  type YearPlans,
} from "../../pipeline/aggregate/accumulate";
import { headlineOf, trend } from "../../pipeline/aggregate/trend";
import { Sponsorship, Totals, YearBlockCa, YearBlockUs, type UsCell } from "../../pipeline/schema/published";
import { WAGE_LEVELS, type CaApproval, type CaseStatus, type UsFiling, type WageLevel } from "../../pipeline/types";

const plan: YearPlans = {
  lca: { complete: [2023, 2024, 2025], partial: { year: 2026, through: 1 } },
  perm: { complete: [2023, 2024, 2025], partial: { year: 2026, through: 1 } },
  lmia: { complete: [2023, 2024, 2025], partial: { year: 2026, through: 2 } },
};

type UsOpts = {
  program?: "lca" | "perm";
  year?: number;
  month?: number;
  status?: CaseStatus;
  name?: string;
  tradeName?: string | null;
  state?: string | null;
  personLike?: boolean;
  role?: string;
  metro?: string | null;
  region?: string;
  pay?: number | null;
  workers?: number;
  newHires?: number;
  changeEmployer?: number;
  continuing?: number;
  level?: WageLevel;
};

const FEIN = "123456789";

function us(o: UsOpts = {}): UsFiling {
  const program = o.program ?? "lca";
  const employer: UsFiling["employer"] = {
    fein: FEIN,
    name: o.name ?? "ACME ROBOTICS INC",
    tradeName: o.tradeName ?? null,
    state: o.state === undefined ? "CA" : o.state,
  };
  if (o.personLike) employer.personLike = true;
  const f: UsFiling = {
    program,
    year: o.year ?? 2025,
    month: o.month ?? 1,
    status: o.status ?? "certified",
    employer,
    role: o.role ?? "software-engineer",
    place: { metro: o.metro === undefined ? "cbsa:41940" : o.metro, region: o.region ?? "US-CA" },
    annualPay: o.pay === undefined ? 150000 : o.pay,
  };
  if (program === "lca") {
    f.lca = {
      visaClass: "H-1B",
      workers: o.workers ?? 1,
      newHires: o.newHires ?? 1,
      changeEmployer: o.changeEmployer ?? 0,
      continuing: o.continuing ?? 0,
      level: o.level ?? "II",
    };
  }
  return f;
}

type CaOpts = {
  year?: number;
  quarter?: 1 | 2 | 3 | 4;
  name?: string;
  province?: string;
  stream?: string;
  role?: string;
  metro?: string | null;
  region?: string;
  lmias?: number;
  positions?: number;
};

function ca(o: CaOpts = {}): CaApproval {
  return {
    year: o.year ?? 2025,
    quarter: o.quarter ?? 1,
    employer: { name: o.name ?? "MAPLE SOFTWARE INC", province: o.province ?? "ON" },
    stream: o.stream ?? "High Wage",
    role: o.role ?? "software-engineer",
    place: { metro: o.metro === undefined ? "cma:535" : o.metro, region: o.region ?? "CA-ON" },
    lmias: o.lmias ?? 1,
    positions: o.positions ?? 1,
  };
}

const times = (n: number, f: (i: number) => void) => {
  for (let i = 0; i < n; i++) f(i);
};
const zeros = (n: number) => Array<number>(n).fill(0);

describe("year blocks", () => {
  it("makes an owner-year under 3 certified filings tooFew, even with denied and withdrawn filings", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("us-aaa", us()));
    times(4, () => acc.addUs("us-aaa", us({ status: "denied" })));
    acc.addUs("us-aaa", us({ status: "withdrawn" }));
    expect(acc.finish(plan).owners.get("us-aaa")!.sponsorship.lca).toStrictEqual([
      { year: 2025, partial: false, tooFew: true },
    ]);
  });

  it("gives a block for an owner-year with only denied filings, as tooFew", () => {
    const acc = createAccumulator();
    times(5, () => acc.addUs("us-aaa", us({ status: "denied" })));
    expect(acc.finish(plan).owners.get("us-aaa")!.sponsorship.lca).toStrictEqual([
      { year: 2025, partial: false, tooFew: true },
    ]);
  });

  it("puts `through` on partial blocks: fiscal months for the US, quarters for Canada", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("us-aaa", us({ year: 2026 })));
    acc.addCa("ca-bbb", ca({ year: 2026, lmias: 2, positions: 40 }));
    const { owners } = acc.finish(plan);
    expect(owners.get("us-aaa")!.sponsorship.lca).toStrictEqual([{ year: 2026, partial: true, through: 3, tooFew: true }]);
    expect(owners.get("ca-bbb")!.sponsorship.lmia).toStrictEqual([{ year: 2026, partial: true, through: 2, tooFew: true }]);

    const big = createAccumulator();
    times(3, (i) => big.addUs("us-aaa", us({ year: 2026, month: i + 1 })));
    times(3, () => big.addCa("ca-bbb", ca({ year: 2026, quarter: 2 })));
    const r = big.finish(plan).owners;
    expect(r.get("us-aaa")!.sponsorship.lca![0]).toMatchObject({ year: 2026, partial: true, through: 3 });
    expect(r.get("ca-bbb")!.sponsorship.lmia![0]).toMatchObject({ year: 2026, partial: true, through: 2, months: [0, 3, 0, 0] });
  });

  it("counts LCA filings exactly: sums and levels from certified only, headline new hires plus changes of employer", () => {
    const acc = createAccumulator();
    acc.addUs("us-aaa", us({ month: 1, pay: 150000, newHires: 1, changeEmployer: 0, continuing: 0, level: "II" }));
    acc.addUs("us-aaa", us({ month: 2, pay: 160000, newHires: 0, changeEmployer: 1, continuing: 0, level: "II" }));
    acc.addUs("us-aaa", us({ month: 2, pay: 170000, newHires: 0, changeEmployer: 0, continuing: 1, level: "III" }));
    // Withdrawn: counts as withdrawn only, none of its workers, pay or level.
    acc.addUs("us-aaa", us({ month: 3, status: "withdrawn", workers: 5, newHires: 5, pay: 900000, level: "IV" }));
    // Denied in a cell too small to publish: appears only in the total.
    acc.addUs("us-aaa", us({ month: 4, status: "denied", role: "data-engineer", metro: "cbsa:31080", newHires: 2, level: "I" }));
    const blocks = acc.finish(plan).owners.get("us-aaa")!.sponsorship.lca!;
    const sums = {
      filings: 3,
      workers: 3,
      newHires: 1,
      changeEmployer: 1,
      continuing: 1,
      levels: { II: 2, III: 1 },
      pay: { n: 3, p25: 155000, median: 160000, p75: 165000 },
    };
    expect(blocks).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        total: { role: "all", place: "all", ...sums, denied: 1, withdrawn: 1 },
        cells: [{ role: "software-engineer", place: "cbsa:41940", ...sums, denied: 0, withdrawn: 1 }],
      },
    ]);
    const b = blocks[0] as { total: UsCell };
    expect(headlineOf("lca", b.total)).toBe(2);
  });

  it("gives PERM cells no LCA keys, and denied filings ride along in a published cell", () => {
    const acc = createAccumulator();
    [100000, 110000, 120000].forEach((pay) => acc.addUs("us-aaa", us({ program: "perm", pay })));
    acc.addUs("us-aaa", us({ program: "perm", status: "denied", month: 5, pay: 990000 }));
    const pay = { n: 3, p25: 105000, median: 110000, p75: 115000 };
    expect(acc.finish(plan).owners.get("us-aaa")!.sponsorship.perm).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [3, ...zeros(11)],
        total: { role: "all", place: "all", filings: 3, denied: 1, withdrawn: 0, pay },
        cells: [{ role: "software-engineer", place: "cbsa:41940", filings: 3, denied: 1, withdrawn: 0, pay }],
      },
    ]);
  });

  it("takes pay only from certified filings with a figure, and omits pay below 3 values", () => {
    const acc = createAccumulator();
    acc.addUs("us-aaa", us({ pay: 100000 }));
    acc.addUs("us-aaa", us({ pay: 200000 }));
    acc.addUs("us-aaa", us({ pay: null }));
    acc.addUs("us-aaa", us({ status: "denied", pay: 300000 }));
    acc.addUs("us-aaa", us({ status: "withdrawn", pay: 400000 }));
    const b = acc.finish(plan).owners.get("us-aaa")!.sponsorship.lca![0] as { total: UsCell; cells: UsCell[] };
    expect(b.total.filings).toBe(3);
    expect("pay" in b.total).toBe(false);
    expect("pay" in b.cells[0]).toBe(false);
  });

  it("rolls small cells up, publishes a region place for a null metro, and sorts cells by role then place", () => {
    const acc = createAccumulator();
    const add = (n: number, role: string, metro: string | null, region = "US-CA") =>
      times(n, () => acc.addUs("us-aaa", us({ role, metro, region })));
    add(3, "software-engineer", "cbsa:41940");
    add(1, "software-engineer", "cbsa:31080");
    add(2, "software-engineer", null);
    add(1, "data-engineer", "cbsa:41940");
    add(2, "data-scientist", "cbsa:41940");
    add(1, "product-manager", null, "US-WA");
    add(2, "designer", "cbsa:35620", "US-NY");
    add(1, "designer", "cbsa:35620", "US-NJ");
    const b = acc.finish(plan).owners.get("us-aaa")!.sponsorship.lca![0] as { total: UsCell; cells: UsCell[] };
    expect(b.cells.map((c) => [c.role, c.place, c.filings])).toEqual([
      ["all", "US-CA", 3],
      ["designer", "cbsa:35620", 3],
      ["software-engineer", "US-CA", 3],
      ["software-engineer", "cbsa:41940", 3],
    ]);
    // The product manager filing is below the minimum at every level: it is only in the total.
    expect(b.total.filings).toBe(13);
  });

  it("builds Canadian blocks with positions per quarter and positions per verbatim stream", () => {
    const acc = createAccumulator();
    acc.addCa("ca-bbb", ca({ quarter: 1, stream: "High Wage", lmias: 2, positions: 5 }));
    acc.addCa("ca-bbb", ca({ quarter: 3, stream: "Global Talent Stream", lmias: 1, positions: 2 }));
    acc.addCa("ca-bbb", ca({ quarter: 3, stream: "Permanent Resident Only", role: "data-engineer", lmias: 1, positions: 1 }));
    expect(acc.finish(plan).owners.get("ca-bbb")!.sponsorship.lmia).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [5, 0, 3, 0],
        total: {
          role: "all",
          place: "all",
          lmias: 4,
          positions: 8,
          streams: { "Global Talent Stream": 2, "High Wage": 5, "Permanent Resident Only": 1 },
        },
        cells: [
          {
            role: "software-engineer",
            place: "cma:535",
            lmias: 3,
            positions: 7,
            streams: { "Global Talent Stream": 2, "High Wage": 5 },
          },
        ],
      },
    ]);
  });

  it("keeps any stream name the data uses, without a fixed list", () => {
    const acc = createAccumulator();
    times(3, () => acc.addCa("ca-bbb", ca({ stream: "Primary Agriculture", positions: 2 })));
    acc.addCa("ca-bbb", ca({ stream: "A Stream Added In 2027", positions: 4 }));
    const b = acc.finish(plan).owners.get("ca-bbb")!.sponsorship.lmia![0] as { total: { streams: Record<string, number> } };
    expect(b.total.streams).toStrictEqual({ "A Stream Added In 2027": 4, "Primary Agriculture": 6 });
  });

  it("makes a Canadian owner-year under 3 approved LMIAs tooFew, whatever its positions", () => {
    const acc = createAccumulator();
    acc.addCa("ca-bbb", ca({ lmias: 2, positions: 40 }));
    expect(acc.finish(plan).owners.get("ca-bbb")!.sponsorship.lmia).toStrictEqual([
      { year: 2025, partial: false, tooFew: true },
    ]);
  });

  it("ignores years outside the plan everywhere, and gives no block to a planned year without data", () => {
    const acc = createAccumulator();
    times(3, () => acc.addUs("us-aaa", us({ year: 2022, name: "OLD NAME LLC", tradeName: "OLD", state: "TX" })));
    times(3, () => acc.addUs("us-aaa", us({ year: 2025, name: "NEW NAME LLC" })));
    times(3, () => acc.addUs("us-aaa", us({ year: 2023, name: "NEW NAME LLC" })));
    times(5, () => acc.addCa("us-aaa", ca({ year: 2021, lmias: 3 })));
    times(4, () => acc.addUs("us-old", us({ year: 2021 })));
    const { owners, totals } = acc.finish(plan);
    const o = owners.get("us-aaa")!;
    expect(o.sponsorship.lca!.map((b) => b.year)).toEqual([2023, 2025]);
    expect(o.sponsorship.lmia).toBeUndefined();
    expect(o.name).toBe("NEW NAME LLC");
    expect(o.also).toEqual([]);
    expect(o.region).toBe("US-CA");
    expect(o.countries).toEqual(["US"]);
    expect(owners.has("us-old")).toBe(false);
    expect(Object.keys(totals.lca)).toEqual(["2023", "2024", "2025", "2026"]);
    expect(Object.keys(totals.lmia)).toEqual(["2023", "2024", "2025", "2026"]);
  });

  it("wires trends per program with the shared headline, only for programs that have blocks", () => {
    const acc = createAccumulator();
    times(4, () => acc.addUs("us-aaa", us({ year: 2024, newHires: 1 })));
    times(4, () => acc.addUs("us-aaa", us({ year: 2025, newHires: 0, changeEmployer: 0, continuing: 1 })));
    times(2, () => acc.addUs("us-aaa", us({ year: 2025, newHires: 0, changeEmployer: 1 })));
    const s = acc.finish(plan).owners.get("us-aaa")!.sponsorship;
    expect(s.trends).toStrictEqual({
      lca: { full: { from: 2024, to: 2025, period: "full", change: -0.5 }, ytd: null },
    });
    expect(s.trends.lca).toEqual(trend(s.lca!, (t: UsCell) => headlineOf("lca", t)));
  });
});

describe("owner identity", () => {
  it("names an owner by its most frequent raw spelling (plan Review Focus 4)", () => {
    const acc = createAccumulator();
    times(3, () => acc.addUs("us-ggg", us({ name: "GOOGLE LLC" })));
    acc.addUs("us-ggg", us({ name: "Google LLC" }));
    const o = acc.finish(plan).owners.get("us-ggg")!;
    expect(o.name).toBe("GOOGLE LLC");
    expect(o.also).toEqual(["Google LLC"]);
  });

  it("breaks a name tie alphabetically", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("us-ttt", us({ name: "Tie Corp" })));
    times(2, () => acc.addUs("us-ttt", us({ name: "TIE CORP" })));
    expect(acc.finish(plan).owners.get("us-ttt")!.name).toBe("TIE CORP");
  });

  it("lists other names and trade names in `also`: distinct, the 10 most frequent, sorted", () => {
    const acc = createAccumulator();
    times(5, () => acc.addUs("us-aaa", us({ name: "ACME ROBOTICS INC", tradeName: "ACME ROBOTICS INC" })));
    times(3, () => acc.addUs("us-aaa", us({ name: "ZETA ROBOTICS" })));
    acc.addUs("us-aaa", us({ name: "ACME 01", tradeName: "ACME" }));
    times(11, (i) => acc.addUs("us-aaa", us({ name: `ACME ${String(i + 2).padStart(2, "0")}` })));
    const o = acc.finish(plan).owners.get("us-aaa")!;
    expect(o.name).toBe("ACME ROBOTICS INC");
    expect(o.also).toEqual([
      "ACME",
      "ACME 01",
      "ACME 02",
      "ACME 03",
      "ACME 04",
      "ACME 05",
      "ACME 06",
      "ACME 07",
      "ACME 08",
      "ZETA ROBOTICS",
    ]);
  });

  it("takes the region from the employer's own state or province: most frequent, ties alphabetical, else null", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("us-wa", us({ state: "WA", region: "US-CA" })));
    acc.addUs("us-wa", us({ state: "CA" }));
    acc.addUs("us-tie", us({ state: "WA" }));
    acc.addUs("us-tie", us({ state: "CA" }));
    acc.addUs("google.com", us({ state: "CA" }));
    times(2, () => acc.addCa("google.com", ca({ province: "ON" })));
    acc.addUs("us-none", us({ state: null }));
    acc.addCa("us-none", ca({ province: "" }));
    const { owners } = acc.finish(plan);
    expect(owners.get("us-wa")!.region).toBe("US-WA");
    expect(owners.get("us-tie")!.region).toBe("US-CA");
    expect(owners.get("google.com")!.region).toBe("CA-ON");
    expect(owners.get("us-none")!.region).toBeNull();
  });

  it("lists the countries with any data, sorted", () => {
    const acc = createAccumulator();
    acc.addUs("google.com", us());
    acc.addCa("google.com", ca());
    acc.addCa("ca-bbb", ca());
    acc.addUs("us-perm", us({ program: "perm" }));
    const { owners } = acc.finish(plan);
    expect(owners.get("google.com")!.countries).toEqual(["CA", "US"]);
    expect(owners.get("ca-bbb")!.countries).toEqual(["CA"]);
    expect(owners.get("us-perm")!.countries).toEqual(["US"]);
  });

  it("inserts owners in sorted id order and never outputs a FEIN", () => {
    const acc = createAccumulator();
    for (const id of ["us-ccc", "ca-bbb", "google.com", "us-aaa"]) acc.addUs(id, us());
    const { owners } = acc.finish(plan);
    expect([...owners.keys()]).toEqual(["ca-bbb", "google.com", "us-aaa", "us-ccc"]);
    expect(JSON.stringify([...owners])).not.toContain(FEIN);
  });
});

// Generated employer ids (prefix plus 10 hex characters), the only unprofiled form.
const JANE = "us-0a0a0a0a0a";
const ACME = "us-0b0b0b0b0b";
const MIX = "us-0c0c0c0c0c";
const BIG = "us-0d0d0d0d0d";

describe("person-like privacy gate (R23 d)", () => {
  const jane = { name: "JANE DOE", personLike: true };
  // 9 certified across LCA 2024 and PERM 2025, plus denied ones and out-of-plan ones that do not count.
  function feedJane(acc: ReturnType<typeof createAccumulator>, id: string, certified: number) {
    times(5, () => acc.addUs(id, us({ ...jane, year: 2024 })));
    times(certified - 5, () => acc.addUs(id, us({ ...jane, program: "perm" })));
    times(4, () => acc.addUs(id, us({ ...jane, status: "denied" })));
    times(6, () => acc.addUs(id, us({ ...jane, year: 2021 })));
  }

  it("exports the threshold", () => {
    expect(PERSON_LIKE_MIN_FILINGS).toBe(10);
  });

  it("treats only the exact generated-id form as unprofiled", () => {
    expect(isUnprofiledId("us-0123456789")).toBe(true);
    expect(isUnprofiledId("ca-abcdef0123")).toBe(true);
    expect(isUnprofiledId("us-foods.com")).toBe(false);
    expect(isUnprofiledId("ca-example.org")).toBe(false);
    expect(isUnprofiledId("google.com")).toBe(false);
  });

  it("drops an unprofiled weak person-like owner under 10 certified filings from owners and totals", () => {
    const acc = createAccumulator();
    feedJane(acc, JANE, 9);
    times(3, () => acc.addUs(ACME, us({ year: 2024 })));
    const r = acc.finish(plan);
    expect(r.owners.has(JANE)).toBe(false);
    expect([...r.owners.keys()]).toEqual([ACME]);
    expect(r.droppedPersonLike).toBe(1);
    expect(r.totals).toStrictEqual({
      lca: { "2023": 0, "2024": 3, "2025": 0, "2026": 0 },
      perm: { "2023": 0, "2024": 0, "2025": 0, "2026": 0 },
      lmia: { "2023": 0, "2024": 0, "2025": 0, "2026": 0 },
    });
    expect(JSON.stringify([...r.owners])).not.toContain("JANE DOE");
  });

  it("keeps the same owner at 10 certified filings", () => {
    const acc = createAccumulator();
    feedJane(acc, JANE, 10);
    const r = acc.finish(plan);
    expect(r.owners.get(JANE)!.name).toBe("JANE DOE");
    expect(r.droppedPersonLike).toBe(0);
    expect(r.totals.lca["2024"]).toBe(5);
    expect(r.totals.perm["2025"]).toBe(5);
  });

  it("keeps a profiled owner with a person-like name and 2 filings", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("janedoe.com", us(jane)));
    const r = acc.finish(plan);
    expect(r.owners.get("janedoe.com")!.sponsorship.lca).toStrictEqual([{ year: 2025, partial: false, tooFew: true }]);
    expect(r.droppedPersonLike).toBe(0);
    expect(r.totals.lca["2025"]).toBe(2);
  });

  it("treats a profiled domain that starts like a generated id as profiled", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("us-foods.com", us(jane)));
    times(2, () => acc.addCa("ca-example.org", ca({ name: "JANE DOE" })));
    acc.addUs("ca-example.org", us(jane));
    const r = acc.finish(plan);
    expect([...r.owners.keys()]).toEqual(["ca-example.org", "us-foods.com"]);
    expect(r.droppedPersonLike).toBe(0);
  });

  it("decides by the display name, and keeps a person-like alias of a small owner out of `also`", () => {
    const acc = createAccumulator();
    times(3, () => acc.addUs(MIX, us({ name: "MIX HOLDINGS LLC" })));
    acc.addUs(MIX, us(jane));
    times(9, () => acc.addUs(BIG, us({ name: "BIG HOLDINGS LLC" })));
    acc.addUs(BIG, us(jane));
    const r = acc.finish(plan);
    expect(r.owners.get(MIX)).toMatchObject({ name: "MIX HOLDINGS LLC", also: [] });
    expect(r.owners.get(BIG)).toMatchObject({ name: "BIG HOLDINGS LLC", also: ["JANE DOE"] });
    expect(r.droppedPersonLike).toBe(0);
  });
});

describe("totals", () => {
  it("counts certified filings per LCA and PERM year and approved LMIAs per Canadian year, before roll-up", () => {
    const acc = createAccumulator();
    times(2, () => acc.addUs("us-aaa", us()));
    acc.addUs("us-aaa", us({ status: "denied" }));
    ["software-engineer", "data-engineer", "designer", "data-scientist"].forEach((role) => acc.addUs("us-bbb", us({ role })));
    times(3, () => acc.addUs("us-bbb", us({ program: "perm", year: 2024 })));
    acc.addUs("us-bbb", us({ program: "perm", year: 2024, status: "withdrawn" }));
    acc.addCa("ca-ccc", ca({ lmias: 2, positions: 9 }));
    acc.addCa("ca-ccc", ca({ lmias: 3, positions: 9, quarter: 2 }));
    acc.addCa("ca-ccc", ca({ year: 2026, lmias: 1, positions: 1 }));
    const { totals } = acc.finish(plan);
    expect(totals).toStrictEqual({
      lca: { "2023": 0, "2024": 0, "2025": 6, "2026": 0 },
      perm: { "2023": 0, "2024": 3, "2025": 0, "2026": 0 },
      lmia: { "2023": 0, "2024": 0, "2025": 5, "2026": 1 },
    });
    expect(Totals.parse(totals)).toStrictEqual(totals);
  });
});

// A deterministic mixed input: several owners, every program, partial years, tooFew years, roll-ups,
// name and region ties, a dropped person-like owner and out-of-plan years.
type Op = { kind: "us"; owner: string; f: UsFiling } | { kind: "ca"; owner: string; a: CaApproval };

function sampleOps(): Op[] {
  const ops: Op[] = [];
  const roles = ["software-engineer", "data-engineer", "data-scientist"];
  const places: [string | null, string][] = [
    ["cbsa:41940", "US-CA"],
    ["cbsa:31080", "US-CA"],
    [null, "US-WA"],
    ["cbsa:35620", "US-NY"],
    ["cbsa:35620", "US-NJ"],
  ];
  let i = 0;
  for (const [owner, perYear] of [["us-aaa", 9], ["us-bbb", 2], ["google.com", 14]] as const) {
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      for (const program of ["lca", "perm"] as const) {
        for (let k = 0; k < perYear; k++) {
          i++;
          const [metro, region] = places[i % places.length];
          const f = us({
            program,
            year,
            month: year === 2026 ? 1 + (i % 3) : 1 + (i % 12),
            status: i % 5 === 0 ? "denied" : i % 7 === 0 ? "withdrawn" : "certified",
            name: i % 2 === 0 ? "Acme Robotics Inc" : "ACME ROBOTICS INC",
            tradeName: i % 6 === 0 ? "ACME" : null,
            state: i % 2 === 0 ? "CA" : "WA",
            role: roles[i % roles.length],
            metro,
            region,
            pay: i % 9 === 0 ? null : 100000 + (i % 13) * 7000,
            workers: 1 + (i % 2),
            newHires: i % 2,
            changeEmployer: (i + 1) % 2,
            continuing: i % 3 === 0 ? 1 : 0,
            level: WAGE_LEVELS[i % WAGE_LEVELS.length],
          });
          ops.push({ kind: "us", owner, f });
        }
      }
    }
  }
  const streams = ["High Wage", "Low Wage", "Global Talent Stream", "Permanent Resident Only", "Primary Agriculture"];
  for (const owner of ["ca-ccc", "google.com"]) {
    for (const year of [2021, 2024, 2025, 2026]) {
      for (let k = 0; k < 7; k++) {
        i++;
        const a = ca({
          year,
          quarter: (year === 2026 ? 1 + (k % 2) : 1 + (k % 4)) as 1 | 2 | 3 | 4,
          name: k % 2 === 0 ? "MAPLE SOFTWARE INC" : "Maple Software Inc",
          province: k % 3 === 0 ? "BC" : "ON",
          stream: streams[k % streams.length],
          role: roles[k % roles.length],
          metro: k % 4 === 0 ? null : "cma:535",
          region: k % 4 === 0 ? "CA-BC" : "CA-ON",
          lmias: 1 + (k % 2),
          positions: 1 + k,
        });
        ops.push({ kind: "ca", owner, a });
      }
    }
  }
  for (let k = 0; k < 6; k++) ops.push({ kind: "us", owner: JANE, f: us({ name: "JANE DOE", personLike: true, year: 2024 + (k % 2) }) });
  return ops;
}

function runOps(ops: Op[]) {
  const acc = createAccumulator();
  for (const op of ops) {
    if (op.kind === "us") acc.addUs(op.owner, op.f);
    else acc.addCa(op.owner, op.a);
  }
  return acc.finish(plan);
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("schema and determinism", () => {
  it("produces blocks that parse with the published schemas unchanged", () => {
    const { owners, totals, droppedPersonLike } = runOps(sampleOps());
    expect([...owners.keys()]).toEqual(["ca-ccc", "google.com", "us-aaa", "us-bbb"]);
    expect(droppedPersonLike).toBe(1);
    let blocks = 0;
    for (const o of owners.values()) {
      for (const b of [...(o.sponsorship.lca ?? []), ...(o.sponsorship.perm ?? [])]) {
        expect(YearBlockUs.parse(b)).toStrictEqual(b);
        blocks++;
      }
      for (const b of o.sponsorship.lmia ?? []) {
        expect(YearBlockCa.parse(b)).toStrictEqual(b);
        blocks++;
      }
      expect(Sponsorship.parse(o.sponsorship)).toStrictEqual(o.sponsorship);
    }
    expect(blocks).toBeGreaterThan(20);
    expect(Totals.parse(totals)).toStrictEqual(totals);
    const g = owners.get("google.com")!;
    expect(g.name).toBe("ACME ROBOTICS INC");
    expect(g.sponsorship.lca!.map((b) => [b.year, "tooFew" in b])).toEqual([
      [2023, false],
      [2024, false],
      [2025, false],
      [2026, false],
    ]);
    expect(owners.get("us-bbb")!.sponsorship.lca!.every((b) => "tooFew" in b)).toBe(true);
  });

  it("keeps each total's months consistent with its headline", () => {
    const { owners } = runOps(sampleOps());
    for (const o of owners.values()) {
      for (const p of ["lca", "perm", "lmia"] as const) {
        for (const b of o.sponsorship[p] ?? []) {
          if ("tooFew" in b) continue;
          const sum = b.months!.reduce((x, y) => x + y, 0);
          expect(sum).toBe(headlineOf(p, b.total));
        }
      }
    }
  });

  it("gives identical output for the same input in any order", () => {
    const ops = sampleOps();
    const a = JSON.stringify(runOps(ops), (_k, v) => (v instanceof Map ? [...v] : v));
    for (const order of [[...ops].reverse(), shuffled(ops, 7), shuffled(ops, 2026)]) {
      expect(JSON.stringify(runOps(order), (_k, v) => (v instanceof Map ? [...v] : v))).toBe(a);
    }
  });
});
