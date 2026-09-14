import { defaultPickLists, defaultProfile, defaultSettings, SCHEMA_VERSION } from "./defaults";
import { buildAnswer, buildApplication, buildAsset, buildCompany, buildContact, buildInterview, buildPrep } from "./factories";
import { nowIso } from "./ids";
import { MIGRATIONS, migrateSettings, type Migration } from "./migrate";
import type { Answer, Application, AssetDoc, CollectionName, Company, Contact, EntityMap, Interview, PickEntry, PickLists, PrepItem, Profile, RecordSets, Settings } from "./types";

const PICK_LIST_NAMES: (keyof PickLists)[] = [
  "statuses", "channels", "countries", "workModes", "employmentTypes", "hiringTracks", "levels",
  "roleFamilies", "roundTypes", "contactRelationships", "assetKinds", "answerKinds", "answerThemes",
  "prepKinds", "closedReasons",
];
const PROFILE_ARRAY_FIELDS = ["phones", "addresses", "links", "education", "employment"] as const;
const PROFILE_OBJECT_FIELDS = ["salaryExpectations", "workAuth"] as const;

export interface Backup {
  app: "job-hunt-hq";
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  profile: Profile;
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  assets: AssetDoc[];
  answers: Answer[];
  interviews: Interview[];
  prep: PrepItem[];
}
export type RestoreMode = "merge" | "replace";
export type RestoreStep =
  | { kind: "settings"; settings: Settings }
  | { kind: "profile"; profile: Profile }
  | { kind: "delete"; collection: CollectionName; id: string }
  | { kind: "write"; collection: CollectionName; doc: EntityMap[CollectionName] };

/** Parents before children so references resolve while restoring. */
export const RESTORE_ORDER: CollectionName[] = ["companies", "contacts", "assets", "answers", "applications", "interviews", "prep"];

export function buildBackup(state: RecordSets & { settings: Settings; profile: Profile }, now: string): Backup {
  return {
    app: "job-hunt-hq",
    schemaVersion: state.settings.schemaVersion,
    exportedAt: now,
    settings: state.settings,
    profile: state.profile,
    applications: Object.values(state.applications),
    companies: Object.values(state.companies),
    contacts: Object.values(state.contacts),
    assets: Object.values(state.assets),
    answers: Object.values(state.answers),
    interviews: Object.values(state.interviews),
    prep: Object.values(state.prep),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The store's document-id path grammar: no ".", "..", or "/" -- Firestore-style path segments. */
const DOC_ID = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/;

/** Settings scalars a backup must carry with the right type before they can be trusted; anything else falls back to defaults. */
const SETTINGS_SCALARS: [field: keyof Settings, check: (v: unknown) => boolean][] = [
  ["homeTz", (v) => typeof v === "string" && v.length > 0],
  ["displayCurrency", (v) => typeof v === "string" && v.length > 0],
  ["followUpCadenceDays", (v) => typeof v === "number" && Number.isFinite(v)],
  ["fxRates", (v) => isObject(v) && Object.values(v).every((n) => typeof n === "number" && Number.isFinite(n))],
  ["priorityWeights", (v) => isObject(v) && ["desire", "fit", "likelihood"].every((k) => typeof v[k] === "number")],
];

/** Which pick list each foreign key on a record must resolve against. */
const PICK_REFS: Partial<Record<CollectionName, [field: string, list: string][]>> = {
  applications: [["statusId", "statuses"], ["channelId", "channels"], ["countryId", "countries"]],
  contacts: [["relationshipId", "contactRelationships"]],
  assets: [["kindId", "assetKinds"]],
  answers: [["kindId", "answerKinds"]],
  interviews: [["roundTypeId", "roundTypes"]],
  prep: [["kindId", "prepKinds"]],
};

/** Spec §4: accepted when schemaVersion ≤ current, every collection is an array of objects with string ids,
 * and referenced pick-list ids exist in the backup's own settings; otherwise readable problems and no writes. */
export function validateBackup(raw: unknown, currentVersion: number = SCHEMA_VERSION): { ok: true; backup: Backup } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(raw)) return { ok: false, problems: ["The file is not a JSON object."] };
  if (raw.app !== "job-hunt-hq") problems.push('This is not a Job Hunt HQ backup (missing app: "job-hunt-hq").');
  if (typeof raw.schemaVersion !== "number") problems.push("schemaVersion is missing.");
  else if (raw.schemaVersion > currentVersion) problems.push(`schemaVersion ${raw.schemaVersion} is newer than this app understands (${currentVersion}). Update the app first.`);
  if (typeof raw.exportedAt !== "string" || !raw.exportedAt) problems.push("exportedAt is missing.");
  const settings = raw.settings;
  let listsPresent = false;
  if (!isObject(settings)) {
    problems.push("settings is missing.");
  } else {
    for (const [field, ok] of SETTINGS_SCALARS) if (!ok(settings[field])) problems.push(`settings.${field} is missing or has the wrong type.`);
    if (settings.schemaVersion !== undefined && !(typeof settings.schemaVersion === "number" && Number.isFinite(settings.schemaVersion))) {
      problems.push("settings.schemaVersion has the wrong type.");
    }
    if (!isObject(settings.pickLists)) {
      problems.push("settings.pickLists is missing.");
    } else {
      listsPresent = true;
      const pickLists = settings.pickLists as Record<string, unknown>;
      for (const name of PICK_LIST_NAMES) {
        const list = pickLists[name];
        if (!Array.isArray(list)) { problems.push(`settings.pickLists.${name} is missing or not a list.`); continue; }
        list.forEach((entry: unknown, i: number) => {
          if (!isObject(entry) || typeof entry.id !== "string" || !entry.id || typeof entry.label !== "string" || !entry.label) {
            problems.push(`settings.pickLists.${name}[${i}] needs id and label.`);
            return;
          }
          if (name === "statuses") {
            const stageRank = entry.stageRank;
            const group = entry.group;
            if (typeof stageRank !== "number" || (group !== "open" && group !== "won" && group !== "lost")) {
              problems.push(`settings.pickLists.statuses[${i}] needs group and stageRank.`);
            }
          }
        });
      }
    }
  }
  if (!isObject(raw.profile)) {
    problems.push("profile is missing.");
  } else {
    const profile = raw.profile;
    for (const field of PROFILE_ARRAY_FIELDS) if (!Array.isArray(profile[field])) problems.push(`profile.${field} is missing.`);
    for (const field of PROFILE_OBJECT_FIELDS) if (!isObject(profile[field])) problems.push(`profile.${field} is missing.`);
  }
  const lists = isObject(settings) && isObject(settings.pickLists) ? (settings.pickLists as Record<string, unknown>) : {};
  const idsOf = (list: string): Set<string> => new Set(Array.isArray(lists[list]) ? (lists[list] as { id?: unknown }[]).map((e) => String(e.id)) : []);
  for (const name of RESTORE_ORDER) {
    const arr = raw[name];
    if (!Array.isArray(arr)) { problems.push(`${name} must be an array.`); continue; }
    arr.forEach((doc, i) => {
      if (!isObject(doc) || typeof doc.id !== "string" || !doc.id) { problems.push(`${name}[${i}] has no string id.`); return; }
      if (!DOC_ID.test(doc.id)) { problems.push(`${name}[${i}] has an invalid id "${doc.id}" (letters, digits, _ - . ~ : @ + only).`); return; }
      if (!listsPresent) return;
      for (const [field, list] of PICK_REFS[name] ?? []) {
        const v = doc[field];
        if (typeof v === "string" && v && !idsOf(list).has(v)) problems.push(`${name}[${i}] (${doc.id}) references ${field} "${v}" which is not in the backup's ${list}.`);
      }
    });
  }
  return problems.length ? { ok: false, problems } : { ok: true, backup: raw as unknown as Backup };
}

/** Backup's entries first, then current entries whose id the backup lacks -- for every pick list. */
function unionPickLists(backupLists: PickLists, currentLists: PickLists): PickLists {
  const merged: Record<string, PickEntry[]> = {};
  for (const key of Object.keys(backupLists) as (keyof PickLists)[]) {
    const backupList = backupLists[key] as PickEntry[];
    const currentList = (currentLists[key] ?? []) as PickEntry[];
    const ids = new Set(backupList.map((e) => e.id));
    merged[key] = [...backupList, ...currentList.filter((e) => !ids.has(e.id))];
  }
  return merged as unknown as PickLists;
}

/** Runs a possibly-incomplete document through its collection's factory so absent optional
 * fields (arrays, strings) get their defaults; present fields, including `updatedAt`, win. */
function normalizeDoc(name: CollectionName, doc: EntityMap[CollectionName], now: string): EntityMap[CollectionName] {
  const id = doc.id;
  const createdAt = doc.createdAt ?? now;
  switch (name) {
    case "applications": return buildApplication(doc as never, id, createdAt);
    case "companies": return buildCompany(doc as never, id, createdAt);
    case "contacts": return buildContact(doc as never, id, createdAt);
    case "assets": return buildAsset(doc as never, id, createdAt);
    case "answers": return buildAnswer(doc as never, id, createdAt);
    case "interviews": return buildInterview(doc as never, id, createdAt);
    case "prep": return buildPrep(doc as never, id, createdAt);
    default: throw new Error(`Unknown collection ${name as string}`);
  }
}

/** Merge upserts every document; replace also deletes current documents the backup does not carry. Settings/profile first.
 * Merge keeps pick-list entries the backup lacks but current data has; replace keeps the backup's lists as they are.
 * Every document, and the backup's own settings/profile, are normalized through their defaults/factory first so a
 * structurally incomplete backup (missing arrays, missing pick lists) still restores instead of bricking the page. */
export function planRestore(
  backup: Backup,
  current: RecordSets & { settings?: Settings | null; profile?: Profile | null },
  mode: RestoreMode,
  opts: { migrations?: Migration[]; now?: string; homeTz?: string } = {},
): RestoreStep[] {
  const migrations = opts.migrations ?? MIGRATIONS;
  const now = opts.now ?? nowIso();
  const homeTz = opts.homeTz ?? current.settings?.homeTz ?? "UTC";
  const schemaVersion = typeof backup.settings?.schemaVersion === "number" && Number.isFinite(backup.settings.schemaVersion)
    ? backup.settings.schemaVersion
    : backup.schemaVersion;
  const normalizedBackupSettings: Settings = { ...defaultSettings(homeTz, now) };
  for (const [field, ok] of SETTINGS_SCALARS) {
    const v = (backup.settings as unknown as Record<string, unknown> | undefined)?.[field];
    if (ok(v)) (normalizedBackupSettings as unknown as Record<string, unknown>)[field] = v;
  }
  normalizedBackupSettings.schemaVersion = schemaVersion;
  normalizedBackupSettings.pickLists = { ...defaultPickLists(), ...backup.settings?.pickLists };
  const migratedSettings = migrateSettings(normalizedBackupSettings, migrations);
  const settings: Settings = mode === "merge" && current.settings
    ? { ...migratedSettings, pickLists: unionPickLists(migratedSettings.pickLists, current.settings.pickLists) }
    : migratedSettings;
  const profile: Profile = { ...defaultProfile(now), ...backup.profile };
  const steps: RestoreStep[] = [
    { kind: "settings", settings },
    { kind: "profile", profile },
  ];
  if (mode === "replace") {
    for (const name of RESTORE_ORDER) {
      const keep = new Set((backup[name] as { id: string }[]).map((d) => d.id));
      for (const id of Object.keys(current[name])) if (!keep.has(id)) steps.push({ kind: "delete", collection: name, id });
    }
  }
  for (const name of RESTORE_ORDER) for (const doc of backup[name] as EntityMap[CollectionName][]) steps.push({ kind: "write", collection: name, doc: normalizeDoc(name, doc, now) });
  return steps;
}
