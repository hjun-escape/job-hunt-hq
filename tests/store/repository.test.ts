import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { buildCompany } from "../../src/domain/factories";
import { createStore } from "../../src/store/store";
import { startSync } from "../../src/store/sync";
import { Repository, RepoError, stripUndefined } from "../../src/store/repository";

const NOW = "2026-09-11T00:00:00.000Z";

async function boot() {
  const db = createFakeDb();
  const store = createStore();
  const h = startSync(db, store, { homeTz: "UTC", now: () => NOW });
  await h.ready;
  return { db, store, repo: new Repository(db, store, () => NOW), h };
}

describe("stripUndefined", () => {
  it("drops undefined keys recursively", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: "x" } })).toEqual({ a: 1, c: { e: "x" } });
  });
});

describe("Repository", () => {
  it("createCompany writes a document the store mirrors", async () => {
    const { repo, store } = await boot();
    const co = await repo.createCompany({ name: "Shopify" });
    expect(co.id).toMatch(/^co_/);
    expect(store.getState().companies[co.id]?.name).toBe("Shopify");
  });

  it("createApplication takes maxStageRank from its status", async () => {
    const { repo } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied" });
    expect(app.maxStageRank).toBe(3);
    expect(app.createdAt).toBe(NOW);
  });

  it("createApplication ignores a caller-supplied maxStageRank", async () => {
    const { repo } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 9 });
    expect(app.maxStageRank).toBe(3);
  });

  it("createApplication rejects an unknown status", async () => {
    const { repo } = await boot();
    await expect(repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "nope" })).rejects.toBeInstanceOf(RepoError);
  });

  it("update merges a patch, stamps updatedAt, and clears keys set to undefined", async () => {
    const { repo, db } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved", city: "Toronto" });
    await repo.update("applications", app.id, { city: undefined, title: "New title" });
    const stored = (await db.doc(`applications/${app.id}`).get()).data();
    expect(stored).not.toHaveProperty("city");
    expect(stored?.title).toBe("New title");
    expect(stored?.updatedAt).toBe(NOW);
  });

  it("update of a missing record throws not_found", async () => {
    const { repo } = await boot();
    await expect(repo.update("companies", "co_missing", { name: "x" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("changeStatus appends activity, closes and reopens", async () => {
    const { repo, store } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied" });
    await repo.changeStatus(app.id, "interviewing", "phone screen booked");
    let cur = store.getState().applications[app.id];
    expect(cur.statusId).toBe("interviewing");
    expect(cur.maxStageRank).toBe(6);
    expect(cur.activity.at(-1)).toMatchObject({ type: "status", from: "applied", to: "interviewing", text: "phone screen booked" });
    await repo.changeStatus(app.id, "rejected");
    cur = store.getState().applications[app.id];
    expect(cur.closedAt).toBe(NOW);
    await repo.changeStatus(app.id, "applied");
    cur = store.getState().applications[app.id];
    expect(cur.closedAt).toBeUndefined();
    expect(cur.activity).toHaveLength(3);
  });

  it("logActivity appends a note", async () => {
    const { repo, store } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved" });
    await repo.logActivity(app.id, { type: "note", text: "emailed recruiter" });
    expect(store.getState().applications[app.id].activity).toEqual([{ at: NOW, type: "note", text: "emailed recruiter" }]);
  });

  it("remove deletes the record", async () => {
    const { repo, store } = await boot();
    const co = await repo.createCompany({ name: "Gone" });
    await repo.remove("companies", co.id);
    expect(store.getState().companies[co.id]).toBeUndefined();
  });

  it("saveSettings and saveProfile replace the singletons", async () => {
    const { repo, store } = await boot();
    await repo.saveSettings({ ...store.getState().settings!, displayCurrency: "KRW" });
    expect(store.getState().settings?.displayCurrency).toBe("KRW");
    await repo.saveProfile({ ...store.getState().profile!, name: "Ada" });
    expect(store.getState().profile?.name).toBe("Ada");
  });

  it("saveProfile echoes into the store so a follow-up save built from the store keeps the first change", async () => {
    const { db, store } = await boot();
    const base = store.getState().profile!;
    // Like the real platform, the write confirms before the subscription echoes it back: the fake
    // notifies synchronously inside `set`, so delay the real write by 20ms to reproduce that lag.
    const delayed = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        return { ...real, set: (body: Record<string, unknown>) => new Promise<void>((resolve) => { resolve(); setTimeout(() => void real.set(body), 20); }) };
      },
    } as unknown as DB;
    const slowRepo = new Repository(delayed, store, () => NOW);
    await slowRepo.saveProfile({ ...base, name: "Ada" });
    await slowRepo.saveProfile({ ...store.getState().profile!, email: "me@example.com" });
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().profile).toMatchObject({ name: "Ada", email: "me@example.com" });
    expect((await db.doc("profile/main").get()).data()).toMatchObject({ name: "Ada", email: "me@example.com" });
  });

  it("saveSettings echoes into the store so a follow-up save built from the store keeps the first change", async () => {
    const { db, store } = await boot();
    const base = store.getState().settings!;
    const delayed = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        return { ...real, set: (body: Record<string, unknown>) => new Promise<void>((resolve) => { resolve(); setTimeout(() => void real.set(body), 20); }) };
      },
    } as unknown as DB;
    const slowRepo = new Repository(delayed, store, () => NOW);
    await slowRepo.saveSettings({ ...base, displayCurrency: "KRW" });
    await slowRepo.saveSettings({ ...store.getState().settings!, followUpCadenceDays: 14 });
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().settings).toMatchObject({ displayCurrency: "KRW", followUpCadenceDays: 14 });
    expect((await db.doc("settings/main").get()).data()).toMatchObject({ displayCurrency: "KRW", followUpCadenceDays: 14 });
  });

  it("a read-only repository rejects writes with code read_only", async () => {
    const repo = new Repository(null, createStore());
    expect(repo.readOnly).toBe(true);
    await expect(repo.createCompany({ name: "x" })).rejects.toMatchObject({ code: "read_only" });
  });

  it("retries once on a transient unavailable error", async () => {
    const db = createFakeDb();
    let calls = 0;
    const flaky = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        return { ...real, set: async (body: Record<string, unknown>) => { calls++; if (calls === 1) throw { code: "unavailable", message: "blip" }; return real.set(body); } };
      },
    } as unknown as DB;
    const store = createStore();
    const repo = new Repository(flaky, store, () => NOW);
    await repo.create("companies", buildCompany({ name: "Retry" }, "co_r", NOW));
    expect(calls).toBe(2);
    expect((await db.doc("companies/co_r").get()).exists).toBe(true);
  });

  it("wraps a permanent error in RepoError with user text", async () => {
    const db = createFakeDb();
    const full = { ...db, doc: (path: string) => ({ ...db.doc(path), set: async () => { throw { code: "quota_exceeded", message: "cap" }; } }) } as unknown as DB;
    const repo = new Repository(full, createStore(), () => NOW);
    await expect(repo.create("companies", buildCompany({ name: "x" }, "co_x", NOW))).rejects.toMatchObject({ code: "quota_exceeded", message: expect.stringMatching(/full/i) });
  });

  it("serializes concurrent updates to the same document so a slow echo can't drop the first write", async () => {
    const { repo, db, store } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved" });

    // The real platform confirms a write before its own subscription echoes it back into the
    // store -- unlike the fake, which notifies synchronously inside `set`. Simulate that lag:
    // the write resolves immediately, but the document actually changes 20ms later.
    const delayed = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        return {
          ...real,
          set: (body: Record<string, unknown>) =>
            new Promise<void>((resolve) => {
              resolve();
              setTimeout(() => void real.set(body), 20);
            }),
        };
      },
    } as unknown as DB;
    const slowRepo = new Repository(delayed, store, () => NOW);

    const p1 = slowRepo.update("applications", app.id, { city: "A" });
    const p2 = slowRepo.update("applications", app.id, { team: "B" });
    await Promise.all([p1, p2]);
    await new Promise((r) => setTimeout(r, 50));

    const stored = (await db.doc(`applications/${app.id}`).get()).data();
    expect(stored?.city).toBe("A");
    expect(stored?.team).toBe("B");
  });

  it("creates the five record types with prefixed ids and factory defaults", async () => {
    const { repo, store } = await boot();
    const contact = await repo.createContact({ name: "Dana", relationshipId: "recruiter" });
    const asset = await repo.createAsset({ kindId: "resume", name: "Backend resume" });
    const answer = await repo.createAnswer({ kindId: "answer", title: "Why us" });
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved" });
    const interview = await repo.createInterview({ applicationId: app.id, roundTypeId: "coding" });
    const prep = await repo.createPrep({ kindId: "coding", title: "Two Sum" });
    expect(contact.id).toMatch(/^ct_/); expect(contact.notes).toBe("");
    expect(asset.id).toMatch(/^as_/); expect(asset.version).toBe("v1");
    expect(answer.id).toMatch(/^an_/); expect(answer.language).toBe("en");
    expect(interview.id).toMatch(/^iv_/); expect(interview.outcome).toBe("pending");
    expect(prep.id).toMatch(/^pr_/); expect(prep.attempts).toBe(0);
    const s = store.getState();
    expect(s.contacts[contact.id] && s.assets[asset.id] && s.answers[answer.id] && s.interviews[interview.id] && s.prep[prep.id]).toBeTruthy();
  });

  it("createInterview rejects an unknown application", async () => {
    const { repo } = await boot();
    await expect(repo.createInterview({ applicationId: "app_missing", roundTypeId: "coding" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("readOnly reflects a store that was marked read-only after a terminal error", async () => {
    const { repo, store } = await boot();
    expect(repo.readOnly).toBe(false);
    store.setState({ readOnly: true });
    expect(repo.readOnly).toBe(true);
  });

  it("modify reads the document at write time so un-awaited nested patches both land", async () => {
    const { repo, store } = await boot();
    const c = await repo.createContact({ name: "Prof", relationshipId: "reference" });
    const p1 = repo.modify("contacts", c.id, (cur) => ({ reference: { ...(cur.reference ?? { usedInApplicationIds: [] }), consentAt: "2026-09-01" } }));
    const p2 = repo.modify("contacts", c.id, (cur) => ({ reference: { ...(cur.reference ?? { usedInApplicationIds: [] }), usedInApplicationIds: ["app_1"] } }));
    await Promise.all([p1, p2]);
    expect(store.getState().contacts[c.id].reference).toEqual({ consentAt: "2026-09-01", usedInApplicationIds: ["app_1"] });
  });
});
