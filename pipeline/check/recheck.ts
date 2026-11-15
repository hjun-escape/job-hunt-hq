// Weekly re-check of the pages that profile facts cite. Pure logic: the fetcher is injected.
import type { Profile } from "../schema/profile";
import type { Report } from "../schema/published";
import { extractText, fingerprint, MIN_TEXT } from "./text";

/**
 * One cited URL. `hash` is this week's text fingerprint, or "manual" when the page gave no usable text.
 * `lastHash` is the last real fingerprint, kept while `hash` is not it (a manual, short, blocked or gone week
 * never overwrites it), so a change across such a week is still caught. `flaggedSince` is the date of the first
 * changed, moved or gone flag not yet confirmed: the flag is listed every week until every fact citing the URL
 * has a checked date on or after it. Both are optional (added later, so older stores still read).
 */
export type FingerprintEntry = { hash: string; status: number; checked: string; lastHash?: string; flaggedSince?: string };
export type FingerprintStore = Record<string, FingerprintEntry>;
/** "unreviewed": a changed, moved or gone flag from an earlier week whose facts have not been re-checked since. */
export type FlagKind = "changed" | "gone" | "moved" | "manual" | "old" | "unreviewed";
/** `since` (unreviewed flags only) is the date the URL was first flagged. */
export type Flag = { company: string; url: string; kind: FlagKind; facts: string[]; since?: string };
/** status 0 means "not fetched" (robots.txt disallows). A fetcher that throws means the page was unreachable. */
export type Fetcher = (url: string) => Promise<{ status: number; finalUrl: string; body: string }>;

const DAY_MS = 86_400_000;
const REPO_BLOB = "https://github.com/hjun-escape/job-hunt-hq/blob/master/data/companies";

type FactLike = { kind: "official" | "reported"; sources: { url: string }[]; checked: string };

function factsOf(p: Profile): { path: string; fact: FactLike }[] {
  const out: { path: string; fact: FactLike }[] = [];
  const add = (path: string, f: FactLike | undefined) => f && out.push({ path, fact: f });
  add("basics.industry", p.basics?.industry);
  add("basics.size", p.basics?.size);
  add("basics.hq", p.basics?.hq);
  add("mission", p.mission);
  add("values", p.values);
  p.applicationRules?.forEach((f, i) => add(`applicationRules[${i}]`, f));
  add("hiringProcess", p.hiringProcess);
  p.reapplyWait?.forEach((f, i) => add(`reapplyWait[${i}]`, f));
  return out;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const day = (d: Date) => d.toISOString().slice(0, 10);
const sortedSet = (xs: string[]) => [...new Set(xs)].sort(cmp);

/** Path without a trailing slash or a leading locale segment (/en-ca/), so geo and slash redirects are not "moved". */
function pathOf(u: string): string {
  let path: string;
  try {
    path = new URL(u).pathname;
  } catch {
    return u;
  }
  path = path.replace(/^\/[a-z]{2}(-[a-z]{2,4})?(?=\/|$)/i, "").replace(/\/+$/, "");
  return path.toLowerCase() || "/";
}

/** Host name without a leading "www.", so a www redirect is not "moved". */
function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return u;
  }
}

const isMoved = (url: string, finalUrl: string) => hostOf(finalUrl) !== hostOf(url) || pathOf(finalUrl) !== pathOf(url);

/** An entry with `lastHash` only while it differs from `hash`. */
function entryOf(hash: string, status: number, checked: string, lastHash: string | undefined): FingerprintEntry {
  return { hash, status, checked, ...(lastHash !== undefined && lastHash !== hash ? { lastHash } : {}) };
}

/**
 * This week's verdict on one URL: the new store entry (undefined when there is none to keep) and the fresh flags.
 * An unreachable page or a server error keeps the old entry as it was.
 */
async function verdict(
  url: string,
  prev: FingerprintEntry | undefined,
  fetcher: Fetcher,
  today: string,
): Promise<{ entry: FingerprintEntry | undefined; kinds: FlagKind[] }> {
  const lastReal = prev?.lastHash ?? (prev && prev.hash !== "manual" ? prev.hash : undefined);
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await fetcher(url);
  } catch {
    return { entry: prev, kinds: ["manual"] }; // unreachable this week; keep the old fingerprint
  }
  if (res.status >= 500) return { entry: prev, kinds: ["manual"] };
  if (res.status === 404 || res.status === 410) {
    return { entry: entryOf(prev?.hash ?? "manual", res.status, today, lastReal), kinds: ["gone"] };
  }
  const ok = res.status >= 200 && res.status < 300;
  let hash = "manual";
  if (ok) {
    const text = extractText(res.body);
    if (text.length >= MIN_TEXT) hash = fingerprint(text);
  }
  const kinds: FlagKind[] = [];
  if (ok && res.finalUrl && isMoved(url, res.finalUrl)) kinds.push("moved");
  if (hash === "manual") {
    if (prev?.hash !== "manual") kinds.push("manual");
  } else if (lastReal !== undefined && lastReal !== hash) {
    kinds.push("changed");
  }
  return { entry: entryOf(hash, res.status, today, hash === "manual" ? lastReal : undefined), kinds };
}

const PENDING: FlagKind[] = ["changed", "moved", "gone"];

/**
 * Re-fetches every URL an official fact cites (each once, however many profiles cite it) and compares it with
 * the store. The returned store holds only URLs still cited. A changed, moved or gone URL stays flagged ("unreviewed",
 * in later weeks) until every official fact citing it has a checked date on or after the first flag's date.
 * "old" flags any fact whose checked date is more than 365 days before today, comparing UTC dates.
 */
export async function recheck(
  profiles: Profile[],
  store: FingerprintStore,
  fetcher: Fetcher,
  today: Date,
): Promise<{ store: FingerprintStore; flags: Flag[] }> {
  const next: FingerprintStore = {};
  const flags: Flag[] = [];
  const todayStr = day(today);
  const todayMs = Date.parse(todayStr);
  const citing = new Map<string, { company: string; path: string; checked: string }[]>();
  for (const p of [...profiles].sort((a, b) => cmp(a.id, b.id))) {
    for (const { path, fact } of factsOf(p)) {
      if ((todayMs - Date.parse(fact.checked)) / DAY_MS > 365) {
        flags.push({ company: p.id, url: fact.sources[0].url, kind: "old", facts: [path] });
      }
      if (fact.kind !== "official") continue;
      for (const s of fact.sources) citing.set(s.url, [...(citing.get(s.url) ?? []), { company: p.id, path, checked: fact.checked }]);
    }
  }

  for (const url of [...citing.keys()].sort(cmp)) {
    const facts = citing.get(url)!;
    const prev = store[url];
    const { entry, kinds } = await verdict(url, prev, fetcher, todayStr);
    const fresh = kinds.some((k) => PENDING.includes(k));
    let since = fresh ? (prev?.flaggedSince ?? todayStr) : prev?.flaggedSince;
    if (since !== undefined && facts.every((f) => f.checked >= since!)) since = undefined;
    if (entry) {
      const { flaggedSince: _old, ...rest } = entry;
      next[url] = since !== undefined ? { ...rest, flaggedSince: since } : rest;
    }
    for (const company of sortedSet(facts.map((f) => f.company))) {
      const mine = facts.filter((f) => f.company === company);
      for (const kind of kinds) flags.push({ company, url, kind, facts: sortedSet(mine.map((f) => f.path)) });
      const open = sortedSet(mine.filter((f) => since !== undefined && f.checked < since).map((f) => f.path));
      if (!fresh && open.length > 0) flags.push({ company, url, kind: "unreviewed", facts: open, since });
    }
  }

  flags.sort((a, b) => cmp(a.company, b.company) || cmp(a.kind, b.kind) || cmp(a.url, b.url) || cmp(a.facts.join(), b.facts.join()));
  return { store: next, flags };
}

/** The store as data/fingerprints.json: URLs sorted, keys in alphabetical order, optional fields only when set. */
export function serializeStore(store: FingerprintStore): string {
  const sorted: FingerprintStore = {};
  for (const k of Object.keys(store).sort()) {
    const v = store[k];
    sorted[k] = {
      checked: v.checked,
      ...(v.flaggedSince ? { flaggedSince: v.flaggedSince } : {}),
      hash: v.hash,
      ...(v.lastHash ? { lastHash: v.lastHash } : {}),
      status: v.status,
    };
  }
  return JSON.stringify(sorted, null, 2) + "\n";
}

/** Text as a Markdown code span, so a filed name or a URL is never a mention (@name), a link or markup. */
export function codeSpan(text: string): string {
  const t = text.replace(/[\r\n]+/g, " ");
  const fence = "`".repeat(Math.max(0, ...(t.match(/`+/g) ?? []).map((r) => r.length)) + 1);
  const pad = t.startsWith("`") || t.endsWith("`") ? " " : "";
  return `${fence}${pad}${t}${pad}${fence}`;
}

/** A link to `url` shown as code; the angle-bracket destination keeps parentheses in one piece. */
function link(url: string): string {
  return `[${codeSpan(url)}](<${url.replace(/[<>\s]/g, (c) => encodeURIComponent(c))}>)`;
}

const SECTIONS: { title: string; kinds: FlagKind[]; note: string }[] = [
  { title: "Changed sources", kinds: ["changed"], note: "The readable text of the page differs from last week. Re-read it and update the fact if needed." },
  { title: "Moved or gone", kinds: ["moved", "gone"], note: "The page redirects to a different host or path, or answers 404 or 410. Find the new address." },
  {
    title: "Flagged earlier and not yet reviewed",
    kinds: ["unreviewed"],
    note: "Changed, moved or gone in an earlier week. Listed until every fact citing it has a checked date on or after the date shown.",
  },
  { title: "Needs a manual check", kinds: ["manual"], note: "No usable text (script-rendered, blocked by robots.txt, or unreachable). Open it in a browser." },
  { title: "Not re-confirmed in 12 months", kinds: ["old"], note: "The fact's checked date is more than a year old." },
];

function groupSection(flags: Flag[], kinds: FlagKind[]): string[] {
  const mine = flags.filter((f) => kinds.includes(f.kind));
  if (mine.length === 0) return ["None this week."];
  const out: string[] = [];
  const companies = [...new Set(mine.map((f) => f.company))].sort(cmp);
  for (const c of companies) {
    out.push(`- [${c}](${REPO_BLOB}/${c}.yaml)`);
    for (const f of mine.filter((x) => x.company === c)) {
      const label = f.since ? ` (flagged ${f.since})` : kinds.length > 1 ? ` (${f.kind})` : "";
      out.push(`  - ${link(f.url)}${label}: ${f.facts.join(", ")}`);
    }
  }
  return out;
}

export function issueBody(flags: Flag[], report: Report | null, reportState: "unpublished" | "error" = "unpublished"): string {
  const lines: string[] = ["# Weekly source re-check", ""];
  for (const s of SECTIONS) {
    lines.push(`## ${s.title}`, "", ...groupSection(flags, s.kinds), "");
  }
  const missing =
    reportState === "error"
      ? "Not available this week (could not read report.json)."
      : "Not available yet (the dataset has not been published).";
  lines.push("## Largest sponsors without a profile", "");
  if (!report) lines.push(missing);
  else if (report.unprofiledTop.length === 0) lines.push("None this week.");
  else for (const r of report.unprofiledTop) lines.push(`- ${codeSpan(r.name)} (${r.id}): ${r.headline}`);
  lines.push("", "## Possible matches to add", "");
  if (!report) lines.push(missing);
  else if (report.proposals.length === 0) lines.push("None this week.");
  else {
    const props = [...report.proposals].sort((a, b) => cmp(a.profile, b.profile) || cmp(a.id, b.id));
    for (const r of props) lines.push(`- [${r.profile}](${REPO_BLOB}/${r.profile}.yaml): ${codeSpan(r.name)} (${r.id}): ${r.headline}`);
  }
  return lines.join("\n") + "\n";
}
