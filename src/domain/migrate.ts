import { SCHEMA_VERSION } from "./defaults";
import type { Settings } from "./types";

export interface Migration {
  to: number;
  apply: (settings: Settings) => Settings;
}

/** Add one entry per schema bump, ascending by `to`. */
export const MIGRATIONS: Migration[] = [];

export function migrateSettings(settings: Settings, migrations: Migration[] = MIGRATIONS, target: number = SCHEMA_VERSION): Settings {
  let current = settings;
  for (const m of migrations) {
    if (m.to > current.schemaVersion && m.to <= target) current = { ...m.apply(current), schemaVersion: m.to };
  }
  return current;
}
