import type { Application, Company, Settings, Tier } from "./types";

export interface AppFilter {
  text: string;
  countryId: string;
  statusId: string;
  tier: "" | Tier;
  channelId: string;
  includeClosed: boolean;
}
export const emptyFilter = (): AppFilter => ({ text: "", countryId: "", statusId: "", tier: "", channelId: "", includeClosed: false });

export interface FilterContext {
  companies: Record<string, Company>;
  settings: Settings;
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
    if (text) {
      const company = ctx.companies[a.companyId]?.name ?? "";
      const hay = `${company} ${a.title} ${a.city ?? ""} ${a.reqId ?? ""} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
