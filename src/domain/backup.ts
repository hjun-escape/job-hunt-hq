import { SCHEMA_VERSION } from "./defaults";
import { MIGRATIONS, migrateSettings, type Migration } from "./migrate";
import type { Answer, Application, AssetDoc, CollectionName, Company, Contact, EntityMap, Interview, PrepItem, Profile, RecordSets, Settings } from "./types";

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
  const settings = raw.settings;
  if (!isObject(settings) || !isObject(settings.pickLists)) problems.push("settings.pickLists is missing.");
  if (!isObject(raw.profile)) problems.push("profile is missing.");
  const lists = isObject(settings) && isObject(settings.pickLists) ? (settings.pickLists as Record<string, unknown>) : {};
  const idsOf = (list: string): Set<string> => new Set(Array.isArray(lists[list]) ? (lists[list] as { id?: unknown }[]).map((e) => String(e.id)) : []);
  for (const name of RESTORE_ORDER) {
    const arr = raw[name];
    if (!Array.isArray(arr)) { problems.push(`${name} must be an array.`); continue; }
    arr.forEach((doc, i) => {
      if (!isObject(doc) || typeof doc.id !== "string" || !doc.id) { problems.push(`${name}[${i}] has no string id.`); return; }
      for (const [field, list] of PICK_REFS[name] ?? []) {
        const v = doc[field];
        if (typeof v === "string" && v && !idsOf(list).has(v)) problems.push(`${name}[${i}] (${doc.id}) references ${field} "${v}" which is not in the backup's ${list}.`);
      }
    });
  }
  return problems.length ? { ok: false, problems } : { ok: true, backup: raw as unknown as Backup };
}

/** Merge upserts every document; replace also deletes current documents the backup does not carry. Settings/profile first. */
export function planRestore(backup: Backup, current: RecordSets, mode: RestoreMode, migrations: Migration[] = MIGRATIONS): RestoreStep[] {
  const steps: RestoreStep[] = [
    { kind: "settings", settings: migrateSettings({ ...backup.settings, schemaVersion: backup.settings.schemaVersion ?? backup.schemaVersion }, migrations) },
    { kind: "profile", profile: backup.profile },
  ];
  if (mode === "replace") {
    for (const name of RESTORE_ORDER) {
      const keep = new Set((backup[name] as { id: string }[]).map((d) => d.id));
      for (const id of Object.keys(current[name])) if (!keep.has(id)) steps.push({ kind: "delete", collection: name, id });
    }
  }
  for (const name of RESTORE_ORDER) for (const doc of backup[name] as EntityMap[CollectionName][]) steps.push({ kind: "write", collection: name, doc });
  return steps;
}
