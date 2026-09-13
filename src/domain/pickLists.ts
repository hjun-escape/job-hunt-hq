import type { PickEntry, PickListName, RecordSets } from "./types";

export const PICK_LIST_LABELS: Record<PickListName, string> = {
  statuses: "Statuses",
  channels: "Channels",
  countries: "Countries",
  workModes: "Work modes",
  employmentTypes: "Employment types",
  hiringTracks: "Hiring tracks",
  levels: "Levels",
  roleFamilies: "Role families",
  roundTypes: "Interview round types",
  contactRelationships: "Contact relationships",
  assetKinds: "Asset kinds",
  answerKinds: "Answer kinds",
  answerThemes: "Answer themes",
  prepKinds: "Prep kinds",
  closedReasons: "Closed reasons",
};

/** Lower-case, letters and digits of any script, hyphen-joined, unique within `existing`. */
export function slugId(label: string, existing: PickEntry[]): string {
  const base = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "item";
  const taken = new Set(existing.map((e) => e.id));
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export function addEntry<T extends PickEntry>(list: T[], entry: T): T[] {
  if (list.some((e) => e.id === entry.id)) throw new Error(`Duplicate id "${entry.id}"`);
  if (!entry.label.trim()) throw new Error("Label is required");
  return [...list, entry];
}

export function updateEntry<T extends PickEntry>(list: T[], id: string, patch: Partial<Omit<T, "id">>): T[] {
  return list.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

export function moveEntry<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export function removeEntry<T extends PickEntry>(list: T[], id: string): T[] {
  return list.filter((e) => e.id !== id);
}

type Records = RecordSets;

/** Ids of a pick list that existing records point at. Such entries may be archived but not deleted. */
export function referencedPickIds(records: Records, name: PickListName): Set<string> {
  const ids = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === "string" && v) ids.add(v);
    else if (Array.isArray(v)) v.forEach(add);
  };
  const apps = Object.values(records.applications);
  const assets = Object.values(records.assets);
  switch (name) {
    case "statuses": apps.forEach((a) => add(a.statusId)); break;
    case "channels": apps.forEach((a) => add(a.channelId)); break;
    case "countries":
      apps.forEach((a) => add(a.countryId));
      assets.forEach((x) => add(x.targetCountryIds));
      Object.values(records.companies).forEach((c) => add(Object.keys(c.sponsorship)));
      break;
    case "workModes": apps.forEach((a) => add(a.workModeId)); break;
    case "employmentTypes": apps.forEach((a) => add(a.employmentTypeId)); break;
    case "hiringTracks": apps.forEach((a) => add(a.hiringTrackId)); break;
    case "levels": apps.forEach((a) => add(a.levelId)); break;
    case "roleFamilies":
      apps.forEach((a) => add(a.roleFamilyId));
      assets.forEach((x) => add(x.targetRoleFamilyIds));
      break;
    case "roundTypes": Object.values(records.interviews).forEach((i) => add(i.roundTypeId)); break;
    case "contactRelationships": Object.values(records.contacts).forEach((c) => add(c.relationshipId)); break;
    case "assetKinds": assets.forEach((x) => add(x.kindId)); break;
    case "answerKinds": Object.values(records.answers).forEach((x) => add(x.kindId)); break;
    case "answerThemes": Object.values(records.answers).forEach((x) => add(x.themeIds)); break;
    case "prepKinds": Object.values(records.prep).forEach((x) => add(x.kindId)); break;
    case "closedReasons": apps.forEach((a) => add(a.closedReasonId)); break;
  }
  return ids;
}
