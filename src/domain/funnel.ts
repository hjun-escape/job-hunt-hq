import type { Application, Settings, StatusEntry } from "./types";

export interface FunnelStage {
  id: string;
  label: string;
  stageRank: number;
  reached: number;
  /** reached / previous stage's reached; null for the first stage or when nothing reached the previous one. */
  conversion: number | null;
}
export type FunnelGrouping = "channel" | "resume";

/** Open statuses in funnel order. Archived ones stay: applications that reached them still count. */
export function openStages(settings: Pick<Settings, "pickLists">): StatusEntry[] {
  return settings.pickLists.statuses.filter((s) => s.group === "open").sort((a, b) => a.stageRank - b.stageRank);
}

/** Spec §4: an application "reached" a stage when maxStageRank ≥ stageRank, whatever happened afterwards. */
export function funnel(apps: Application[], stages: StatusEntry[]): FunnelStage[] {
  let previous: number | null = null;
  return stages.map((s) => {
    const reached = apps.filter((a) => a.maxStageRank >= s.stageRank).length;
    const conversion = previous == null || previous === 0 ? null : reached / previous;
    previous = reached;
    return { id: s.id, label: s.label, stageRank: s.stageRank, reached, conversion };
  });
}

export function groupKey(app: Application, grouping: FunnelGrouping): string {
  return grouping === "channel" ? app.channelId : (app.resumeAssetId ?? "");
}

export function funnelBy(apps: Application[], stages: StatusEntry[], grouping: FunnelGrouping): Map<string, FunnelStage[]> {
  const groups = new Map<string, Application[]>();
  for (const a of apps) {
    const k = groupKey(a, grouping);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return new Map([...groups].map(([k, list]) => [k, funnel(list, stages)] as const));
}

/** Spec §5 Assets: share of the given applications that reached the "screening" stage. */
export function screenRate(apps: Application[], stages: StatusEntry[]): number | null {
  const stage = stages.find((s) => s.id === "screening");
  if (!stage || apps.length === 0) return null;
  return apps.filter((a) => a.maxStageRank >= stage.stageRank).length / apps.length;
}
