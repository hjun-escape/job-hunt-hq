import type { ActivityEntry, Application, Settings, StatusEntry } from "./types";

export const ACTIVITY_CAP = 200;

export function findStatus(settings: Settings, id: string): StatusEntry | undefined {
  return settings.pickLists.statuses.find((s) => s.id === id);
}

export function appendActivity(app: Application, entry: Omit<ActivityEntry, "at">, now: string): Application {
  const activity = [...app.activity, { at: now, ...entry }].slice(-ACTIVITY_CAP);
  return { ...app, activity, updatedAt: now };
}

export function applyStatusChange(app: Application, next: StatusEntry, now: string, note?: string): Application {
  if (next.id === app.statusId) return app;
  const entry: Omit<ActivityEntry, "at"> = { type: "status", from: app.statusId, to: next.id, ...(note ? { text: note } : {}) };
  const withLog = appendActivity(app, entry, now);
  const closing = next.group !== "open";
  const { closedAt: _closedAt, closedReasonId: _closedReasonId, ...rest } = withLog;
  return {
    ...rest,
    statusId: next.id,
    maxStageRank: Math.max(app.maxStageRank, next.stageRank),
    ...(closing ? { closedAt: now, ...(app.closedReasonId ? { closedReasonId: app.closedReasonId } : {}) } : {}),
  };
}
