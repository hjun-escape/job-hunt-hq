import type { Application, Company, Settings, Tier } from "./types";

export type SponsorshipFilter = "" | "needs" | "no_need" | "offered" | "not_offered";
export interface AppFilter {
  text: string;
  countryId: string;
  statusId: string;
  tier: "" | Tier;
  channelId: string;
  sponsorship: SponsorshipFilter;
  tag: string;
  includeClosed: boolean;
}
export const emptyFilter = (): AppFilter => ({ text: "", countryId: "", statusId: "", tier: "", channelId: "", sponsorship: "", tag: "", includeClosed: false });

export interface FilterContext {
  companies: Record<string, Company>;
  settings: Settings;
}

function sponsorshipMatches(a: Application, f: SponsorshipFilter): boolean {
  switch (f) {
    case "needs": return a.needsSponsorship === true;
    case "no_need": return a.needsSponsorship === false;
    case "offered": return a.sponsorshipOffered === true;
    case "not_offered": return a.sponsorshipOffered === false;
    default: return true;
  }
}
/** Every tag in use, sorted, for the tag filter. */
export function allTags(apps: Application[]): string[] {
  return [...new Set(apps.flatMap((a) => a.tags))].sort((x, y) => x.localeCompare(y));
}

export function filterApplications(apps: Application[], f: AppFilter, ctx: FilterContext): Application[] {
  const text = f.text.trim().toLowerCase();
  const statusById = new Map(ctx.settings.pickLists.statuses.map((s) => [s.id, s] as const));
  return apps.filter((a) => {
    const status = statusById.get(a.statusId);
    if (!f.includeClosed && !f.statusId && status && status.group !== "open") return false;
    if (f.countryId && a.countryId !== f.countryId) return false;
    if (f.statusId && a.statusId !== f.statusId) return false;
    if (f.tier && a.tier !== f.tier) return false;
    if (f.channelId && a.channelId !== f.channelId) return false;
    if (!sponsorshipMatches(a, f.sponsorship)) return false;
    if (f.tag && !a.tags.includes(f.tag)) return false;
    if (text) {
      const company = ctx.companies[a.companyId]?.name ?? "";
      const hay = `${company} ${a.title} ${a.city ?? ""} ${a.reqId ?? ""} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
