import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { defaultSettings } from "../../src/domain/defaults";
import { createStore } from "../../src/store/store";
import { startSync } from "../../src/store/sync";

const NOW = "2026-09-11T00:00:00.000Z";

describe("startSync", () => {
  it("seeds settings and profile on an empty store and becomes ready", async () => {
    const db = createFakeDb();
    const store = createStore();
    const h = startSync(db, store, { homeTz: "Asia/Seoul", now: () => NOW });
    await h.ready;
    const s = store.getState();
    expect(s.ready).toBe(true);
    expect(s.readOnly).toBe(false);
    expect(s.settings?.homeTz).toBe("Asia/Seoul");
    expect(s.settings?.pickLists.statuses).toHaveLength(13);
    expect(s.profile?.workAuth.KR).toBeDefined();
    expect((await db.doc("settings/main").get()).exists).toBe(true);
    expect((await db.doc("profile/main").get()).exists).toBe(true);
    h.stop();
  });

  it("keeps existing settings and mirrors collection changes live", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set({ ...defaultSettings("UTC", NOW), homeTz: "America/Toronto" } as unknown as Record<string, unknown>);
    const store = createStore();
    const h = startSync(db, store, { homeTz: "Asia/Seoul", now: () => NOW });
    await h.ready;
    expect(store.getState().settings?.homeTz).toBe("America/Toronto");
    await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify" });
    expect(store.getState().companies.co_1?.name).toBe("Shopify");
    await db.doc("companies/co_1").delete();
    expect(store.getState().companies.co_1).toBeUndefined();
    h.stop();
    await db.doc("companies/co_2").set({ id: "co_2", name: "After stop" });
    expect(store.getState().companies.co_2).toBeUndefined();
  });

  it("marks the store read-only on a terminal subscription error", async () => {
    const db = createFakeDb();
    const broken = {
      ...db,
      collection: (path: string) => {
        const real = db.collection(path);
        return { ...real, onSnapshot: (_next: unknown, error?: (e: DbError) => void) => { error?.({ code: "revoked", message: "gone" }); return () => {}; } } as unknown as CollectionReference;
      },
    } as unknown as DB;
    const store = createStore();
    const errors: string[] = [];
    const h = startSync(broken, store, { homeTz: "UTC", onError: (e) => errors.push(e.code) });
    await h.ready;
    expect(store.getState().readOnly).toBe(true);
    expect(errors).toContain("revoked");
    // Finding 1: fail() must be idempotent (one transition, one onError call) and must
    // seed settings/profile even though every collection subscription died before delivering data.
    expect(errors).toHaveLength(1);
    expect(store.getState().settings).not.toBeNull();
    expect(store.getState().profile).not.toBeNull();
    h.stop();
  });
});
