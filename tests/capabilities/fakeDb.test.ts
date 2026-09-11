import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";

const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe("path grammar", () => {
  const db = createFakeDb();
  it("rejects odd document paths and even collection paths", () => {
    expect(() => db.doc("tasks")).toThrow(TypeError);
    expect(() => db.collection("tasks/t1")).toThrow(TypeError);
    expect(() => db.doc("tasks/../t1")).toThrow(TypeError);
  });
  it("accepts nested paths", () => {
    expect(db.doc("boards/b1/columns/c2").path).toBe("boards/b1/columns/c2");
    expect(db.collection("boards/b1/columns").path).toBe("boards/b1/columns");
  });
});

describe("documents", () => {
  it("set/get/delete round-trip; missing docs read as not existing", async () => {
    const db = createFakeDb();
    const ref = db.doc("tasks/t1");
    expect((await ref.get()).exists).toBe(false);
    await ref.set({ title: "a", tags: ["x"] });
    const snap = await ref.get();
    expect(snap.exists).toBe(true);
    expect(snap.id).toBe("t1");
    expect(snap.data()).toEqual({ title: "a", tags: ["x"] });
    expect(Object.isFrozen(snap.data())).toBe(true);
    await ref.delete();
    expect((await ref.get()).exists).toBe(false);
  });

  it("update merges nested objects, replaces arrays, and requires existence", async () => {
    const db = createFakeDb();
    const ref = db.doc("tasks/t1");
    await expect(ref.update({ a: 1 })).rejects.toMatchObject({ code: "invalid_argument" });
    await ref.set({ nested: { a: 1, b: 2 }, list: [1, 2] });
    await ref.update({ nested: { b: 3 }, list: [9] });
    expect((await ref.get()).data()).toEqual({ nested: { a: 1, b: 3 }, list: [9] });
  });

  it("set rejects non-object bodies", async () => {
    const db = createFakeDb();
    await expect(db.doc("tasks/t1").set([] as unknown as Record<string, unknown>)).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("onSnapshot fires initially and on every change until unsubscribed", async () => {
    const db = createFakeDb();
    const seen: boolean[] = [];
    const off = db.doc("tasks/t1").onSnapshot((s) => seen.push(s.exists));
    await tick();
    await db.doc("tasks/t1").set({ x: 1 });
    off();
    await db.doc("tasks/t1").set({ x: 2 });
    expect(seen).toEqual([false, true]);
  });
});

describe("collections and queries", () => {
  async function seeded() {
    const db = createFakeDb();
    await db.doc("apps/a1").set({ title: "b", rank: 2, tags: ["ca"] });
    await db.doc("apps/a2").set({ title: "a", rank: 5, tags: ["us", "ca"] });
    await db.doc("apps/a3").set({ title: "c", tags: [] });
    await db.doc("other/o1").set({ title: "z" });
    return db;
  }

  it("lists direct children ordered by id", async () => {
    const db = await seeded();
    const snap = await db.collection("apps").get();
    expect(snap.docs.map((d) => d.id)).toEqual(["a1", "a2", "a3"]);
    expect(snap.size).toBe(3);
  });

  it("filters with where operators", async () => {
    const db = await seeded();
    expect((await db.collection("apps").where("rank", ">=", 3).get()).docs.map((d) => d.id)).toEqual(["a2"]);
    expect((await db.collection("apps").where("tags", "array-contains", "ca").get()).docs.map((d) => d.id)).toEqual(["a1", "a2"]);
    expect((await db.collection("apps").where("title", "in", ["a", "c"]).get()).docs.map((d) => d.id)).toEqual(["a2", "a3"]);
    expect((await db.collection("apps").where("rank", "==", 2).get()).docs.map((d) => d.id)).toEqual(["a1"]);
  });

  it("orders with missing fields last and applies limit", async () => {
    const db = await seeded();
    expect((await db.collection("apps").orderBy("rank", "desc").get()).docs.map((d) => d.id)).toEqual(["a2", "a1", "a3"]);
    expect((await db.collection("apps").orderBy("title").limit(2).get()).docs.map((d) => d.id)).toEqual(["a2", "a1"]);
  });

  it("add mints an id and doc() without id mints one too", async () => {
    const db = createFakeDb();
    const ref = await db.collection("apps").add({ title: "n" });
    expect(ref.path.startsWith("apps/")).toBe(true);
    expect((await ref.get()).exists).toBe(true);
    expect(db.collection("apps").doc().id.length).toBeGreaterThan(4);
  });

  it("onSnapshot reports added, modified and removed changes", async () => {
    const db = await seeded();
    const events: string[][] = [];
    const off = db.collection("apps").onSnapshot((snap) => events.push(snap.docChanges().map((c) => `${c.type}:${c.doc.id}`)));
    await tick();
    await db.doc("apps/a1").set({ title: "b2" });
    await db.doc("apps/a3").delete();
    off();
    expect(events[0]).toEqual(["added:a1", "added:a2", "added:a3"]);
    expect(events[1]).toEqual(["modified:a1"]);
    expect(events[2]).toEqual(["removed:a3"]);
  });
});

describe("acquire", () => {
  it("grants the first holder, refuses a second while live, renews the same holder", async () => {
    const db = createFakeDb();
    const ref = db.doc("settings/main");
    const a = await ref.acquire({ holder: "A", ttlMs: 5000 });
    expect(a.acquired).toBe(true);
    const b = await ref.acquire({ holder: "B", ttlMs: 5000 });
    expect(b.acquired).toBe(false);
    expect(b.expiresAt).toBeDefined();
    const again = await ref.acquire({ holder: "A", ttlMs: 5000 });
    expect(again.acquired).toBe(true);
    expect((await ref.get()).exists).toBe(false);
  });
});

describe("persistence", () => {
  it("reloads documents from the provided storage", async () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const db1 = createFakeDb({ persistKey: "t", storage });
    await db1.doc("apps/a1").set({ title: "persisted" });
    const db2 = createFakeDb({ persistKey: "t", storage });
    expect((await db2.doc("apps/a1").get()).data()).toEqual({ title: "persisted" });
    expect(db2._dump()).toEqual({ "apps/a1": { title: "persisted" } });
  });

  it("_load replaces everything and notifies listeners", async () => {
    const db = createFakeDb();
    const seen: number[] = [];
    db.collection("apps").onSnapshot((s) => seen.push(s.size));
    await tick();
    db._load({ "apps/x": { title: "x" }, "apps/y": { title: "y" } });
    expect(seen).toEqual([0, 2]);
    db._reset();
    expect(seen).toEqual([0, 2, 0]);
  });
});
