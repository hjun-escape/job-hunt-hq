import { DateTime } from "luxon";
import type { Application, Contact, Interview, StatusEntry } from "./types";

export function contactLinks(contactId: string, apps: Application[], interviews: Interview[]) {
  return {
    asReferrer: apps.filter((a) => a.referrerContactId === contactId),
    asRecruiter: apps.filter((a) => a.recruiterContactId === contactId),
    asInterviewer: interviews.filter((i) => i.interviewerContactIds.includes(contactId)),
  };
}

export function isContactReferenced(contactId: string, apps: Application[], interviews: Interview[]): boolean {
  const l = contactLinks(contactId, apps, interviews);
  return l.asReferrer.length + l.asRecruiter.length + l.asInterviewer.length > 0;
}

export interface FollowUp {
  due: boolean;
  daysSince: number | null;
  reason: string;
}

/** Spec §4: a contact is flagged when linked (as referrer or recruiter) to an open application and
 * either never contacted or last contacted longer ago than their cadence. */
export function followUpDue(contact: Contact, apps: Application[], statuses: StatusEntry[], cadenceDays: number, today: string): FollowUp {
  const open = new Set(statuses.filter((s) => s.group === "open").map((s) => s.id));
  const linkedOpen = apps.some((a) => open.has(a.statusId) && (a.referrerContactId === contact.id || a.recruiterContactId === contact.id));
  if (!linkedOpen) return { due: false, daysSince: null, reason: "" };
  if (!contact.lastContactedAt) return { due: true, daysSince: null, reason: "Never contacted" };
  const days = Math.round(DateTime.fromISO(today).diff(DateTime.fromISO(contact.lastContactedAt), "days").days);
  const cadence = contact.followUpEveryDays ?? cadenceDays;
  return { due: days > cadence, daysSince: days, reason: `Last contacted ${days} days ago` };
}
