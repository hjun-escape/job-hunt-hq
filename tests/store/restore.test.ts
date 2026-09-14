import { describe, it, expect, vi } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { buildBackup, planRestore } from "../../src/domain/backup";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { Repository } from "../../src/store/repository";
import { runRestore } from "../../src/store/restore";
import { createStore } from "../../src/store/store";
import { startSync } from "../../src/store/sync";

const NOW = "2026-09-14T00:00:00.000Z";
async function boot(wrap?: (db: DB) => DB) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  const store = createStore();
  const handle = startSync(db, store, { homeTz: "America/Toronto", now: () => NOW });
  await handle.ready;
  return { db, store, repo: new Repository(wrap ? wrap(db) : db, store, () => NOW) };
}
const backup = () => buildBackup({
  settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW),
  applications: { app_1: buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) },
  companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {},
}, NOW);

describe("runRestore", () => {
  it("applies every step in order and reports progress", async () => {
    const { db, store, repo } = await boot();
    const steps = planRestore(backup(), store.getState(), "merge");
    const progress: number[] = [];
    const r = await runRestore(repo, steps, { onProgress: (p) => progress.push(p.done) });
    expect(r).toEqual({ written: 4, deleted: 0, total: 4 });
    expect(progress).toEqual([1, 2, 3, 4]);
    expect((await db.doc("applications/app_1").get()).exists).toBe(true);
    expect(store.getState().companies.co_1?.name).toBe("Shopify");
  });

  it("backs off on resource_exhausted and continues", async () => {
    let failures = 2;
    const { repo, db } = await boot((real) => ({
      ...real,
      doc: (path: string) => {
        const ref = real.doc(path);
        return { ...ref, set: async (body: Record<string, unknown>) => { if (path.startsWith("companies/") && failures-- > 0) throw { code: "resource_exhausted", message: "slow down" }; return ref.set(body); } };
      },
    }) as unknown as DB);
    const wait = vi.fn(async () => {});
    const r = await runRestore(repo, planRestore(backup(), { applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, "merge"), { wait });
    expect(r.written).toBe(4);
    expect(wait).toHaveBeenCalledTimes(2);
    expect((await db.doc("companies/co_1").get()).exists).toBe(true);
  });

  it("stops on quota_exceeded and reports how far it got", async () => {
    const { repo } = await boot((real) => ({
      ...real,
      doc: (path: string) => {
        const ref = real.doc(path);
        return { ...ref, set: async (body: Record<string, unknown>) => { if (path.startsWith("applications/")) throw { code: "quota_exceeded", message: "full" }; return ref.set(body); } };
      },
    }) as unknown as DB);
    const r = await runRestore(repo, planRestore(backup(), { applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, "merge"), { wait: async () => {} });
    expect(r).toMatchObject({ written: 3, stopped: "quota_exceeded", total: 4 });
  });

  it("deletes what a replace plan says to delete", async () => {
    const { repo, db, store } = await boot();
    await repo.createCompany({ name: "Old" });
    const oldId = Object.keys(store.getState().companies)[0];
    const r = await runRestore(repo, planRestore(backup(), store.getState(), "replace"), { wait: async () => {} });
    expect(r.deleted).toBe(1);
    expect((await db.doc(`companies/${oldId}`).get()).exists).toBe(false);
  });
});
