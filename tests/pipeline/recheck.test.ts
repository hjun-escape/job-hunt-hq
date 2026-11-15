// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractText, fingerprint, MIN_TEXT } from "../../pipeline/check/text";
import { codeSpan, liveWarnings, recheck, issueBody, serializeStore, type FingerprintStore } from "../../pipeline/check/recheck";
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

  it("flags moved when the final host differs, ignoring a leading www.", async () => {
    for (const fin of ["https://example.org/about", "https://careers.example.com/about"]) {
      const r = await recheck([profile()], {}, page(html(LONG), 200, fin), today);
      expect(r.flags.map((f) => f.kind), fin).toEqual(["moved"]);
    }
    const www = await recheck([profile()], {}, page(html(LONG), 200, "https://www.example.com/about"), today);
    expect(www.flags).toEqual([]);
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
    // A fetcher that throws before returning a promise is unreachable too, not a crash.
    const sync = await recheck([profile()], store, (() => { throw new Error("boom"); }) as never, today);
    expect(sync.flags.map((f) => f.kind)).toEqual(["manual"]);
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

  it("compares whole UTC dates for old, whatever the time of day the run starts", async () => {
    const mk = (checked: string) => profile({ mission: fact(t("m"), "reported", URL_A, checked), applicationRules: undefined });
    const late = new Date("2026-11-14T23:59:00Z");
    expect((await recheck([mk("2025-11-14")], {}, page(""), late)).flags).toEqual([]);
    expect((await recheck([mk("2025-11-13")], {}, page(""), late)).flags.map((f) => f.kind)).toEqual(["old"]);
  });

  it("drops store entries for URLs no profile cites any more", async () => {
    const store: FingerprintStore = { "https://gone.example.com/old": { hash: "abc", status: 200, checked: "2026-11-07" } };
    const r = await recheck([profile()], store, page(html(LONG)), today);
    expect(Object.keys(r.store)).toEqual([URL_A]);
  });

  it("is deterministic regardless of profile order", async () => {
    const a = profile();
    const b = profile({ id: "b.com", mission: fact(t("m"), "official", "https://b.com/x"), applicationRules: undefined });
    const r1 = await recheck([a, b], {}, page(html(LONG)), today);
    const r2 = await recheck([b, a], {}, page(html(LONG)), today);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("flags that stay listed until reviewed", () => {
  const week = (n: number) => new Date(Date.UTC(2026, 10, 14 + 7 * n));
  const prof = (missionChecked: string, rulesChecked: string) =>
    profile({
      mission: fact(t("m"), "official", URL_A, missionChecked),
      applicationRules: [fact(t("r"), "official", URL_A, rulesChecked)],
    });

  it("re-lists a changed page every week until every citing fact is re-checked, then clears it", async () => {
    const first = await recheck([prof("2026-11-01", "2026-11-01")], {}, page(html(LONG)), week(-1));
    const changed = await recheck([prof("2026-11-01", "2026-11-01")], first.store, page(html(LONG + " New.")), week(0));
    expect(changed.flags.map((f) => f.kind)).toEqual(["changed"]);
    expect(changed.store[URL_A].flaggedSince).toBe("2026-11-14");

    // Unchanged since: still listed, as unreviewed, with the date it was first flagged.
    const later = await recheck([prof("2026-11-01", "2026-11-01")], changed.store, page(html(LONG + " New.")), week(1));
    expect(later.flags).toEqual([
      { company: "example.com", url: URL_A, kind: "unreviewed", facts: ["applicationRules[0]", "mission"], since: "2026-11-14" },
    ]);
    // One fact re-checked: only the other is listed.
    const half = await recheck([prof("2026-11-20", "2026-11-01")], later.store, page(html(LONG + " New.")), week(2));
    expect(half.flags).toEqual([
      { company: "example.com", url: URL_A, kind: "unreviewed", facts: ["applicationRules[0]"], since: "2026-11-14" },
    ]);
    expect(half.store[URL_A].flaggedSince).toBe("2026-11-14");
    // Both re-checked on or after the flag date: cleared.
    const done = await recheck([prof("2026-11-20", "2026-11-14")], half.store, page(html(LONG + " New.")), week(3));
    expect(done.flags).toEqual([]);
    expect(done.store[URL_A]).not.toHaveProperty("flaggedSince");
  });

  it("keeps the first flag date while the page keeps changing or moving", async () => {
    const first = await recheck([prof("2026-11-01", "2026-11-01")], {}, page(html(LONG)), week(-1));
    const a = await recheck([prof("2026-11-01", "2026-11-01")], first.store, page(html(LONG + " A.")), week(0));
    const b = await recheck([prof("2026-11-01", "2026-11-01")], a.store, page(html(LONG + " B.")), week(1));
    expect(b.flags.map((f) => f.kind)).toEqual(["changed"]);
    expect(b.store[URL_A].flaggedSince).toBe("2026-11-14");
    const moved = await recheck([prof("2026-11-01", "2026-11-01")], b.store, page(html(LONG + " B."), 200, "https://example.com/x"), week(2));
    expect(moved.flags.map((f) => f.kind)).toEqual(["moved"]);
    expect(moved.store[URL_A].flaggedSince).toBe("2026-11-14");
  });

  it("lists a gone page as pending too, after it comes back", async () => {
    const first = await recheck([prof("2026-11-01", "2026-11-01")], {}, page(html(LONG)), week(-1));
    const gone = await recheck([prof("2026-11-01", "2026-11-01")], first.store, page("", 404), week(0));
    expect(gone.flags.map((f) => f.kind)).toEqual(["gone"]);
    const back = await recheck([prof("2026-11-01", "2026-11-01")], gone.store, page(html(LONG)), week(1));
    expect(back.flags.map((f) => [f.kind, f.since])).toEqual([["unreviewed", "2026-11-14"]]);
  });

  it("keeps the last real hash through a manual or short week, so a change across it is still caught", async () => {
    const first = await recheck([prof("2026-11-01", "2026-11-01")], {}, page(html(LONG)), week(-1));
    const real = first.store[URL_A].hash;
    const short = await recheck([prof("2026-11-01", "2026-11-01")], first.store, page(html("tiny")), week(0));
    expect(short.flags.map((f) => f.kind)).toEqual(["manual"]);
    expect(short.store[URL_A]).toMatchObject({ hash: "manual", lastHash: real });
    const blocked = await recheck([prof("2026-11-01", "2026-11-01")], short.store, page("", 0), week(1));
    expect(blocked.flags).toEqual([]);
    expect(blocked.store[URL_A]).toMatchObject({ hash: "manual", lastHash: real });
    const same = await recheck([prof("2026-11-01", "2026-11-01")], blocked.store, page(html(LONG)), week(2));
    expect(same.flags).toEqual([]);
    expect(same.store[URL_A]).toEqual({ hash: real, status: 200, checked: "2026-11-28" });
    const changed = await recheck([prof("2026-11-01", "2026-11-01")], blocked.store, page(html(LONG + " New.")), week(2));
    expect(changed.flags.map((f) => f.kind)).toEqual(["changed"]);
    expect(changed.store[URL_A]).not.toHaveProperty("lastHash");
  });

  it("serialises the store with sorted URLs and keys, optional fields only when set", () => {
    const text = serializeStore({
      "https://b.example.com/": { status: 200, hash: "h2", checked: "2026-11-14", lastHash: "h1", flaggedSince: "2026-11-07" },
      "https://a.example.com/": { status: 200, hash: "h", checked: "2026-11-14" },
    });
    expect(text).toBe(
      '{\n  "https://a.example.com/": {\n    "checked": "2026-11-14",\n    "hash": "h",\n    "status": 200\n  },\n' +
        '  "https://b.example.com/": {\n    "checked": "2026-11-14",\n    "flaggedSince": "2026-11-07",\n    "hash": "h2",\n' +
        '    "lastHash": "h1",\n    "status": 200\n  }\n}\n',
    );
  });
});

describe("issueBody", () => {
  const headings = [
    "Changed sources",
    "Moved or gone",
    "Flagged earlier and not yet reviewed",
    "Needs a manual check",
    "Not re-confirmed in 12 months",
    "Largest sponsors without a profile",
    "Possible matches to add",
    "Build warnings",
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
    expect(body).toContain(`[\`${URL_A}\`](<${URL_A}>)`);
    expect(body).toContain("applicationRules[0], mission");
    expect(body).toContain("X Corp");
    expect(body).toContain("Y Inc");
    expect(body.indexOf("a.com.yaml")).toBeLessThan(body.indexOf("b.com.yaml"));
  });
  it("lists an unreviewed flag with the date it was first flagged", () => {
    const body = issueBody([{ company: "a.com", url: URL_A, kind: "unreviewed", facts: ["mission"], since: "2026-11-07" }], null);
    expect(body).toContain("## Flagged earlier and not yet reviewed\n\n- [a.com]");
    expect(body).toContain(`(<${URL_A}>) (flagged 2026-11-07): mission`);
  });

  it("puts report names in code spans, so a name can never mention anyone", () => {
    const body = issueBody([], {
      unprofiledTop: [{ id: "us-0123456789", name: "@octocat Holdings", headline: 9 }, { id: "us-0000000001", name: "Back`tick Co", headline: 4 }],
      proposals: [{ profile: "a.com", id: "us-0000000002", name: "Hi @team [x](y)", headline: 3 }],
    });
    expect(body).toContain("- `@octocat Holdings` (us-0123456789): 9");
    expect(body).toContain("- ``Back`tick Co`` (us-0000000001): 4");
    expect(body).toContain(": `Hi @team [x](y)` (us-0000000002): 3");
    expect(body.replace(/``.*?``|`[^`\n]*`/g, "")).not.toContain("@");
  });

  it("keeps links with parentheses, spaces or angle brackets in one piece", () => {
    const url = "https://en.wikipedia.org/wiki/Foo_(company)";
    const body = issueBody([{ company: "a.com", url, kind: "changed", facts: ["mission"] }], null);
    expect(body).toContain(`[\`${url}\`](<${url}>)`);
    const odd = issueBody([{ company: "a.com", url: "https://x.example/a b<c>", kind: "changed", facts: ["mission"] }], null);
    expect(odd).toContain("(<https://x.example/a%20b%3Cc%3E>)");
  });

  it("makes a code span that survives backticks and line breaks", () => {
    expect(codeSpan("plain")).toBe("`plain`");
    expect(codeSpan("a`b")).toBe("``a`b``");
    expect(codeSpan("`edge")).toBe("`` `edge ``");
    expect(codeSpan("two\nlines")).toBe("`two lines`");
  });

  it("ends with the live build's warnings, escaped, or says there are none or that they are not available", () => {
    const listed = issueBody([], null, "unpublished", ["lmia data looks stale: newest quarter ended 2026-06-30; the source may be late or may have moved its files", "see @someone"]);
    expect(listed).toMatch(/## Build warnings\n\n- `lmia data looks stale: newest quarter ended 2026-06-30; [^`]*`\n- `see @someone`\n$/);
    expect(issueBody([], null, "unpublished", [])).toMatch(/## Build warnings\n\nNone this week\.\n$/);
    expect(issueBody([], null, "error", null)).toMatch(/## Build warnings\n\nNot available yet \(the dataset has not been published\)\.\n$/);
    expect(issueBody([], null)).toMatch(/## Build warnings\n\nNot available yet \(the dataset has not been published\)\.\n$/);
  });

  it("reads the live meta.json's warnings, and gives null on a 404, an error or a bad file", async () => {
    const meta = (warnings: unknown) => ({ ok: true, status: 200, json: async () => ({ warnings }) }) as unknown as Response;
    expect(await liveWarnings("https://x.invalid/meta.json", async () => meta(["a", "b"]))).toEqual(["a", "b"]);
    expect(await liveWarnings("https://x.invalid/meta.json", async () => meta([]))).toEqual([]);
    expect(await liveWarnings("https://x.invalid/meta.json", async () => new Response("", { status: 404 }))).toBeNull();
    expect(await liveWarnings("https://x.invalid/meta.json", async () => new Response("", { status: 503 }))).toBeNull();
    expect(await liveWarnings("https://x.invalid/meta.json", async () => { throw new Error("down"); })).toBeNull();
    expect(await liveWarnings("https://x.invalid/meta.json", async () => new Response("<html>", { status: 200 }))).toBeNull();
    expect(await liveWarnings("https://x.invalid/meta.json", async () => meta([1, 2]))).toBeNull();
  });

  it("says why the report is missing", () => {
    expect(issueBody([], null, "error")).toContain("Not available this week (could not read report.json).");
  });
});
