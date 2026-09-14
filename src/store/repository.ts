import { describeDbError, errorCode, isTransient } from "../capabilities/errors";
import type { DbLike } from "../capabilities/types";
import { buildAnswer, buildApplication, buildAsset, buildCompany, buildContact, buildInterview, buildPrep, type NewAnswer, type NewApplication, type NewAsset, type NewCompany, type NewContact, type NewInterview, type NewPrep } from "../domain/factories";
import { ID_PREFIX, newId, nowIso } from "../domain/ids";
import { appendActivity, applyStatusChange, findStatus } from "../domain/status";
import type { ActivityEntry, Answer, Application, AssetDoc, CollectionName, Company, Contact, EntityMap, Interview, PrepItem, Profile, Settings } from "../domain/types";
import type { Store, StoreState } from "./store";
import { PROFILE_PATH, SETTINGS_PATH } from "./sync";

export class RepoError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RepoError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** JSON has no `undefined`; a full `set` must not carry such keys, so drop them recursively. */
export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRepoError(e: unknown): RepoError {
  if (e instanceof RepoError) return e;
  return new RepoError(errorCode(e) ?? "unknown", describeDbError(e));
}

export class Repository {
  /** One promise chain per document path, so a read-modify-write never reads a copy of the
   * store that is stale because an earlier write to the same document is still in flight. */
  private readonly writeChains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: DbLike | null,
    private readonly store: Store,
    private readonly now: () => string = nowIso,
  ) {}

  /** No database in this view, or the sync layer switched the store to read-only after a terminal error. */
  get readOnly(): boolean {
    return this.db === null || this.store.getState().readOnly;
  }

  private requireDb(): DbLike {
    if (!this.db || this.store.getState().readOnly) throw new RepoError("read_only", describeDbError({ code: "read_only", message: "" }));
    return this.db;
  }

  private requireSettings(): Settings {
    const s = this.store.getState().settings;
    if (!s) throw new RepoError("not_ready", "Settings are not loaded yet.");
    return s;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RepoError) throw e;
      if (isTransient(e)) {
        await sleep(200 + Math.random() * 300);
        try {
          return await fn();
        } catch (e2) {
          throw toRepoError(e2);
        }
      }
      throw toRepoError(e);
    }
  }

  /** Runs `fn` after every earlier write queued for `path` has settled -- the real platform
   * confirms a write before its subscription echoes it back, so a caller that reads the
   * store right after a sibling write's promise resolves can otherwise still see stale data. */
  private serialize<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.writeChains.get(path) ?? Promise.resolve();
    const result = prior.then(fn, fn);
    this.writeChains.set(path, result.catch(() => undefined));
    return result;
  }

  private async write<K extends CollectionName>(collection: K, doc: EntityMap[K]): Promise<EntityMap[K]> {
    const db = this.requireDb();
    const clean = stripUndefined(doc);
    await this.guard(() => db.doc(`${collection}/${doc.id}`).set(clean as unknown as Record<string, unknown>));
    // Echo the write into the store ourselves instead of waiting for the subscription: on the
    // real platform that echo arrives asynchronously, so the next serialized write could
    // otherwise read a copy of this document that doesn't yet reflect what we just saved.
    const current = this.store.getState()[collection] as Record<string, EntityMap[K]>;
    this.store.setState({ [collection]: { ...current, [doc.id]: clean } } as unknown as Partial<StoreState>);
    return clean;
  }

  get<K extends CollectionName>(collection: K, id: string): EntityMap[K] | undefined {
    return (this.store.getState()[collection] as Record<string, EntityMap[K]>)[id];
  }

  async create<K extends CollectionName>(collection: K, doc: EntityMap[K]): Promise<EntityMap[K]> {
    return this.write(collection, doc);
  }

  async update<K extends CollectionName>(collection: K, id: string, patch: Partial<EntityMap[K]>): Promise<EntityMap[K]> {
    return this.serialize(`${collection}/${id}`, async () => {
      const current = this.get(collection, id);
      if (!current) throw new RepoError("not_found", `No ${collection} record ${id}.`);
      const next = { ...current, ...patch, updatedAt: this.now() } as EntityMap[K];
      return this.write(collection, next);
    });
  }

  /** Read-modify-write inside the per-document chain: `fn` sees the document as it is at write
   * time, so a nested-object patch built while an earlier write is still in flight never
   * clobbers the sibling field that write just set. Use it whenever a patch spreads a nested object. */
  async modify<K extends CollectionName>(collection: K, id: string, fn: (current: EntityMap[K]) => Partial<EntityMap[K]>): Promise<EntityMap[K]> {
    return this.serialize(`${collection}/${id}`, async () => {
      const current = this.get(collection, id);
      if (!current) throw new RepoError("not_found", `No ${collection} record ${id}.`);
      const next = { ...current, ...fn(current), updatedAt: this.now() } as EntityMap[K];
      return this.write(collection, next);
    });
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    const db = this.requireDb();
    await this.serialize(`${collection}/${id}`, async () => {
      await this.guard(() => db.doc(`${collection}/${id}`).delete());
      const current = this.store.getState()[collection] as Record<string, unknown>;
      const { [id]: _gone, ...rest } = current;
      this.store.setState({ [collection]: rest } as unknown as Partial<StoreState>);
    });
  }

  async saveSettings(settings: Settings): Promise<void> {
    const db = this.requireDb();
    await this.serialize(SETTINGS_PATH, async () => {
      const next = stripUndefined({ ...settings, updatedAt: this.now() });
      await this.guard(() => db.doc(SETTINGS_PATH).set(next as unknown as Record<string, unknown>));
      this.store.setState({ settings: next });
    });
  }

  /** Read-modify-write the settings singleton inside its own write chain. See modifyProfile. */
  async modifySettings(fn: (current: Settings) => Partial<Settings>): Promise<Settings> {
    const db = this.requireDb();
    return this.serialize(SETTINGS_PATH, async () => {
      const current = this.store.getState().settings;
      if (!current) throw new RepoError("not_ready", "Settings are not loaded yet.");
      const next = stripUndefined({ ...current, ...fn(current), updatedAt: this.now() });
      await this.guard(() => db.doc(SETTINGS_PATH).set(next as unknown as Record<string, unknown>));
      this.store.setState({ settings: next });
      return next;
    });
  }

  async saveProfile(profile: Profile): Promise<void> {
    const db = this.requireDb();
    await this.serialize(PROFILE_PATH, async () => {
      const next = stripUndefined({ ...profile, updatedAt: this.now() });
      await this.guard(() => db.doc(PROFILE_PATH).set(next as unknown as Record<string, unknown>));
      this.store.setState({ profile: next });
    });
  }

  /** Read-modify-write the singleton inside its own write chain -- like `modify`, but for the
   * one-per-app profile/settings documents. `fn` sees the document as it is at write time, so two
   * un-awaited calls (each patching a different field) both land instead of the second clobbering
   * the first with a copy of the document read before either write settled. */
  async modifyProfile(fn: (current: Profile) => Partial<Profile>): Promise<Profile> {
    const db = this.requireDb();
    return this.serialize(PROFILE_PATH, async () => {
      const current = this.store.getState().profile;
      if (!current) throw new RepoError("not_ready", "Profile is not loaded yet.");
      const next = stripUndefined({ ...current, ...fn(current), updatedAt: this.now() });
      await this.guard(() => db.doc(PROFILE_PATH).set(next as unknown as Record<string, unknown>));
      this.store.setState({ profile: next });
      return next;
    });
  }

  async createCompany(input: NewCompany): Promise<Company> {
    return this.create("companies", buildCompany(input, newId(ID_PREFIX.companies), this.now()));
  }

  async createApplication(input: NewApplication): Promise<Application> {
    const status = findStatus(this.requireSettings(), input.statusId);
    if (!status) throw new RepoError("invalid", `Unknown status ${input.statusId}.`);
    const doc = buildApplication({ ...input, maxStageRank: status.stageRank }, newId(ID_PREFIX.applications), this.now());
    return this.create("applications", doc);
  }

  async createContact(input: NewContact): Promise<Contact> {
    return this.create("contacts", buildContact(input, newId(ID_PREFIX.contacts), this.now()));
  }

  async createAsset(input: NewAsset): Promise<AssetDoc> {
    return this.create("assets", buildAsset(input, newId(ID_PREFIX.assets), this.now()));
  }

  async createAnswer(input: NewAnswer): Promise<Answer> {
    return this.create("answers", buildAnswer(input, newId(ID_PREFIX.answers), this.now()));
  }

  async createInterview(input: NewInterview): Promise<Interview> {
    if (!this.get("applications", input.applicationId)) throw new RepoError("not_found", `No application ${input.applicationId}.`);
    return this.create("interviews", buildInterview(input, newId(ID_PREFIX.interviews), this.now()));
  }

  async createPrep(input: NewPrep): Promise<PrepItem> {
    return this.create("prep", buildPrep(input, newId(ID_PREFIX.prep), this.now()));
  }

  async changeStatus(appId: string, statusId: string, note?: string): Promise<Application> {
    return this.serialize(`applications/${appId}`, async () => {
      const app = this.get("applications", appId);
      if (!app) throw new RepoError("not_found", `No application ${appId}.`);
      const status = findStatus(this.requireSettings(), statusId);
      if (!status) throw new RepoError("invalid", `Unknown status ${statusId}.`);
      const next = applyStatusChange(app, status, this.now(), note);
      if (next === app) return app;
      return this.write("applications", next);
    });
  }

  async logActivity(appId: string, entry: Omit<ActivityEntry, "at">): Promise<Application> {
    return this.serialize(`applications/${appId}`, async () => {
      const app = this.get("applications", appId);
      if (!app) throw new RepoError("not_found", `No application ${appId}.`);
      return this.write("applications", appendActivity(app, entry, this.now()));
    });
  }
}
