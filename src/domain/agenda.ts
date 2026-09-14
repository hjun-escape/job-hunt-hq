import { DateTime } from "luxon";
import { followUpDue, type FollowUp } from "./contacts";
import { todayIso } from "./dates";
import { bucketFor } from "./interviews";
import type { Application, Contact, Interview, RecordSets, Settings } from "./types";

export type AgendaKind = "deadline" | "nextAction" | "interview";
export interface AgendaItem {
  kind: AgendaKind;
  /** ISO UTC instant used for ordering and display. */
  at: string;
  dateOnly: boolean;
  /** Source zone of a deadline or interview slot; absent for next-action dates (home zone). */
  tz?: string;
  applicationId: string;
  interviewId?: string;
  company: string;
  title: string;
  detail: string;
}
export type AgendaRecords = Pick<RecordSets, "applications" | "companies" | "contacts" | "interviews">;
export interface FollowUpFlag {
  contact: Contact;
  followUp: FollowUp;
}

function openStatusIds(settings: Settings): Set<string> {
  return new Set(settings.pickLists.statuses.filter((s) => s.group === "open").map((s) => s.id));
}
function companyName(records: AgendaRecords, app: Application | undefined): string {
  return app ? (records.companies[app.companyId]?.name ?? "?") : "?";
}
function roundLabel(settings: Settings, id: string): string {
  return settings.pickLists.roundTypes.find((r) => r.id === id)?.label ?? id;
}
const byTime = (a: AgendaItem, b: AgendaItem) => a.at.localeCompare(b.at);

/** Spec §4: items dated inside [startOfToday, startOfToday + 7 days) in the home zone, one sorted list. */
export function dueThisWeek(records: AgendaRecords, settings: Settings, now: DateTime = DateTime.utc()): AgendaItem[] {
  const tz = settings.homeTz;
  const start = now.setZone(tz).startOf("day");
  const end = start.plus({ days: 7 });
  const inWindow = (t: DateTime) => t.isValid && t >= start && t < end;
  const open = openStatusIds(settings);
  const items: AgendaItem[] = [];
  for (const a of Object.values(records.applications)) {
    if (!open.has(a.statusId)) continue;
    const company = companyName(records, a);
    if (a.deadline && inWindow(DateTime.fromISO(a.deadline.at, { zone: "utc" }).setZone(tz))) {
      items.push({ kind: "deadline", at: a.deadline.at, dateOnly: a.deadline.dateOnly, tz: a.deadline.tz, applicationId: a.id, company, title: a.title, detail: "Deadline" });
    }
    if (a.nextActionDue) {
      const t = DateTime.fromISO(a.nextActionDue, { zone: tz }).startOf("day");
      if (inWindow(t)) items.push({ kind: "nextAction", at: t.toUTC().toISO() as string, dateOnly: true, applicationId: a.id, company, title: a.title, detail: `Next action: ${a.nextAction ?? "—"}` });
    }
  }
  for (const i of Object.values(records.interviews)) {
    if (!i.scheduledAt || i.outcome !== "pending") continue;
    const a = records.applications[i.applicationId];
    if (!a) continue;
    if (!inWindow(DateTime.fromISO(i.scheduledAt.at, { zone: "utc" }).setZone(tz))) continue;
    items.push({ kind: "interview", at: i.scheduledAt.at, dateOnly: false, tz: i.scheduledAt.tz, applicationId: i.applicationId, interviewId: i.id, company: companyName(records, a), title: a.title, detail: roundLabel(settings, i.roundTypeId) });
  }
  return items.sort(byTime);
}

/** Spec §4: open applications with a next action due before today, or a passed deadline with no appliedAt. */
export function overdue(records: AgendaRecords, settings: Settings, now: DateTime = DateTime.utc()): AgendaItem[] {
  const tz = settings.homeTz;
  const today = todayIso(tz, now);
  const open = openStatusIds(settings);
  const items: AgendaItem[] = [];
  for (const a of Object.values(records.applications)) {
    if (!open.has(a.statusId)) continue;
    const company = companyName(records, a);
    if (a.nextActionDue && a.nextActionDue < today) {
      const t = DateTime.fromISO(a.nextActionDue, { zone: tz }).startOf("day");
      items.push({ kind: "nextAction", at: t.toUTC().toISO() as string, dateOnly: true, applicationId: a.id, company, title: a.title, detail: `Next action: ${a.nextAction ?? "—"}` });
    }
    if (a.deadline && !a.appliedAt && DateTime.fromISO(a.deadline.at, { zone: "utc" }) < now) {
      items.push({ kind: "deadline", at: a.deadline.at, dateOnly: a.deadline.dateOnly, tz: a.deadline.tz, applicationId: a.id, company, title: a.title, detail: "Deadline passed, not applied" });
    }
  }
  return items.sort(byTime);
}

/** Contacts due for a follow-up (spec §4), never-contacted first, then the longest-waiting. */
export function followUpFlags(records: AgendaRecords, settings: Settings, now: DateTime = DateTime.utc()): FollowUpFlag[] {
  const apps = Object.values(records.applications);
  const today = todayIso(settings.homeTz, now);
  const rank = (f: FollowUp) => f.daysSince ?? Number.MAX_SAFE_INTEGER;
  return Object.values(records.contacts)
    .map((contact) => ({ contact, followUp: followUpDue(contact, apps, settings.pickLists.statuses, settings.followUpCadenceDays, today) }))
    .filter((f) => f.followUp.due)
    .sort((a, b) => rank(b.followUp) - rank(a.followUp));
}

/** Pending, scheduled, not yet past — soonest first. Skips interviews whose application is gone when `applications` is given. */
export function upcomingInterviews(interviews: Interview[], homeTz: string, now: DateTime = DateTime.utc(), limit = 5, applications?: Record<string, Application>): Interview[] {
  return interviews
    .filter((i): i is Interview & { scheduledAt: NonNullable<Interview["scheduledAt"]> } => !!i.scheduledAt && i.outcome === "pending" && bucketFor(i.scheduledAt, homeTz, now) !== "past" && (!applications || i.applicationId in applications))
    .sort((a, b) => a.scheduledAt.at.localeCompare(b.scheduledAt.at))
    .slice(0, limit);
}
