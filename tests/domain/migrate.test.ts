import { describe, it, expect } from "vitest";
import { defaultSettings, SCHEMA_VERSION } from "../../src/domain/defaults";
import { migrateSettings, type Migration } from "../../src/domain/migrate";

const NOW = "2026-09-11T00:00:00.000Z";

describe("migrateSettings", () => {
  it("is a no-op at the current version", () => {
    const s = defaultSettings("UTC", NOW);
    expect(migrateSettings(s)).toBe(s);
  });
  it("applies pending migrations in order and stamps the version", () => {
    const s = { ...defaultSettings("UTC", NOW), schemaVersion: 1 };
    const log: number[] = [];
    const migrations: Migration[] = [
      { to: 2, apply: (x) => { log.push(2); return { ...x, followUpCadenceDays: 10 }; } },
      { to: 3, apply: (x) => { log.push(3); return { ...x, displayCurrency: "USD" }; } },
    ];
    const out = migrateSettings(s, migrations, 3);
    expect(log).toEqual([2, 3]);
    expect(out.schemaVersion).toBe(3);
    expect(out.followUpCadenceDays).toBe(10);
    expect(out.displayCurrency).toBe("USD");
  });
  it("skips migrations at or below the stored version", () => {
    const s = { ...defaultSettings("UTC", NOW), schemaVersion: 2 };
    const migrations: Migration[] = [{ to: 2, apply: () => { throw new Error("must not run"); } }];
    expect(migrateSettings(s, migrations, 2).schemaVersion).toBe(2);
  });
  it("SCHEMA_VERSION is 1 for this plan", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
  it("refuses an unordered migration list", () => {
    const s = defaultSettings("UTC", "2026-09-14T00:00:00.000Z");
    expect(() => migrateSettings({ ...s, schemaVersion: 0 }, [{ to: 2, apply: (x) => x }, { to: 1, apply: (x) => x }], 2)).toThrow(/ascending/);
  });
});
