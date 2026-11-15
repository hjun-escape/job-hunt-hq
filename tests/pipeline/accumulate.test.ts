// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createAccumulator,
  isUnprofiledId,
  PERSON_LIKE_MIN_FILINGS,
  type YearPlans,
} from "../../pipeline/aggregate/accumulate";
import { payStats, SUB_MIN } from "../../pipeline/aggregate/cells";
import { headlineOf, publishedHeadline, type YearBlock } from "../../pipeline/aggregate/trend";
import { personNameSignal } from "../../pipeline/normalize/names";
import {
  Sponsorship,
  Totals,
  YearBlockCa,
  YearBlockUs,
  type CaCell,
  type TrendPair,
  type UsCell,
} from "../../pipeline/schema/published";
import {
  WAGE_LEVELS,
  type CaApproval,
  type CaseStatus,
  type Place,
  type UsFiling,
  type WageLevel,
} from "../../pipeline/types";

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

  it("counts LCA filings exactly: sums and levels from certified only, headline and months certified filings (R41)", () => {
    const acc = createAccumulator();
    const id = "us-aaa";
    const pays = Array.from({ length: 12 }, (_, i) => 100000 + i * 20000);
    pays.slice(0, 4).forEach((pay) => acc.addUs(id, us({ month: 1, pay, newHires: 1, level: "II" })));
    pays.slice(4, 8).forEach((pay) => acc.addUs(id, us({ month: 2, pay, newHires: 0, changeEmployer: 1, level: "III" })));
    pays.slice(8).forEach((pay) => acc.addUs(id, us({ month: 3, pay, newHires: 0, continuing: 1, level: "IV" })));
    // Withdrawn: counts as withdrawn only, none of its workers, pay or level.
    times(3, () => acc.addUs(id, us({ month: 4, status: "withdrawn", workers: 5, newHires: 5, pay: 900000, level: "I" })));
    // Denied in a cell too small to publish: appears only in the total.
    times(3, () => acc.addUs(id, us({ month: 5, status: "denied", role: "data-engineer", metro: "cbsa:31080", level: "I" })));
    const blocks = acc.finish(plan).owners.get(id)!.sponsorship.lca!;
    const pay = { n: 12, p25: 155000, median: 210000, p75: 265000 };
    expect(blocks).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [4, 4, 4, ...zeros(9)],
        total: {
          role: "all",
          place: "all",
          filings: 12,
          denied: 3,
          withdrawn: 3,
          workers: 12,
          newHires: 4,
          changeEmployer: 4,
          continuing: 4,
          levels: { II: 4, III: 4, IV: 4 },
          pay,
        },
        // Cells carry counts and pay only.
        cells: [{ role: "software-engineer", place: "cbsa:41940", filings: 12, workers: 12, pay }],
      },
    ]);
    const b = blocks[0] as { total: UsCell };
    expect(headlineOf("lca", b.total)).toBe(12);
  });

  it("withholds total sub-counts under 3 and each exact-sum group with a small member whole; cells carry none", () => {
    const acc = createAccumulator();
    const id = "us-aaa";
    times(4, (i) => acc.addUs(id, us({ month: 1, newHires: 1, level: "II", pay: 100000 + i * 10000 })));
    times(3, (i) => acc.addUs(id, us({ month: 2, newHires: 0, changeEmployer: 1, level: "III", pay: 140000 + i * 10000 })));
    acc.addUs(id, us({ month: 2, newHires: 0, continuing: 1, level: "IV", pay: 170000 }));
    acc.addUs(id, us({ status: "denied" }));
    // continuing 1 withholds the whole worker split; level IV 1 withholds every level; denied 1 is withheld.
    // The months count certified filings, which are always shown, so they stay. Pay needs 10 values.
    expect(acc.finish(plan).owners.get(id)!.sponsorship.lca).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [4, 4, ...zeros(10)],
        total: { role: "all", place: "all", filings: 8, workers: 8, levels: {} },
        cells: [{ role: "software-engineer", place: "cbsa:41940", filings: 8, workers: 8 }],
      },
    ]);
  });

  it("leaves nothing to subtract across cells (cross-cell example)", () => {
    const acc = createAccumulator();
    const id = "us-0000000001";
    times(3, () => acc.addUs(id, us()));
    times(3, () => acc.addUs(id, us({ status: "denied" })));
    times(3, () => acc.addUs(id, us({ role: "data-engineer", metro: "cbsa:31080" })));
    acc.addUs(id, us({ role: "data-engineer", metro: "cbsa:31080", status: "denied" }));
    const b = acc.finish(plan).owners.get(id)!.sponsorship.lca![0] as { total: UsCell; cells: UsCell[] };
    expect(b.total.denied).toBe(4);
    expect(b.cells).toStrictEqual([
      { role: "data-engineer", place: "cbsa:31080", filings: 3, workers: 3 },
      { role: "software-engineer", place: "cbsa:41940", filings: 3, workers: 3 },
    ]);
  });

  it("publishes months only without entries of 1 or 2, keeps `through`, and gives no ytd trend without them", () => {
    const run = (lateMonth: number) => {
      const acc = createAccumulator();
      const id = "us-aaa";
      times(6, () => acc.addUs(id, us({ year: 2025, month: 1 })));
      times(6, () => acc.addUs(id, us({ year: 2025, month: 1, newHires: 0, changeEmployer: 1 })));
      times(3, () => acc.addUs(id, us({ year: 2026, month: 1 })));
      times(3, () => acc.addUs(id, us({ year: 2026, month: 1, newHires: 0, changeEmployer: 1 })));
      acc.addUs(id, us({ year: 2026, month: lateMonth }));
      return acc.finish(plan).owners.get(id)!.sponsorship;
    };
    const hidden = run(2);
    expect(hidden.lca![1]).toMatchObject({ year: 2026, partial: true, through: 3 });
    expect("months" in hidden.lca![1]).toBe(false);
    expect(hidden.trends.lca!.ytd).toBeNull();
    const shown = run(1);
    expect(shown.lca![1]).toMatchObject({ year: 2026, partial: true, through: 3, months: [7, ...zeros(11)] });
    expect(shown.trends.lca!.ytd).toEqual({ from: 2025, to: 2026, period: "ytd", through: 3, change: (7 - 12) / 12 });
  });

  it("gives PERM cells no LCA keys, and publishes denied on the total only when it is at least 3", () => {
    const pay = { n: 10, p25: 190000, median: 280000, p75: 370000 };
    const run = (denied: number) => {
      const acc = createAccumulator();
      times(10, (i) => acc.addUs("us-aaa", us({ program: "perm", pay: 100000 + i * 40000 })));
      times(denied, () => acc.addUs("us-aaa", us({ program: "perm", status: "denied", month: 5, pay: 990000 })));
      return acc.finish(plan).owners.get("us-aaa")!.sponsorship.perm;
    };
    const cells = [{ role: "software-engineer", place: "cbsa:41940", filings: 10, pay }];
    expect(run(1)).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [10, ...zeros(11)],
        total: { role: "all", place: "all", filings: 10, pay },
        cells,
      },
    ]);
    expect(run(3)).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [10, ...zeros(11)],
        total: { role: "all", place: "all", filings: 10, denied: 3, pay },
        cells,
      },
    ]);
  });

  it("takes pay only from certified filings with a figure, and needs PAY_MIN (10) values", () => {
    const run = (values: number[]) => {
      const acc = createAccumulator();
      values.forEach((pay) => acc.addUs("us-aaa", us({ pay })));
      acc.addUs("us-aaa", us({ pay: null }));
      times(3, () => acc.addUs("us-aaa", us({ status: "denied", pay: 900000 })));
      times(3, () => acc.addUs("us-aaa", us({ status: "withdrawn", pay: 800000 })));
      return acc.finish(plan).owners.get("us-aaa")!.sponsorship.lca![0] as { total: UsCell; cells: UsCell[] };
    };
    const ten = run(Array.from({ length: 10 }, (_, i) => 100000 + i * 40000));
    const stats = { n: 10, p25: 190000, median: 280000, p75: 370000 };
    expect(ten.total.filings).toBe(11);
    expect(ten.total.pay).toEqual(stats);
    expect(ten.cells[0].pay).toEqual(stats);
    const nine = run(Array.from({ length: 9 }, (_, i) => 100000 + i * 40000));
    expect("pay" in nine.total).toBe(false);
    expect("pay" in nine.cells[0]).toBe(false);
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
    acc.addCa("ca-bbb", ca({ quarter: 3, stream: "Global Talent Stream", lmias: 1, positions: 3 }));
    acc.addCa("ca-bbb", ca({ quarter: 3, stream: "Permanent Resident Only", role: "data-engineer", lmias: 1, positions: 3 }));
    expect(acc.finish(plan).owners.get("ca-bbb")!.sponsorship.lmia).toStrictEqual([
      {
        year: 2025,
        partial: false,
        months: [5, 0, 6, 0],
        total: {
          role: "all",
          place: "all",
          lmias: 4,
          positions: 11,
          streams: { "Global Talent Stream": 3, "High Wage": 5, "Permanent Resident Only": 3 },
        },
        cells: [{ role: "software-engineer", place: "cma:535", lmias: 3, positions: 8 }],
      },
    ]);
  });

  it("withholds the Canadian streams whole when any is 1 or 2", () => {
    const acc = createAccumulator();
    acc.addCa("ca-bbb", ca({ stream: "High Wage", lmias: 2, positions: 6 }));
    acc.addCa("ca-bbb", ca({ stream: "Low Wage", lmias: 1, positions: 4 }));
    acc.addCa("ca-bbb", ca({ stream: "Global Talent Stream", lmias: 1, positions: 2 }));
    const b = acc.finish(plan).owners.get("ca-bbb")!.sponsorship.lmia![0] as { total: { streams: Record<string, number> } };
    expect(b.total.streams).toStrictEqual({});
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

  it("wires trends per program from published headlines (LCA filings), only for programs that have blocks", () => {
    const acc = createAccumulator();
    times(6, () => acc.addUs("us-aaa", us({ year: 2024 })));
    times(4, () => acc.addUs("us-aaa", us({ year: 2024, newHires: 0, changeEmployer: 1 })));
    times(3, () => acc.addUs("us-aaa", us({ year: 2025 })));
    times(3, () => acc.addUs("us-aaa", us({ year: 2025, newHires: 0, changeEmployer: 1 })));
    const s = acc.finish(plan).owners.get("us-aaa")!.sponsorship;
    expect(s.trends).toStrictEqual({
      lca: { full: { from: 2024, to: 2025, period: "full", change: -0.4 }, ytd: null },
    });
  });

  it("gives an LCA trend from filings even when a year's worker split is withheld (R41)", () => {
    const acc = createAccumulator();
    times(4, () => acc.addUs("us-aaa", us({ year: 2024 })));
    times(3, () => acc.addUs("us-aaa", us({ year: 2024, newHires: 0, changeEmployer: 1 })));
    times(2, () => acc.addUs("us-aaa", us({ year: 2025, newHires: 0, changeEmployer: 1 })));
    times(4, () => acc.addUs("us-aaa", us({ year: 2025, newHires: 0, continuing: 1 })));
    const s = acc.finish(plan).owners.get("us-aaa")!.sponsorship;
    // 2024's worker split is shown; 2025's changeEmployer 2 withholds its whole split. Filings are always shown.
    expect((s.lca![0] as { total: UsCell }).total).toMatchObject({ filings: 7, newHires: 4, changeEmployer: 3 });
    const t2025 = (s.lca![1] as { total: UsCell }).total;
    expect([t2025.newHires, t2025.changeEmployer, t2025.continuing]).toEqual([undefined, undefined, undefined]);
    expect(s.trends.lca).toEqual({ full: { from: 2024, to: 2025, period: "full", change: (6 - 7) / 7 }, ytd: null });
  });

  it("does not let blanket LCAs drive the headline: a filing for 100 positions counts once (R41)", () => {
    const acc = createAccumulator();
    times(3, () => acc.addUs("us-aaa", us({ year: 2024, workers: 100, newHires: 100 })));
    times(6, () => acc.addUs("us-aaa", us({ year: 2025 })));
    const s = acc.finish(plan).owners.get("us-aaa")!.sponsorship;
    const [y2024, y2025] = s.lca! as { total: UsCell; months?: number[] }[];
    expect(y2024.total).toMatchObject({ filings: 3, workers: 300, newHires: 300 });
    expect(y2024.months).toEqual([3, ...zeros(11)]);
    expect([headlineOf("lca", y2024.total), headlineOf("lca", y2025.total)]).toEqual([3, 6]);
    expect(s.trends.lca!.full).toEqual({ from: 2024, to: 2025, period: "full", change: 1 });
  });

  it("ignores a partial year's filings and approvals past `through`", () => {
    // LCA 2026 runs through quarter 1 (fiscal months 1-3); LMIA 2026 through quarter 2.
    const acc = createAccumulator();
    times(3, () => acc.addUs("us-aaa", us({ year: 2026, month: 3 })));
    times(4, () => acc.addUs("us-aaa", us({ year: 2026, month: 4, name: "LATE NAME LLC", tradeName: "LATE", state: "TX" })));
    times(3, () => acc.addUs("us-late", us({ year: 2026, month: 12 })));
    times(3, () => acc.addCa("ca-bbb", ca({ year: 2026, quarter: 2 })));
    times(5, () => acc.addCa("ca-bbb", ca({ year: 2026, quarter: 3 })));
    const { owners, totals } = acc.finish(plan);
    const o = owners.get("us-aaa")!;
    expect(o.sponsorship.lca![0]).toMatchObject({ year: 2026, partial: true, through: 3, months: [0, 0, 3, ...zeros(9)] });
    expect((o.sponsorship.lca![0] as { total: UsCell }).total.filings).toBe(3);
    expect(o).toMatchObject({ name: "ACME ROBOTICS INC", also: [], region: "US-CA" });
    expect(owners.has("us-late")).toBe(false);
    expect(owners.get("ca-bbb")!.sponsorship.lmia![0]).toMatchObject({ year: 2026, through: 2, months: [0, 3, 0, 0] });
    expect(totals.lca["2026"]).toBe(3);
    expect(totals.lmia["2026"]).toBe(3);
  });

  it("throws on a month or quarter out of range and on the reserved role id", () => {
    const acc = createAccumulator();
    for (const month of [0, 13, 1.5]) expect(() => acc.addUs("us-aaa", us({ month }))).toThrow(/month/);
    for (const quarter of [0, 5]) {
      expect(() => acc.addCa("ca-bbb", { ...ca(), quarter } as unknown as CaApproval)).toThrow(/quarter/);
    }
    expect(() => acc.addUs("us-aaa", us({ role: "all" }))).toThrow(/"all"/);
    expect(() => acc.addCa("ca-bbb", ca({ role: "all" }))).toThrow(/"all"/);
  });
});

describe("reviewer probes (R30)", () => {
  it("probe A: newHires 1, changeEmployer 1, continuing 8 withholds the whole worker split", () => {
    const acc = createAccumulator();
    const id = "us-0000000001";
    acc.addUs(id, us({ newHires: 1, level: "III", pay: null }));
    acc.addUs(id, us({ newHires: 0, changeEmployer: 1, level: "III", pay: null }));
    times(8, () => acc.addUs(id, us({ newHires: 0, continuing: 1, level: "III", pay: null })));
    const b = acc.finish(plan).owners.get(id)!.sponsorship.lca![0];
    expect(b).toStrictEqual({
      year: 2025,
      partial: false,
      months: [10, ...zeros(11)],
      total: { role: "all", place: "all", filings: 10, workers: 10, levels: { III: 10 } },
      cells: [{ role: "software-engineer", place: "cbsa:41940", filings: 10, workers: 10 }],
    });
  });

  it("probe B: levels I 1, II 1, III 4, IV 4, N/A 4 withholds every level", () => {
    const acc = createAccumulator();
    const id = "us-0000000001";
    const levels: [WageLevel, number][] = [["I", 1], ["II", 1], ["III", 4], ["IV", 4], ["N/A", 4]];
    for (const [level, n] of levels) times(n, () => acc.addUs(id, us({ level, pay: null })));
    const total = (acc.finish(plan).owners.get(id)!.sponsorship.lca![0] as { total: UsCell }).total;
    expect(total).toStrictEqual({ role: "all", place: "all", filings: 14, workers: 14, newHires: 14, levels: {} });
  });

  it("a withheld worker split keeps the filings headline, the months and the LCA trend (R41)", () => {
    const acc = createAccumulator();
    const id = "us-0000000001";
    times(4, () => acc.addUs(id, us({ year: 2024 })));
    times(3, () => acc.addUs(id, us({ year: 2024, newHires: 0, changeEmployer: 1 })));
    acc.addUs(id, us({ newHires: 1 }));
    acc.addUs(id, us({ newHires: 0, changeEmployer: 1 }));
    times(8, () => acc.addUs(id, us({ newHires: 0, continuing: 1 })));
    const s = acc.finish(plan).owners.get(id)!.sponsorship;
    const [y2024, y2025] = s.lca! as { total: UsCell; months?: number[] }[];
    expect(publishedHeadline("lca", y2024.total)).toBe(7);
    expect(y2024.months).toEqual([7, ...zeros(11)]);
    expect(y2025.total.newHires ?? y2025.total.changeEmployer ?? y2025.total.continuing).toBeUndefined();
    expect(publishedHeadline("lca", y2025.total)).toBe(10);
    expect(y2025.months).toEqual([10, ...zeros(11)]);
    expect(s.trends.lca).toEqual({ full: { from: 2024, to: 2025, period: "full", change: 3 / 7 }, ytd: null });
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

  it("keeps placeholders and street addresses out of `also`, from names and trade names alike", () => {
    const acc = createAccumulator();
    times(3, () => acc.addUs("us-ggg", us({ name: "GOOGLE LLC", tradeName: "N/A" })));
    acc.addUs("us-ggg", us({ name: "1600 Amphitheatre Pkwy", tradeName: "100 Main St" }));
    acc.addUs("us-ggg", us({ name: "SAME", tradeName: "Google" }));
    const o = acc.finish(plan).owners.get("us-ggg")!;
    expect(o.name).toBe("GOOGLE LLC");
    expect(o.also).toEqual(["Google"]);
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

  it("keeps person-like trade names of a small unprofiled owner out of `also`", () => {
    expect(personNameSignal("JOHN SMITH")).not.toBeNull();
    expect(personNameSignal("MIX")).toBeNull();
    const acc = createAccumulator();
    times(3, () => acc.addUs(MIX, us({ name: "MIX HOLDINGS LLC", tradeName: "JOHN SMITH" })));
    acc.addUs(MIX, us({ name: "MIX HOLDINGS LLC", tradeName: "MIX" }));
    times(10, () => acc.addUs(BIG, us({ name: "BIG HOLDINGS LLC", tradeName: "JOHN SMITH" })));
    times(3, () => acc.addUs("mix.com", us({ name: "MIX HOLDINGS LLC", tradeName: "JOHN SMITH" })));
    const { owners } = acc.finish(plan);
    expect(owners.get(MIX)!.also).toEqual(["MIX"]);
    expect(owners.get(BIG)!.also).toEqual(["JOHN SMITH"]);
    expect(owners.get("mix.com")!.also).toEqual(["JOHN SMITH"]);
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

  it("keeps each total's published months consistent with its published headline", () => {
    const { owners } = runOps(sampleOps());
    let checked = 0;
    for (const o of owners.values()) {
      for (const p of ["lca", "perm", "lmia"] as const) {
        for (const b of o.sponsorship[p] ?? []) {
          if ("tooFew" in b || !b.months) continue;
          expect(b.months.reduce((x, y) => x + y, 0)).toBe(headlineOf(p, b.total));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("gives identical output for the same input in any order", () => {
    const ops = sampleOps();
    const a = JSON.stringify(runOps(ops), (_k, v) => (v instanceof Map ? [...v] : v));
    for (const order of [[...ops].reverse(), shuffled(ops, 7), shuffled(ops, 2026)]) {
      expect(JSON.stringify(runOps(order), (_k, v) => (v instanceof Map ? [...v] : v))).toBe(a);
    }
  });
});

// R28 invariants over a seeded, mixed sample. Raw values are recomputed here from the input filings: each
// filing belongs to its (role, metro) cell if published, else its (role, region) cell, else ("all", region).
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomOps(seed: number): Op[] {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const roles = ["software-engineer", "data-engineer", "data-scientist", "designer", "product-manager"];
  const usPlaces: [string | null, string][] = [
    ["cbsa:41940", "US-CA"],
    ["cbsa:31080", "US-CA"],
    [null, "US-CA"],
    ["cbsa:35620", "US-NY"],
    ["cbsa:35620", "US-NJ"],
    ["cbsa:42660", "US-WA"],
    [null, "US-WA"],
  ];
  const caPlaces: [string | null, string][] = [
    ["cma:535", "CA-ON"],
    [null, "CA-ON"],
    ["cma:933", "CA-BC"],
  ];
  const streams = ["High Wage", "Low Wage", "Global Talent Stream", "Permanent Resident Only", "Primary Agriculture"];
  const ops: Op[] = [];
  for (let o = 0; o < 30; o++) {
    const owner = o % 7 === 0 ? `profiled${o}.com` : `us-${o.toString(16).padStart(10, "0")}`;
    const size = pick([1, 3, 6, 12, 25, 60]);
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      for (const program of ["lca", "perm"] as const) {
        for (let k = int(0, size); k > 0; k--) {
          const [metro, region] = pick(usPlaces);
          const workers = int(1, 3);
          const newHires = int(0, workers);
          const changeEmployer = int(0, workers - newHires);
          const r = rnd();
          const f = us({
            program,
            year,
            month: int(1, 12), // 2026 months past `through` must be ignored
            status: r < 0.75 ? "certified" : r < 0.9 ? "denied" : "withdrawn",
            state: pick(["CA", "WA", "NY", null]),
            role: pick(roles),
            metro,
            region,
            pay: rnd() < 0.1 ? null : int(60, 250) * 1000,
            workers,
            newHires,
            changeEmployer,
            continuing: workers - newHires - changeEmployer,
            level: pick(WAGE_LEVELS),
          });
          ops.push({ kind: "us", owner, f });
        }
      }
    }
  }
  for (let o = 0; o < 15; o++) {
    const owner = `ca-${o.toString(16).padStart(10, "0")}`;
    const size = pick([1, 3, 8, 20]);
    for (const year of [2021, 2023, 2024, 2025, 2026]) {
      for (let k = int(0, size); k > 0; k--) {
        const [metro, region] = pick(caPlaces);
        const lmias = int(1, 3);
        const a = ca({
          year,
          quarter: int(1, 4) as 1 | 2 | 3 | 4,
          province: region.slice(3),
          stream: pick(streams),
          role: pick(roles),
          metro,
          region,
          lmias,
          positions: lmias + int(0, 3),
        });
        ops.push({ kind: "ca", owner, a });
      }
    }
  }
  return ops;
}

const sumOf = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const inPlanUs = (f: UsFiling) => {
  const sel = plan[f.program];
  return sel.complete.includes(f.year) || (sel.partial?.year === f.year && Math.ceil(f.month / 3) <= sel.partial.through);
};
const inPlanCa = (a: CaApproval) =>
  plan.lmia.complete.includes(a.year) || (plan.lmia.partial?.year === a.year && a.quarter <= plan.lmia.partial.through);

function cellFor<C extends { role: string; place: string }>(cells: C[], role: string, place: Place): C | undefined {
  const find = (r: string, p: string) => cells.find((c) => c.role === r && c.place === p);
  return (place.metro ? find(role, place.metro) : undefined) ?? find(role, place.region) ?? find("all", place.region);
}

/** One exact-sum group: withheld whole when any member is 1 or 2; otherwise every member from SUB_MIN, no zeros. */
function checkGroup(raw: [string, number][], shown: Record<string, number | undefined>, strictKeys: boolean) {
  const small = raw.some(([, n]) => n > 0 && n < SUB_MIN);
  for (const [k, n] of raw) expect(shown[k]).toBe(small || n < SUB_MIN ? undefined : n);
  if (strictKeys) for (const k of Object.keys(shown)) expect(raw.map(([rk]) => rk)).toContain(k);
}

const sub = (shown: number | undefined, raw: number) => {
  if (shown === undefined) expect(raw).toBeLessThan(SUB_MIN);
  else expect([shown, shown >= SUB_MIN]).toEqual([raw, true]);
};

const payOf = (cert: UsFiling[]) => payStats(cert.flatMap((f) => (f.annualPay === null ? [] : [f.annualPay])));

/** A total: every sub-count from SUB_MIN, each exact-sum group never with exactly one withheld member. */
function checkUsTotal(pub: UsCell, fs: UsFiling[], lca: boolean) {
  const cert = fs.filter((f) => f.status === "certified");
  expect(pub.filings).toBe(cert.length);
  sub(pub.denied, fs.filter((f) => f.status === "denied").length);
  sub(pub.withdrawn, fs.filter((f) => f.status === "withdrawn").length);
  expect(pub.pay).toEqual(payOf(cert));
  if (pub.pay) expect(pub.pay.n).toBeGreaterThanOrEqual(10);
  if (!lca) {
    for (const k of ["workers", "newHires", "changeEmployer", "continuing", "levels"]) expect(pub).not.toHaveProperty(k);
    return;
  }
  expect(pub.workers).toBe(sumOf(cert, (f) => f.lca!.workers));
  const split = (["newHires", "changeEmployer", "continuing"] as const).map(
    (k) => [k, sumOf(cert, (f) => f.lca![k])] as [string, number],
  );
  checkGroup(split, { newHires: pub.newHires, changeEmployer: pub.changeEmployer, continuing: pub.continuing }, false);
  const levels = WAGE_LEVELS.map((l) => [l, cert.filter((f) => f.lca!.level === l).length] as [string, number]);
  checkGroup(levels, pub.levels ?? {}, true);
}

/** A cell: role, place, filings, workers (LCA) and pay only. */
function checkUsCell(pub: UsCell, fs: UsFiling[], lca: boolean) {
  const cert = fs.filter((f) => f.status === "certified");
  const keys = ["role", "place", "filings", ...(lca ? ["workers"] : []), ...(pub.pay ? ["pay"] : [])];
  expect(Object.keys(pub).sort()).toEqual(keys.sort());
  expect(pub.filings).toBe(cert.length);
  if (lca) expect(pub.workers).toBe(sumOf(cert, (f) => f.lca!.workers));
  expect(pub.pay).toEqual(payOf(cert));
  if (pub.pay) expect(pub.pay.n).toBeGreaterThanOrEqual(10);
}

function checkCaTotal(pub: CaCell, rows: CaApproval[]) {
  expect(pub.lmias).toBe(sumOf(rows, (a) => a.lmias));
  expect(pub.positions).toBe(sumOf(rows, (a) => a.positions));
  const names = [...new Set(rows.map((a) => a.stream))].sort();
  const raw = names.map((n) => [n, sumOf(rows.filter((a) => a.stream === n), (a) => a.positions)] as [string, number]);
  checkGroup(raw, pub.streams ?? {}, true);
}

function checkCaCell(pub: CaCell, rows: CaApproval[]) {
  expect(pub).toStrictEqual({
    role: pub.role,
    place: pub.place,
    lmias: sumOf(rows, (a) => a.lmias),
    positions: sumOf(rows, (a) => a.positions),
  });
}

function checkBlock<R extends { role: string; place: Place }, C extends { role: string; place: string }>(
  b: YearBlock<C>,
  rows: R[],
  count: (rs: R[]) => number,
  checkTotal: (pub: C, rs: R[]) => void,
  checkCell: (pub: C, rs: R[]) => void,
  rawMonths: number[],
) {
  expect("tooFew" in b).toBe(count(rows) < 3);
  if ("tooFew" in b) return;
  checkTotal(b.total, rows);
  const keys = b.cells.map((c) => `${c.role} ${c.place}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (const cell of b.cells) {
    const mine = rows.filter((r) => cellFor(b.cells, r.role, r.place) === cell);
    expect(count(mine)).toBeGreaterThanOrEqual(3);
    checkCell(cell, mine);
  }
  expect(sumOf(b.cells, (c) => count(rows.filter((r) => cellFor(b.cells, r.role, r.place) === c)))).toBeLessThanOrEqual(
    count(rows),
  );
  const safe = rawMonths.every((n) => n === 0 || n >= SUB_MIN);
  expect(b.months).toEqual(safe ? rawMonths : undefined);
}

/** The headline a reader can compute from a published total (an independent oracle, not the module's): R41. */
function readableHeadline(p: "lca" | "perm" | "lmia", t: UsCell | CaCell): number {
  return p === "lmia" ? (t as CaCell).positions : (t as UsCell).filings;
}

/** A published trend rests only on published values: both headlines (and, for ytd, both months) are shown. */
function checkTrends<C>(p: "lca" | "perm" | "lmia", blocks: YearBlock<C>[], pair: TrendPair | undefined) {
  const shownBlock = (year: number) => {
    const b = blocks.find((x) => x.year === year);
    expect(b).toBeDefined();
    expect(b && "tooFew" in b).toBe(false);
    const full = b as Extract<YearBlock<C>, { total: C }>;
    return { block: full, h: readableHeadline(p, full.total as UsCell | CaCell) };
  };
  if (pair?.full) {
    const from = shownBlock(pair.full.from);
    const to = shownBlock(pair.full.to);
    expect(pair.full.change).toBe((to.h - from.h) / from.h);
  }
  if (pair?.ytd) {
    const from = shownBlock(pair.ytd.from).block;
    const to = shownBlock(pair.ytd.to).block;
    const n = pair.ytd.through!;
    const first = (m: number[] | undefined) => sumOf(m!.slice(0, n), (x) => x);
    expect(from.months && to.months).toBeTruthy();
    expect(pair.ytd.change).toBe((first(to.months) - first(from.months)) / first(from.months));
  }
}

describe("small-count invariants (R28, R29)", () => {
  it("holds for every published block and trend of a seeded mixed sample", () => {
    const ops = randomOps(20261115);
    const { owners } = runOps(ops);
    let blocks = 0;
    let trends = 0;
    const usOps = ops.flatMap((op) => (op.kind === "us" && inPlanUs(op.f) ? [op] : []));
    const caOps = ops.flatMap((op) => (op.kind === "ca" && inPlanCa(op.a) ? [op] : []));
    const expectedOwners = [...new Set([...usOps, ...caOps].map((op) => op.owner))].sort();
    expect([...owners.keys()]).toEqual(expectedOwners);
    for (const [id, o] of owners) {
      const yearsOf = (xs: { owner: string; year: number }[]) =>
        [...new Set(xs.filter((x) => x.owner === id).map((x) => x.year))].sort((a, b) => a - b);
      for (const program of ["lca", "perm"] as const) {
        const mine = usOps.filter((op) => op.f.program === program).map((op) => ({ owner: op.owner, year: op.f.year }));
        expect((o.sponsorship[program] ?? []).map((b) => b.year)).toEqual(yearsOf(mine));
        for (const b of o.sponsorship[program] ?? []) {
          const fs = usOps.filter((op) => op.owner === id && op.f.program === program && op.f.year === b.year).map((op) => op.f);
          const cert = fs.filter((f) => f.status === "certified");
          const months = zeros(12);
          for (const f of cert) months[f.month - 1] += 1;
          const lca = program === "lca";
          checkBlock(
            b,
            fs,
            (rs) => rs.filter((f) => f.status === "certified").length,
            (c, rs) => checkUsTotal(c, rs, lca),
            (c, rs) => checkUsCell(c, rs, lca),
            months,
          );
          blocks++;
        }
        checkTrends(program, o.sponsorship[program] ?? [], o.sponsorship.trends[program]);
        if (o.sponsorship.trends[program]?.full) trends++;
      }
      expect((o.sponsorship.lmia ?? []).map((b) => b.year)).toEqual(
        yearsOf(caOps.map((op) => ({ owner: op.owner, year: op.a.year }))),
      );
      for (const b of o.sponsorship.lmia ?? []) {
        const rows = caOps.filter((op) => op.owner === id && op.a.year === b.year).map((op) => op.a);
        const months = zeros(4);
        for (const a of rows) months[a.quarter - 1] += a.positions;
        checkBlock(b, rows, (rs) => sumOf(rs, (a) => a.lmias), checkCaTotal, checkCaCell, months);
        blocks++;
      }
      checkTrends("lmia", o.sponsorship.lmia ?? [], o.sponsorship.trends.lmia);
      if (o.sponsorship.trends.lmia?.full) trends++;
    }
    expect(blocks).toBeGreaterThan(80);
    expect(trends).toBeGreaterThan(5);
  });
});
