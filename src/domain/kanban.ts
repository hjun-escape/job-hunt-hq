import { priorityScore } from "./scoring";
import type { Application, Settings, StatusEntry } from "./types";

export interface KanbanColumn {
  status: StatusEntry;
  apps: Application[];
}
const GROUP_ORDER = { open: 0, won: 1, lost: 2 } as const;

/** One column per status: open statuses by stage (closed groups only when asked), archived ones only while occupied;
 * cards ranked by priority score (unscored last), then most recently updated. */
export function kanbanColumns(apps: Application[], settings: Settings, includeClosed: boolean): KanbanColumn[] {
  const occupied = new Set(apps.map((a) => a.statusId));
  const statuses = settings.pickLists.statuses
    .filter((s) => (s.group === "open" || includeClosed) && (!s.archived || occupied.has(s.id)))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.stageRank - b.stageRank || settings.pickLists.statuses.indexOf(a) - settings.pickLists.statuses.indexOf(b));
  const rank = (a: Application) => priorityScore(a, settings.priorityWeights) ?? -1;
  return statuses.map((status) => ({
    status,
    apps: apps.filter((a) => a.statusId === status.id).sort((x, y) => rank(y) - rank(x) || y.updatedAt.localeCompare(x.updatedAt)),
  }));
}
