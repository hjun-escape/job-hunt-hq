import { describe, it, expect } from "vitest";
import { buildBackup, planRestore, validateBackup } from "../../src/domain/backup";
import { SCHEMA_VERSION, defaultPickLists, defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { Application, RecordSets, Settings } from "../../src/domain/types";

const NOW = "2026-09-14T00:00:00.000Z";
const empty = (): RecordSets => ({ applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} });
const state = () => ({
  settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW),
  ...empty(),
  companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW) },
  applications: { app_1: buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) },
});

describe("backup", () => {
  it("builds a backup envelope with every collection and no file bytes", () => {
    const b = buildBackup(state(), NOW);
    expect(b).toMatchObject({ app: "job-hunt-hq", schemaVersion: SCHEMA_VERSION, exportedAt: NOW });
    expect(b.applications.map((a) => a.id)).toEqual(["app_1"]);
    expect(b.companies).toHaveLength(1);
    expect(b.prep).toEqual([]);
    expect(JSON.stringify(b)).not.toContain("_blobs");
  });

  it("round-trips through validation", () => {
    const b = buildBackup(state(), NOW);
    const v = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(v.ok).toBe(true);
  });

  it("rejects a newer schema, malformed collections, and unknown pick-list ids with readable problems", () => {
    const b = buildBackup(state(), NOW) as unknown as Record<string, unknown>;
    const bad = { ...b, schemaVersion: SCHEMA_VERSION + 1, contacts: "nope", applications: [{ ...(b.applications as object[])[0], statusId: "ghost-status" }, { title: "no id" }] };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/schemaVersion 2 is newer/),
      expect.stringMatching(/contacts must be an array/),
      expect.stringMatching(/applications\[0\].*statusId "ghost-status"/),
      expect.stringMatching(/applications\[1\].*id/),
    ]));
    expect(validateBackup("not an object")).toMatchObject({ ok: false });
    expect(validateBackup({ ...b, app: "other" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/job-hunt-hq/)] });
  });

  it("plans a merge as settings, profile, then upserts in dependency order", () => {
    const b = buildBackup(state(), NOW);
    const steps = planRestore(b, empty(), "merge");
    expect(steps.map((s) => s.kind)).toEqual(["settings", "profile", "write", "write"]);
    expect(steps.slice(2).map((s) => (s.kind === "write" ? `${s.collection}/${s.doc.id}` : ""))).toEqual(["companies/co_1", "applications/app_1"]);
  });

  it("plans a replace as deletes of every current document the backup lacks, before the writes", () => {
    const b = buildBackup(state(), NOW);
    const current = { ...empty(), companies: { co_9: buildCompany({ name: "Gone" }, "co_9", NOW), co_1: buildCompany({ name: "Kept" }, "co_1", NOW) } };
    const steps = planRestore(b, current, "replace");
    expect(steps.map((s) => (s.kind === "delete" ? `delete ${s.collection}/${s.id}` : s.kind))).toEqual(["settings", "profile", "delete companies/co_9", "write", "write"]);
  });

  it("migrates an older backup's settings forward while planning", () => {
    const b = buildBackup(state(), NOW);
    const older = { ...b, schemaVersion: 0, settings: { ...b.settings, schemaVersion: 0 } };
    const bump = [{ to: SCHEMA_VERSION, apply: (s: typeof b.settings) => ({ ...s, followUpCadenceDays: 9 }) }];
    const steps = planRestore(older as typeof b, empty(), "merge", { migrations: bump });
    expect(steps[0]).toMatchObject({ kind: "settings", settings: { schemaVersion: SCHEMA_VERSION, followUpCadenceDays: 9 } });
    expect(planRestore(b, empty(), "merge")[0]).toMatchObject({ kind: "settings", settings: { followUpCadenceDays: 7 } });
  });

  it("merge keeps a current-only status entry and takes everything else from the backup", () => {
    const b = buildBackup(state(), NOW);
    const currentSettings: Settings = {
      ...defaultSettings("America/Toronto", NOW),
      followUpCadenceDays: 30,
      pickLists: {
        ...defaultPickLists(),
        statuses: [...defaultPickLists().statuses, { id: "phone-screen", label: "Phone screen", group: "open", stageRank: 3 }],
      },
    };
    const current = { ...empty(), settings: currentSettings, profile: defaultProfile(NOW) };
    const steps = planRestore(b, current, "merge");
    const settingsStep = steps[0];
    if (settingsStep.kind !== "settings") throw new Error("expected a settings step first");
    const ids = settingsStep.settings.pickLists.statuses.map((s) => s.id);
    expect(ids).toContain("phone-screen");
    expect(ids).toEqual(expect.arrayContaining(b.settings.pickLists.statuses.map((s) => s.id)));
    expect(settingsStep.settings.followUpCadenceDays).toBe(b.settings.followUpCadenceDays);
  });

  it("replace does not union", () => {
    const b = buildBackup(state(), NOW);
    const currentSettings: Settings = {
      ...defaultSettings("America/Toronto", NOW),
      pickLists: {
        ...defaultPickLists(),
        statuses: [...defaultPickLists().statuses, { id: "phone-screen", label: "Phone screen", group: "open", stageRank: 3 }],
      },
    };
    const current = { ...empty(), settings: currentSettings, profile: defaultProfile(NOW) };
    const steps = planRestore(b, current, "replace");
    const settingsStep = steps[0];
    if (settingsStep.kind !== "settings") throw new Error("expected a settings step first");
    expect(settingsStep.settings.pickLists.statuses.map((s) => s.id)).not.toContain("phone-screen");
  });

  it("rejects settings.pickLists missing every list, a status without group/stageRank, and an empty profile", () => {
    const b = buildBackup(state(), NOW) as unknown as Record<string, unknown>;

    const missingLists = validateBackup({ ...b, settings: { pickLists: {} } });
    expect(missingLists.ok).toBe(false);
    if (missingLists.ok) return;
    for (const name of Object.keys(defaultPickLists())) {
      expect(missingLists.problems).toEqual(expect.arrayContaining([`settings.pickLists.${name} is missing or not a list.`]));
    }

    const badStatus = validateBackup({
      ...b,
      settings: { ...(b.settings as Record<string, unknown>), pickLists: { ...defaultPickLists(), statuses: [{ id: "s1", label: "S1" }] } },
    });
    expect(badStatus.ok).toBe(false);
    if (badStatus.ok) return;
    expect(badStatus.problems).toEqual(expect.arrayContaining([expect.stringMatching(/statuses\[0\] needs group and stageRank/)]));

    const emptyProfile = validateBackup({ ...b, profile: {} });
    expect(emptyProfile.ok).toBe(false);
    if (emptyProfile.ok) return;
    for (const field of ["phones", "addresses", "links", "education", "employment", "salaryExpectations", "workAuth"]) {
      expect(emptyProfile.problems).toEqual(expect.arrayContaining([`profile.${field} is missing.`]));
    }
  });

  it("normalizes a structurally incomplete document through its factory while planning a restore", () => {
    const b = buildBackup(state(), NOW);
    const incomplete = { ...b.applications[0] } as Record<string, unknown>;
    delete incomplete.tags;
    delete incomplete.answerIds;
    delete incomplete.activity;
    const backup = { ...b, applications: [incomplete] } as unknown as typeof b;
    const steps = planRestore(backup, empty(), "merge");
    const write = steps.find((s) => s.kind === "write" && s.collection === "applications");
    if (write?.kind !== "write") throw new Error("expected a write step for the application");
    const doc = write.doc as unknown as Application;
    expect(doc.tags).toEqual([]);
    expect(doc.answerIds).toEqual([]);
    expect(doc.activity).toEqual([]);
    expect(doc.title).toBe(b.applications[0].title);
    expect(doc.createdAt).toBe(b.applications[0].createdAt);
  });
  it("merge tolerates current settings that lack a list the backup carries", () => {
    const b = buildBackup(state(), NOW);
    const current = { ...empty(), settings: { ...defaultSettings("America/Toronto", NOW), pickLists: { ...defaultPickLists(), extraList: undefined } } };
    delete (current.settings.pickLists as Record<string, unknown>).prepKinds;
    expect(() => planRestore(b, current as unknown as Parameters<typeof planRestore>[1], "merge")).not.toThrow();
  });

  it("names a missing settings object precisely and skips derivative problems", () => {
    const b = buildBackup(state(), NOW) as unknown as Record<string, unknown>;
    const noSettings = validateBackup({ ...b, settings: undefined });
    expect(noSettings.ok).toBe(false);
    if (noSettings.ok) return;
    expect(noSettings.problems).toContain("settings is missing.");
    expect(noSettings.problems.some((p) => p.includes("references"))).toBe(false);
    const noLists = validateBackup({ ...b, settings: { homeTz: "UTC" } });
    if (noLists.ok) return;
    expect(noLists.problems).toContain("settings.pickLists is missing.");
    expect(noLists.problems.some((p) => p.includes("is missing or not a list"))).toBe(false);
  });

  it("rejects document ids outside the store's path grammar", () => {
    const b = buildBackup(state(), NOW);
    const bad = { ...b, companies: [{ ...b.companies[0], id: "co/evil" }, { ...b.companies[0], id: ".." }] };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toEqual(expect.arrayContaining([expect.stringMatching(/companies\[0\] has an invalid id "co\/evil"/), expect.stringMatching(/companies\[1\] has an invalid id "\.\."/)]));
  });

  it("rejects mistyped settings scalars and normalizes them away when planning", () => {
    const b = buildBackup(state(), NOW);
    const bad = { ...b, settings: { ...b.settings, priorityWeights: null, followUpCadenceDays: "7", fxRates: "x" } };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toEqual(expect.arrayContaining([
      "settings.priorityWeights is missing or has the wrong type.",
      "settings.followUpCadenceDays is missing or has the wrong type.",
      "settings.fxRates is missing or has the wrong type.",
    ]));
    const step = planRestore(bad as unknown as typeof b, empty(), "replace")[0];
    expect(step.kind).toBe("settings");
    if (step.kind !== "settings") return;
    expect(step.settings.priorityWeights).toEqual({ desire: 0.4, fit: 0.35, likelihood: 0.25 });
    expect(step.settings.followUpCadenceDays).toBe(7);
    expect(step.settings.fxRates).toEqual({});
  });

  it("rejects a mistyped settings.schemaVersion and falls back to the top-level value when planning", () => {
    const b = buildBackup(state(), NOW);
    const bad = { ...b, settings: { ...b.settings, schemaVersion: "1" } };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toContain("settings.schemaVersion has the wrong type.");
    const step = planRestore(bad as unknown as typeof b, empty(), "merge")[0];
    expect(step.kind).toBe("settings");
    if (step.kind !== "settings") return;
    expect(step.settings.schemaVersion).toBe(b.schemaVersion);
  });

  it("rejects fxRates entries that are not finite numbers", () => {
    const b = buildBackup(state(), NOW);
    const bad = { ...b, settings: { ...b.settings, fxRates: { USD: NaN } } };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toContain("settings.fxRates is missing or has the wrong type.");
  });
});
