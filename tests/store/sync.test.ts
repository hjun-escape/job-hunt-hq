import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { defaultSettings } from "../../src/domain/defaults";
import { createStore } from "../../src/store/store";
import { retryOnce, startSync } from "../../src/store/sync";

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

  it("re-subscribes once after a terminated collection listener, then mirrors data normally", async () => {
    const db = createFakeDb();
    await db.doc("applications/app_1").set({ id: "app_1", title: "SWE" });
    let calls = 0;
    const flaky = {
      ...db,
      collection: (path: string) => {
        const real = db.collection(path);
        if (path !== "applications") return real;
        return {
          ...real,
          onSnapshot: (next: (s: QuerySnapshot) => void, error?: (e: DbError) => void) => {
            calls++;
            if (calls === 1) {
              queueMicrotask(() => error?.({ code: "revoked", message: "boom" }));
              return () => {};
            }
            return real.onSnapshot(next, error);
          },
        } as unknown as CollectionReference;
      },
    } as unknown as DB;
    const store = createStore();
    const errors: string[] = [];
    const h = startSync(flaky, store, { homeTz: "UTC", onError: (e) => errors.push(e.code) });
    await h.ready;
    expect(store.getState().ready).toBe(true);
    expect(store.getState().readOnly).toBe(false);
    expect(store.getState().applications.app_1?.title).toBe("SWE");
    expect(errors).toHaveLength(0);
    expect(calls).toBe(2);
    h.stop();
  });

  it("gives up and fails after a second terminated collection listener", async () => {
    const db = createFakeDb();
    const flaky = {
      ...db,
      collection: (path: string) => {
        const real = db.collection(path);
        if (path !== "applications") return real;
        return {
          ...real,
          onSnapshot: (_next: unknown, error?: (e: DbError) => void) => {
            queueMicrotask(() => error?.({ code: "revoked", message: "boom" }));
            return () => {};
          },
        } as unknown as CollectionReference;
      },
    } as unknown as DB;
    const store = createStore();
    const errors: string[] = [];
    const h = startSync(flaky, store, { homeTz: "UTC", onError: (e) => errors.push(e.code) });
    await h.ready;
    expect(store.getState().readOnly).toBe(true);
    expect(errors).toEqual(["revoked"]);
    h.stop();
  });
});

describe("retryOnce", () => {
  it("re-attaches once when the listener errors synchronously and stop() tears down the live listener", () => {
    const events: string[] = [];
    let calls = 0;
    const attach = (onError: (e: DbError) => void) => {
      const n = ++calls;
      if (n === 1) onError({ code: "revoked", message: "" });
      return () => { events.push(`unsub${n}`); };
    };
    const stop = retryOnce(attach, { isStopped: () => false, fail: () => events.push("fail") });
    expect(calls).toBe(2);
    expect(events).toEqual(["unsub1"]);
    stop();
    expect(events).toEqual(["unsub1", "unsub2"]);
  });
  it("gives up through fail() on the second error, synchronous or not", () => {
    const events: string[] = [];
    const attach = (onError: (e: DbError) => void) => { onError({ code: "revoked", message: "" }); return () => { events.push("unsub"); }; };
    retryOnce(attach, { isStopped: () => false, fail: (e) => events.push(`fail:${e.code}`) });
    expect(events).toEqual(["unsub", "fail:revoked"]);
  });
  it("ignores errors after stop", () => {
    let stopped = false;
    let handler: ((e: DbError) => void) | null = null;
    const events: string[] = [];
    const stop = retryOnce((onError) => { handler = onError; return () => {}; }, { isStopped: () => stopped, fail: () => events.push("fail") });
    stop();
    stopped = true;
    handler!({ code: "revoked", message: "" });
    expect(events).toEqual([]);
  });
});
