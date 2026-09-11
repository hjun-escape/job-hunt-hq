import { DateTime } from "luxon";
import type { Deadline, ZonedInstant } from "./types";

export function isValidZone(tz: string): boolean {
  return DateTime.utc().setZone(tz).isValid;
}

function parseLocal(value: string, tz: string): DateTime {
  const dt = DateTime.fromISO(value, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid date "${value}" for zone ${tz}: ${dt.invalidReason}`);
  return dt;
}

export function localToUtcIso(local: string, tz: string): string {
  return parseLocal(local, tz).toUTC().toISO() as string;
}

export function makeDeadline(value: string, tz: string, dateOnly: boolean): Deadline {
  const dt = dateOnly ? parseLocal(value, tz).endOf("day") : parseLocal(value, tz);
  return { at: dt.toUTC().toISO() as string, tz, dateOnly };
}

export function makeZoned(value: string, tz: string): ZonedInstant {
  return { at: localToUtcIso(value, tz), tz };
}

export function formatInstant(iso: string, tz: string, opts: { dateOnly?: boolean } = {}): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) return iso;
  return opts.dateOnly ? dt.toFormat("yyyy-MM-dd (ccc)") : dt.toFormat("yyyy-MM-dd (ccc) HH:mm ZZZZ");
}

export function formatForHome(z: ZonedInstant & { dateOnly?: boolean }, homeTz: string): { home: string; source: string | null } {
  if (z.dateOnly) return { home: formatInstant(z.at, z.tz, { dateOnly: true }), source: null };
  const home = formatInstant(z.at, homeTz);
  const source = z.tz !== homeTz ? formatInstant(z.at, z.tz) : null;
  return { home, source };
}

export function toLocalInputValue(iso: string, tz: string, dateOnly: boolean): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) return "";
  return dateOnly ? dt.toFormat("yyyy-MM-dd") : dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

export function todayIso(homeTz: string, now: DateTime = DateTime.utc()): string {
  return now.setZone(homeTz).toISODate() as string;
}

export function daysUntil(iso: string, homeTz: string, now: DateTime = DateTime.utc()): number {
  const target = DateTime.fromISO(iso, { zone: "utc" }).setZone(homeTz).startOf("day");
  const today = now.setZone(homeTz).startOf("day");
  return Math.round(target.diff(today, "days").days);
}

export function isPastDate(isoDate: string, homeTz: string, now: DateTime = DateTime.utc()): boolean {
  return isoDate < todayIso(homeTz, now);
}

export type Urgency = "overdue" | "urgent" | "soon" | "later";
export function urgency(daysLeft: number): Urgency {
  if (daysLeft < 0) return "overdue";
  if (daysLeft < 2) return "urgent";
  if (daysLeft < 7) return "soon";
  return "later";
}
