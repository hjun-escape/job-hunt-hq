import { describe, it, expect, vi } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { defaultSettings } from "../../src/domain/defaults";
import { createStore } from "../../src/store/store";
import { retryOnce, startSync } from "../../src/store/sync";
import type { Settings } from "../../src/domain/types";

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

  it("writes a settings migration once even when two syncs start on the same document", async () => {
    const db = createFakeDb();
    const s = defaultSettings("America/Toronto", NOW);
    await db.doc("settings/main").set({ ...s, schemaVersion: 0 } as unknown as Record<string, unknown>);
    const bump = [{ to: 1, apply: (x: Settings) => ({ ...x, followUpCadenceDays: x.followUpCadenceDays + 1 }) }];
    const a = startSync(db, createStore(), { homeTz: "America/Toronto", now: () => NOW, migrations: bump });
    const b = startSync(db, createStore(), { homeTz: "America/Toronto", now: () => NOW, migrations: bump });
    await Promise.all([a.ready, b.ready]);
    await vi.waitFor(async () => expect(((await db.doc("settings/main").get()).data() as unknown as Settings).schemaVersion).toBe(1));
    const stored = (await db.doc("settings/main").get()).data() as unknown as Settings;
    expect(stored.schemaVersion).toBe(1);
    expect(stored.followUpCadenceDays).toBe(8);
    a.stop(); b.stop();
  });

  it("does not seed defaults from a cache-only miss, only from a definitive one", async () => {
    const db = createFakeDb();
    let acquires = 0;
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return {
          ...real,
          acquire: async (o: AcquireOptions) => { acquires++; return real.acquire(o); },
          onSnapshot: (next: (s: DocumentSnapshot) => void, error?: (e: DbError) => void) => { next(cacheMiss); return real.onSnapshot(next, error); },
        };
      },
    } as unknown as DB;
    const store = createStore();
    const handle = startSync(wrapped, store, { homeTz: "America/Toronto", now: () => NOW });
    await handle.ready;
    expect(acquires).toBe(1); // the definitive miss seeded; the cache-only miss did not
    expect(store.getState().settings?.schemaVersion).toBeTypeOf("number");
    handle.stop();
  });

  it("shows the banner when storage only ever delivers cache-only misses", async () => {
    const db = createFakeDb();
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return { ...real, onSnapshot: (next: (s: DocumentSnapshot) => void) => { next(cacheMiss); return () => {}; } };
      },
    } as unknown as DB;
    const fired: (() => void)[] = [];
    const store = createStore();
    const errors: string[] = [];
    const handle = startSync(wrapped, store, { homeTz: "America/Toronto", now: () => NOW, onError: (e) => errors.push(e.code), timer: (fn) => { fired.push(fn); return () => { fired.splice(fired.indexOf(fn), 1); }; } });
    expect(store.getState().ready).toBe(false);
    fired[0]?.();
    await handle.ready;
    expect(store.getState()).toMatchObject({ ready: true, readOnly: true });
    expect(store.getState().settings?.schemaVersion).toBeTypeOf("number");
    expect(errors).toEqual(["unavailable"]);
    handle.stop();
  });

  it("cancels the definitive-snapshot timer once a real snapshot arrives", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return { ...real, onSnapshot: (next: (s: DocumentSnapshot) => void, error?: (e: DbError) => void) => { next(cacheMiss); return real.onSnapshot(next, error); } };
      },
    } as unknown as DB;
    let cancelled = 0;
    const store = createStore();
    const handle = startSync(wrapped, store, { homeTz: "America/Toronto", now: () => NOW, timer: () => () => { cancelled++; } });
    await handle.ready;
    expect(cancelled).toBe(1); // one timer armed by the cache miss on settings, cleared by the definitive snapshot
    expect(store.getState().readOnly).toBe(false);
    handle.stop();
  });

  it("keeps the page writable when a migration write fails", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set({ ...defaultSettings("America/Toronto", NOW), schemaVersion: 0 } as unknown as Record<string, unknown>);
    const broken = { ...db, doc: (path: string) => { const real = db.doc(path); return path === "settings/main" ? { ...real, acquire: async () => { throw { code: "unavailable", message: "lease down" }; } } : real; } } as unknown as DB;
    const errors: string[] = [];
    const store = createStore();
    const handle = startSync(broken, store, { homeTz: "America/Toronto", now: () => NOW, onError: (e) => errors.push(e.code), migrations: [{ to: 1, apply: (s: Settings) => s }] });
    await handle.ready;
    await vi.waitFor(() => expect(errors).toEqual(["unavailable"]));
    expect(store.getState().readOnly).toBe(false);
    expect(store.getState().settings?.schemaVersion).toBe(1);
    handle.stop();
  });

  it("a cache-only hit after a cache-only miss settles the watchdog", async () => {
    const db = createFakeDb();
    const stored = { ...defaultSettings("America/Toronto", NOW), schemaVersion: 0 } as unknown as Record<string, unknown>;
    await db.doc("settings/main").set(stored);
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    const cacheHit: DocumentSnapshot = { id: "main", exists: true, data: () => stored, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return {
          ...real,
          onSnapshot: (next: (s: DocumentSnapshot) => void) => {
            next(cacheMiss);
            next(cacheHit);
            return () => {};
          },
        };
      },
    } as unknown as DB;
    const armed: (() => void)[] = [];
    let cancelled = 0;
    const store = createStore();
    const handle = startSync(wrapped, store, {
      homeTz: "America/Toronto",
      now: () => NOW,
      timer: (fn) => { armed.push(fn); return () => { cancelled++; }; },
    });
    await handle.ready;
    expect(store.getState().ready).toBe(true);
    expect(store.getState().readOnly).toBe(false);
    expect(armed).toHaveLength(1); // armed once by the cache-only miss
    expect(cancelled).toBe(1); // settled once by the cache-only hit that followed, never by a definitive snapshot
    handle.stop();
  });

  it("populates the store and becomes ready from a cache-only hit, deferring the migration write", async () => {
    const db = createFakeDb();
    const stored = { ...defaultSettings("America/Toronto", NOW), schemaVersion: 0 } as unknown as Record<string, unknown>;
    await db.doc("settings/main").set(stored);
    const cacheHit: DocumentSnapshot = { id: "main", exists: true, data: () => stored, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return { ...real, onSnapshot: (next: (s: DocumentSnapshot) => void) => { next(cacheHit); return () => {}; } };
      },
    } as unknown as DB;
    let armed = 0;
    const store = createStore();
    const handle = startSync(wrapped, store, {
      homeTz: "America/Toronto",
      now: () => NOW,
      migrations: [{ to: 1, apply: (s: Settings) => ({ ...s, followUpCadenceDays: 9 }) }],
      timer: () => { armed++; return () => {}; },
    });
    await handle.ready;
    expect(store.getState().settings?.followUpCadenceDays).toBe(9);
    expect(store.getState().readOnly).toBe(false);
    expect(((await db.doc("settings/main").get()).data() as unknown as Settings).schemaVersion).toBe(0);
    expect(armed).toBe(0);
    handle.stop();
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
