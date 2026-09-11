import { describeDbError, errorCode, isTransient } from "../capabilities/errors";
import type { DbLike } from "../capabilities/types";
import { buildApplication, buildCompany, type NewApplication, type NewCompany } from "../domain/factories";
import { ID_PREFIX, newId, nowIso } from "../domain/ids";
import { appendActivity, applyStatusChange, findStatus } from "../domain/status";
import type { ActivityEntry, Application, CollectionName, Company, EntityMap, Profile, Settings } from "../domain/types";
import type { Store } from "./store";
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
  constructor(
    private readonly db: DbLike | null,
    private readonly store: Store,
    private readonly now: () => string = nowIso,
  ) {}

  get readOnly(): boolean {
    return this.db === null;
  }

  private requireDb(): DbLike {
    if (!this.db) throw new RepoError("read_only", describeDbError({ code: "read_only", message: "" }));
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

  private async write<K extends CollectionName>(collection: K, doc: EntityMap[K]): Promise<EntityMap[K]> {
    const db = this.requireDb();
    const clean = stripUndefined(doc);
    await this.guard(() => db.doc(`${collection}/${doc.id}`).set(clean as unknown as Record<string, unknown>));
    return clean;
  }

  get<K extends CollectionName>(collection: K, id: string): EntityMap[K] | undefined {
    return (this.store.getState()[collection] as Record<string, EntityMap[K]>)[id];
  }

  async create<K extends CollectionName>(collection: K, doc: EntityMap[K]): Promise<EntityMap[K]> {
    return this.write(collection, doc);
  }

  async update<K extends CollectionName>(collection: K, id: string, patch: Partial<EntityMap[K]>): Promise<EntityMap[K]> {
    const current = this.get(collection, id);
    if (!current) throw new RepoError("not_found", `No ${collection} record ${id}.`);
    const next = { ...current, ...patch, updatedAt: this.now() } as EntityMap[K];
    return this.write(collection, next);
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    const db = this.requireDb();
    await this.guard(() => db.doc(`${collection}/${id}`).delete());
  }

  async saveSettings(settings: Settings): Promise<void> {
    const db = this.requireDb();
    const next = stripUndefined({ ...settings, updatedAt: this.now() });
    await this.guard(() => db.doc(SETTINGS_PATH).set(next as unknown as Record<string, unknown>));
  }

  async saveProfile(profile: Profile): Promise<void> {
    const db = this.requireDb();
    const next = stripUndefined({ ...profile, updatedAt: this.now() });
    await this.guard(() => db.doc(PROFILE_PATH).set(next as unknown as Record<string, unknown>));
  }

  async createCompany(input: NewCompany): Promise<Company> {
    return this.create("companies", buildCompany(input, newId(ID_PREFIX.companies), this.now()));
  }

  async createApplication(input: NewApplication): Promise<Application> {
    const status = findStatus(this.requireSettings(), input.statusId);
    if (!status) throw new RepoError("invalid", `Unknown status ${input.statusId}.`);
    const doc = buildApplication({ maxStageRank: status.stageRank, ...input }, newId(ID_PREFIX.applications), this.now());
    return this.create("applications", doc);
  }

  async changeStatus(appId: string, statusId: string, note?: string): Promise<Application> {
    const app = this.get("applications", appId);
    if (!app) throw new RepoError("not_found", `No application ${appId}.`);
    const status = findStatus(this.requireSettings(), statusId);
    if (!status) throw new RepoError("invalid", `Unknown status ${statusId}.`);
    const next = applyStatusChange(app, status, this.now(), note);
    if (next === app) return app;
    return this.write("applications", next);
  }

  async logActivity(appId: string, entry: Omit<ActivityEntry, "at">): Promise<Application> {
    const app = this.get("applications", appId);
    if (!app) throw new RepoError("not_found", `No application ${appId}.`);
    return this.write("applications", appendActivity(app, entry, this.now()));
  }
}
