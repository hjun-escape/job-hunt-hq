// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractText, fingerprint, MIN_TEXT } from "../../pipeline/check/text";
import { recheck, issueBody, type FingerprintStore } from "../../pipeline/check/recheck";
import type { Profile } from "../../pipeline/schema/profile";

const URL_A = "https://example.com/about";
const LONG = "Our mission is to build things people love. ".repeat(10);
const today = new Date("2026-11-14T00:00:00Z");

function fact<V>(value: V, kind: "official" | "reported", url: string, checked = "2026-11-01") {
  return { value, kind, sources: [{ url, seen: checked }], checked };
}
const t = (en: string) => ({ en });

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "example.com",
    name: "Example",
    countries: ["US"],
    entities: {},
    mission: fact(t("m"), "official", URL_A),
    applicationRules: [fact(t("r"), "official", URL_A)],
    ...over,
  } as Profile;
}

const page = (body: string, status = 200, finalUrl = URL_A) => async () => ({ status, finalUrl, body });
const html = (text: string) => `<html><body><p>${text}</p></body></html>`;

describe("extractText", () => {
  it("drops chrome, strips tags and collapses whitespace", () => {
    expect(extractText("<nav>Menu</nav><p>Our   mission</p><script>x()</script>")).toBe("Our mission");
  });
  it("decodes common entities and drops comments, styles, svg and footers", () => {
    expect(
      extractText("<style>a{}</style><!-- hi --><svg><text>no</text></svg><p>A &amp; B&nbsp;&lt;c&gt; &#39;d&#39;</p><footer>f</footer>"),
    ).toBe("A & B <c> 'd'");
  });
  it("drops long opaque ids but keeps short numbers", () => {
    expect(extractText("<p>Hello 8672068877759301517 f47abc2584e13592215647b8 world 2026</p>")).toBe("Hello world 2026");
  });
  it("fingerprints deterministically", () => {
    expect(fingerprint("a")).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint("a")).toBe(fingerprint("a"));
  });
});

describe("recheck", () => {
  it("stores a first sight without a flag and fetches each URL once", async () => {
    let n = 0;
    const r = await recheck([profile()], {}, async () => { n++; return { status: 200, finalUrl: URL_A, body: html(LONG) }; }, today);
    expect(r.flags).toEqual([]);
    expect(n).toBe(1);
    expect(r.store[URL_A]).toEqual({ hash: fingerprint(extractText(html(LONG))), status: 200, checked: "2026-11-14" });
  });

  it("flags a changed page once, listing every fact that cites it, sorted", async () => {
    const first = await recheck([profile()], {}, page(html(LONG)), today);
    const same = await recheck([profile()], first.store, page(html(LONG)), today);
    expect(same.flags).toEqual([]);
    const changed = await recheck([profile()], first.store, page(html(LONG + "New policy.")), today);
    expect(changed.flags).toEqual([
      { company: "example.com", url: URL_A, kind: "changed", facts: ["applicationRules[0]", "mission"] },
    ]);
  });

  it("flags gone on 404 and 410", async () => {
    for (const status of [404, 410]) {
      const r = await recheck([profile()], {}, page("", status), today);
      expect(r.flags.map((f) => f.kind)).toEqual(["gone"]);
      expect(r.store[URL_A].status).toBe(status);
    }
  });

  it("flags moved when the final path differs", async () => {
    const r = await recheck([profile()], {}, page(html(LONG), 200, "https://example.com/new-about"), today);
    expect(r.flags.map((f) => f.kind)).toEqual(["moved"]);
  });

  it("ignores trailing-slash and locale-only redirects", async () => {
    for (const fin of ["https://example.com/about/", "https://example.com/en-ca/about", "https://example.com/de/about"]) {
      const r = await recheck([profile()], {}, page(html(LONG), 200, fin), today);
      expect(r.flags).toEqual([]);
    }
  });

  it("stores a short page as manual and flags it on the first run only", async () => {
    const short = page(html("tiny"));
    expect("tiny".length).toBeLessThan(MIN_TEXT);
    const first = await recheck([profile()], {}, short, today);
    expect(first.flags.map((f) => f.kind)).toEqual(["manual"]);
    expect(first.store[URL_A].hash).toBe("manual");
    const second = await recheck([profile()], first.store, short, today);
    expect(second.flags).toEqual([]);
  });

  it("treats status 0 (robots disallow) as manual, and a thrown fetch as a flag without touching the store", async () => {
    const robots = await recheck([profile()], {}, page("", 0), today);
    expect(robots.store[URL_A].hash).toBe("manual");
    const store: FingerprintStore = { [URL_A]: { hash: "abc", status: 200, checked: "2026-11-07" } };
    const r = await recheck([profile()], store, async () => { throw new Error("boom"); }, today);
    expect(r.flags.map((f) => f.kind)).toEqual(["manual"]);
    expect(r.store).toEqual(store);
  });

  it("does not fetch reported facts but flags them as old", async () => {
    let n = 0;
    const p = profile({
      mission: undefined,
      applicationRules: undefined,
      hiringProcess: fact(t("h"), "reported", "https://wiki.example.org/x", "2025-11-13"),
    });
    const r = await recheck([p], {}, async () => { n++; return { status: 200, finalUrl: "", body: "" }; }, today);
    expect(n).toBe(0);
    expect(r.flags).toEqual([{ company: "example.com", url: "https://wiki.example.org/x", kind: "old", facts: ["hiringProcess"] }]);
  });

  it("flags old only past 365 days, comparing in UTC", async () => {
    const mk = (checked: string) => profile({ mission: fact(t("m"), "reported", URL_A, checked), applicationRules: undefined });
    expect((await recheck([mk("2025-11-14")], {}, page(""), today)).flags).toEqual([]);
    expect((await recheck([mk("2025-11-13")], {}, page(""), today)).flags.map((f) => f.kind)).toEqual(["old"]);
  });

  it("is deterministic regardless of profile order", async () => {
    const a = profile();
    const b = profile({ id: "b.com", mission: fact(t("m"), "official", "https://b.com/x"), applicationRules: undefined });
    const r1 = await recheck([a, b], {}, page(html(LONG)), today);
    const r2 = await recheck([b, a], {}, page(html(LONG)), today);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("issueBody", () => {
  const headings = [
    "Changed sources",
    "Moved or gone",
    "Needs a manual check",
    "Not re-confirmed in 12 months",
    "Largest sponsors without a profile",
    "Possible matches to add",
  ];
  it("lists the headings in order, empty sections say None this week.", () => {
    const body = issueBody([], null);
    expect(body).toContain("Changed sources\n\nNone this week.");
    const idx = headings.map((h) => body.indexOf(h));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect(body).toContain("Not available yet (the dataset has not been published).");
  });
  it("groups by company with links and never prints page text", () => {
    const body = issueBody(
      [
        { company: "b.com", url: "https://b.com/x", kind: "gone", facts: ["mission"] },
        { company: "a.com", url: URL_A, kind: "changed", facts: ["applicationRules[0]", "mission"] },
        { company: "a.com", url: "https://a.com/o", kind: "moved", facts: ["hiringProcess"] },
      ],
      { unprofiledTop: [{ id: "x.com", name: "X Corp", headline: 5 }], proposals: [{ profile: "a.com", id: "y.com", name: "Y Inc", headline: 3 }] },
    );
    expect(body).toContain("[a.com](https://github.com/hjun-escape/job-hunt-hq/blob/master/data/companies/a.com.yaml)");
    expect(body).toContain(`[${URL_A}](${URL_A})`);
    expect(body).toContain("applicationRules[0], mission");
    expect(body).toContain("X Corp");
    expect(body).toContain("Y Inc");
    expect(body.indexOf("a.com.yaml")).toBeLessThan(body.indexOf("b.com.yaml"));
  });
  it("says why the report is missing", () => {
    expect(issueBody([], null, "error")).toContain("Not available this week (could not read report.json).");
  });
});
