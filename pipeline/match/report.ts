// Coverage report: the largest unprofiled sponsors and possible matches for existing profiles.
// It holds ids, display names and headlines only, never FEINs. Owners the privacy gate dropped are not in
// `owners`, so they cannot appear here.
import { isUnprofiledId, type OwnerResult } from "../aggregate/accumulate";
import { headlineFor } from "../aggregate/trend";
import { normalizeName } from "../normalize/names";
import type { Profile } from "../schema/profile";
import type { Report } from "../schema/published";

const TOP = 20;
const PER_PROFILE = 10;

const byHeadline = (a: { headline: number; id: string }, b: { headline: number; id: string }) =>
  b.headline - a.headline || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Ranked by the latest complete LCA year's headline, certified filings (R41), then id. */
export function buildReport(owners: Map<string, OwnerResult>, profiles: Profile[]): Report {
  let year = 0;
  for (const o of owners.values()) {
    for (const b of o.sponsorship.lca ?? []) if (!b.partial && b.year > year) year = b.year;
  }

  const unprofiled: { id: string; name: string; headline: number; norm: string }[] = [];
  for (const [id, o] of owners) {
    if (isUnprofiledId(id)) {
      unprofiled.push({ id, name: o.name, headline: headlineFor(o.sponsorship, "lca", year), norm: normalizeName(o.name) });
    }
  }

  const unprofiledTop = [...unprofiled]
    .sort(byHeadline)
    .slice(0, TOP)
    .map(({ id, name, headline }) => ({ id, name, headline }));

  // Index by first word, so each profile scans only owners that can possibly match.
  const byFirst = new Map<string, typeof unprofiled>();
  for (const u of unprofiled) {
    const first = u.norm.split(" ")[0];
    if (!first) continue;
    const list = byFirst.get(first);
    if (list) list.push(u);
    else byFirst.set(first, [u]);
  }

  const proposals: Report["proposals"] = [];
  for (const p of [...profiles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const prefixes = new Set([p.name, ...(p.otherNames ?? [])].map(normalizeName).filter(Boolean));
    const hits = new Map<string, (typeof unprofiled)[number]>();
    for (const prefix of prefixes) {
      for (const u of byFirst.get(prefix.split(" ")[0]) ?? []) {
        if (u.norm === prefix || u.norm.startsWith(`${prefix} `)) hits.set(u.id, u);
      }
    }
    [...hits.values()]
      .sort(byHeadline)
      .slice(0, PER_PROFILE)
      .forEach((u) => proposals.push({ profile: p.id, id: u.id, name: u.name, headline: u.headline }));
  }
  return { unprofiledTop, proposals };
}
