import { SCHEMA_VERSION } from "./defaults";
import type { Settings } from "./types";

export interface Migration {
  to: number;
  apply: (settings: Settings) => Settings;
}

/** Add one entry per schema bump, ascending by `to`. */
export const MIGRATIONS: Migration[] = [];

export function migrateSettings(settings: Settings, migrations: Migration[] = MIGRATIONS, target: number = SCHEMA_VERSION): Settings {
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].to <= migrations[i - 1].to) throw new Error("Migrations must be sorted ascending by 'to'.");
  }
  let current = settings;
  for (const m of migrations) {
    if (m.to > current.schemaVersion && m.to <= target) current = { ...m.apply(current), schemaVersion: m.to };
  }
  return current;
}
