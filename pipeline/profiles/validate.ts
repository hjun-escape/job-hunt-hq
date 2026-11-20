// Rules beyond the schema for hand-written company profiles.
import { textFragment } from "../check/text";
import { personalText, textFields } from "../check/text-scan";
import { companyIdFromUrl, normalizeName } from "../normalize/names";
import { ProfileSchema, type Profile } from "../schema/profile";

export type Problem = { file: string; path: string; message: string };

type FactLike = { kind: "official" | "reported"; sources: { url: string; seen: string }[]; checked: string };

function issuePath(path: PropertyKey[]): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out || "(profile)";
}

function listFacts(p: Profile): { path: string; fact: FactLike }[] {
  const out: { path: string; fact: FactLike }[] = [];
  const add = (path: string, fact: FactLike | undefined) => {
    if (fact) out.push({ path, fact });
  };
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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function underHost(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

function checkProfile(file: string, p: Profile, today: string, problems: Problem[]): void {
  const add = (path: string, message: string) => problems.push({ file, path, message });
  const stem = file.replace(/\.yaml$/, "");
  if (p.id !== stem) add("id", "id must equal the file name");
  else if (p.id !== companyIdFromUrl(p.id)) add("id", `id must be the company's main domain (${companyIdFromUrl(p.id)})`);

  const bases = [p.id, ...(p.officialHosts ?? []).map((h) => h.toLowerCase())];
  for (const { path, fact } of listFacts(p)) {
    if (fact.checked > today) add(`${path}.checked`, "date is in the future");
    fact.sources.forEach((s, i) => {
      if (s.seen > today) add(`${path}.sources[${i}].seen`, "date is in the future");
      try {
        textFragment(s.url); // the weekly re-check fingerprints only the passage a #:~:text= fragment names
      } catch {
        add(`${path}.sources[${i}].url`, "text fragment (#:~:text=) is malformed");
      }
      if (fact.kind === "official" && !bases.some((b) => underHost(hostOf(s.url), b))) {
        add(`${path}.sources[${i}].url`, "official fact cites a host outside the company");
      }
    });
  }

  // The same scan the site writer runs, so a profile that passes validation never fails the build.
  for (const { path, text } of textFields(p)) {
    const what = personalText(text);
    if (what) add(path, `contains ${what}`);
  }

  if (p.countries.includes("KR")) {
    const hasKo = Boolean(p.mission?.value.ko) || Boolean(p.values?.value.summary.ko);
    if (!hasKo) add("mission", "Korean companies need a Korean summary");
  }
}

export function validateProfiles(
  entries: { file: string; profile: unknown }[],
  today: Date,
): { profiles: Profile[]; problems: Problem[] } {
  const todayIso = today.toISOString().slice(0, 10);
  const profiles: Profile[] = [];
  const problems: Problem[] = [];
  const owners = new Map<string, string>(); // claim key -> first file

  for (const { file, profile } of entries) {
    const parsed = ProfileSchema.safeParse(profile);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({ file, path: issuePath(issue.path), message: issue.message });
      }
      continue;
    }
    const p = parsed.data;
    const before = problems.length;
    checkProfile(file, p, todayIso, problems);

    const claim = (key: string, path: string, label: string) => {
      const first = owners.get(key);
      if (first === undefined) owners.set(key, file);
      else if (first !== file) problems.push({ file, path, message: `${label} is already claimed by ${first}` });
    };
    p.entities.usFeins?.forEach((f, i) => claim(`fein:${f}`, `entities.usFeins[${i}]`, `FEIN ${f}`));
    p.entities.usNames?.forEach((n, i) =>
      claim(`us:${normalizeName(n)}`, `entities.usNames[${i}]`, `US name "${n}"`),
    );
    p.entities.caNames?.forEach((c, i) =>
      claim(`ca:${c.province}:${normalizeName(c.name)}`, `entities.caNames[${i}]`, `Canadian name "${c.name}" in ${c.province}`),
    );
    if (problems.length === before) profiles.push(p);
  }
  return { profiles, problems };
}
