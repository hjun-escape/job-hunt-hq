import { DateTime } from "luxon";
import { formatForHome } from "./dates";
import type { Interview, ZonedInstant } from "./types";

export type Bucket = "today" | "thisWeek" | "nextWeek" | "later" | "unscheduled" | "past";
export const BUCKET_ORDER: Bucket[] = ["today", "thisWeek", "nextWeek", "later", "unscheduled", "past"];
export const BUCKET_LABELS: Record<Bucket, string> = {
  today: "Today", thisWeek: "This week", nextWeek: "Next week", later: "Later", unscheduled: "Not scheduled", past: "Past",
};

/** Buckets by the home-zone calendar: anything before now is past; weeks end on Sunday in the home zone. */
export function bucketFor(scheduledAt: ZonedInstant | undefined, homeTz: string, now: DateTime = DateTime.utc()): Bucket {
  if (!scheduledAt) return "unscheduled";
  const t = DateTime.fromISO(scheduledAt.at, { zone: "utc" }).setZone(homeTz);
  const local = now.setZone(homeTz);
  if (!t.isValid || t < local) return "past";
  if (t.hasSame(local, "day")) return "today";
  const weekEnd = local.endOf("week");
  if (t <= weekEnd) return "thisWeek";
  if (t <= weekEnd.plus({ weeks: 1 })) return "nextWeek";
  return "later";
}

export function groupInterviews(interviews: Interview[], homeTz: string, now?: DateTime): Record<Bucket, Interview[]> {
  const groups: Record<Bucket, Interview[]> = { today: [], thisWeek: [], nextWeek: [], later: [], unscheduled: [], past: [] };
  for (const i of interviews) groups[bucketFor(i.scheduledAt, homeTz, now)].push(i);
  const byTime = (a: Interview, b: Interview) => (a.scheduledAt?.at ?? "").localeCompare(b.scheduledAt?.at ?? "");
  for (const b of BUCKET_ORDER) {
    if (b === "past") groups[b].sort((a, c) => byTime(c, a));
    else if (b === "unscheduled") groups[b].sort((a, c) => a.createdAt.localeCompare(c.createdAt));
    else groups[b].sort(byTime);
  }
  return groups;
}

/** An application's rounds: scheduled ones in time order, then unscheduled by creation. */
export function roundsFor(applicationId: string, interviews: Interview[]): Interview[] {
  return interviews
    .filter((i) => i.applicationId === applicationId)
    .sort((a, b) => (a.scheduledAt?.at ?? "~").localeCompare(b.scheduledAt?.at ?? "~") || a.createdAt.localeCompare(b.createdAt));
}

export function formatSlot(scheduledAt: ZonedInstant | undefined, homeTz: string): string {
  if (!scheduledAt) return "Not scheduled";
  const f = formatForHome(scheduledAt, homeTz);
  return f.source ? `${f.home} · ${f.source} there` : f.home;
}
