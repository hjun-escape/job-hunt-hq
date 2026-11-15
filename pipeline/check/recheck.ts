// Weekly re-check of the pages that profile facts cite. Pure logic: the fetcher is injected.
import type { Profile } from "../schema/profile";
import type { Report } from "../schema/published";
import { extractText, fingerprint, MIN_TEXT } from "./text";

export type FingerprintStore = Record<string, { hash: string; status: number; checked: string }>;
export type FlagKind = "changed" | "gone" | "moved" | "manual" | "old";
export type Flag = { company: string; url: string; kind: FlagKind; facts: string[] };
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

export async function recheck(
  profiles: Profile[],
  store: FingerprintStore,
  fetcher: Fetcher,
  today: Date,
): Promise<{ store: FingerprintStore; flags: Flag[] }> {
  const next: FingerprintStore = { ...store };
  const flags: Flag[] = [];
  const todayStr = day(today);
  const fetched = new Map<string, ReturnType<Fetcher>>();
  const sorted = [...profiles].sort((a, b) => cmp(a.id, b.id));

  for (const p of sorted) {
    const byUrl = new Map<string, string[]>();
    for (const { path, fact } of factsOf(p)) {
      const age = (today.getTime() - Date.parse(fact.checked)) / DAY_MS;
      if (age > 365) flags.push({ company: p.id, url: fact.sources[0].url, kind: "old", facts: [path] });
      if (fact.kind !== "official") continue;
      for (const s of fact.sources) byUrl.set(s.url, [...(byUrl.get(s.url) ?? []), path]);
    }
    for (const url of [...byUrl.keys()].sort(cmp)) {
      const facts = [...new Set(byUrl.get(url))].sort(cmp);
      const flag = (kind: FlagKind) => flags.push({ company: p.id, url, kind, facts });
      const prev = store[url];
      let res: Awaited<ReturnType<Fetcher>>;
      try {
        // A URL cited by several profiles is fetched once; every citing company gets the same verdict.
        if (!fetched.has(url)) fetched.set(url, fetcher(url));
        res = await fetched.get(url)!;
      } catch {
        flag("manual"); // unreachable this week; keep the old fingerprint
        continue;
      }
      if (res.status >= 500) {
        flag("manual");
        continue;
      }
      if (res.status === 404 || res.status === 410) {
        flag("gone");
        next[url] = { hash: prev?.hash ?? "manual", status: res.status, checked: todayStr };
        continue;
      }
      let hash = "manual";
      if (res.status >= 200 && res.status < 300) {
        const text = extractText(res.body);
        if (text.length >= MIN_TEXT) hash = fingerprint(text);
      }
      if (res.status >= 200 && res.status < 300 && res.finalUrl && pathOf(res.finalUrl) !== pathOf(url)) flag("moved");
      if (hash === "manual") {
        if (prev?.hash !== "manual") flag("manual");
      } else if (prev && prev.hash !== "manual" && prev.hash !== hash) {
        flag("changed");
      }
      next[url] = { hash, status: res.status, checked: todayStr };
    }
  }

  flags.sort((a, b) => cmp(a.company, b.company) || cmp(a.kind, b.kind) || cmp(a.url, b.url) || cmp(a.facts.join(), b.facts.join()));
  return { store: next, flags };
}

const SECTIONS: { title: string; kinds: FlagKind[]; note: string }[] = [
  { title: "Changed sources", kinds: ["changed"], note: "The readable text of the page differs from last week. Re-read it and update the fact if needed." },
  { title: "Moved or gone", kinds: ["moved", "gone"], note: "The page redirects to a different path, or answers 404 or 410. Find the new address." },
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
      const label = kinds.length > 1 ? ` (${f.kind})` : "";
      out.push(`  - [${f.url}](${f.url})${label}: ${f.facts.join(", ")}`);
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
  else for (const r of report.unprofiledTop) lines.push(`- ${r.name} (${r.id}): ${r.headline}`);
  lines.push("", "## Possible matches to add", "");
  if (!report) lines.push(missing);
  else if (report.proposals.length === 0) lines.push("None this week.");
  else {
    const props = [...report.proposals].sort((a, b) => cmp(a.profile, b.profile) || cmp(a.id, b.id));
    for (const r of props) lines.push(`- [${r.profile}](${REPO_BLOB}/${r.profile}.yaml): ${r.name} (${r.id}): ${r.headline}`);
  }
  return lines.join("\n") + "\n";
}
