import type { DbLike } from "../capabilities/types";
import { defaultProfile, defaultSettings } from "../domain/defaults";
import { nowIso } from "../domain/ids";
import { migrateSettings, type Migration } from "../domain/migrate";
import { COLLECTIONS, type Profile, type Settings } from "../domain/types";
import type { Store, StoreState } from "./store";

export interface SyncOptions {
  homeTz: string;
  now?: () => string;
  onError?: (e: DbError) => void;
  migrations?: Migration[];
  /** Spec §9: how long a singleton subscription may deliver only cache-only misses before the
   * banner shows instead of "Connecting…" forever. Default 15000ms. */
  definitiveTimeoutMs?: number;
  /** Injectable timer for the definitive-snapshot watchdog; defaults to setTimeout/clearTimeout.
   * Tests pass a synchronous fake so the timeout path is deterministic. */
  timer?: (fn: () => void, ms: number) => () => void;
}
export interface SyncHandle {
  stop(): void;
  ready: Promise<void>;
}

export const SETTINGS_PATH = "settings/main";
export const PROFILE_PATH = "profile/main";

export interface RetryOptions {
  isStopped: () => boolean;
  fail: (e: DbError) => void;
}

/** Spec §9: re-subscribe a terminated listener once, then give up via `fail`. Safe when `attach`
 * invokes the error callback synchronously (the first attempt's unsubscribe is still torn down and
 * `current` always points at the live listener). */
export function retryOnce(attach: (onError: (e: DbError) => void) => Unsubscribe, opts: RetryOptions): Unsubscribe {
  let current: Unsubscribe | null = null;
  let attempted = false;
  let retryRequested = false;
  const onError = (e: DbError) => {
    if (opts.isStopped()) return;
    if (attempted) {
      opts.fail(e);
      return;
    }
    attempted = true;
    if (current) {
      current();
      current = attach(onError);
    } else {
      retryRequested = true; // errored inside the first attach(): re-attach below, once it returns
    }
  };
  const first = attach(onError);
  if (retryRequested) {
    first();
    current = attach(onError);
  } else {
    current = first;
  }
  return () => current?.();
}

function hasSchema(snap: DocumentSnapshot): boolean {
  return snap.exists && typeof snap.data()?.schemaVersion === "number";
}
function hasUpdatedAt(snap: DocumentSnapshot): boolean {
  return snap.exists && typeof snap.data()?.updatedAt === "string";
}

/** Subscribe the store to every collection plus the two singletons; seed defaults once when missing. */
export function startSync(db: DbLike, store: Store, opts: SyncOptions): SyncHandle {
  const now = opts.now ?? nowIso;
  const timer = opts.timer ?? ((fn: () => void, ms: number) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
  const timeoutMs = opts.definitiveTimeoutMs ?? 15000;
  const unsubs: Unsubscribe[] = [];
  const pending = new Set<string>([...COLLECTIONS, "settings", "profile"]);
  let stopped = false;
  let failed = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const markReady = (key: string) => {
    pending.delete(key);
    if (pending.size === 0 && !store.getState().ready) {
      store.setState({ ready: true });
      resolveReady();
    }
  };
  /** Terminal for the whole sync: at most one transition and one `onError` call, no matter
   * how many of the nine subscriptions hit a terminal error. If settings/profile never made
   * it out of a listener before this fires, seed in-memory defaults so every page's
   * `useSettings()`/`useProfile()` still has something to render instead of throwing. */
  const fail = (e: DbError) => {
    if (stopped || failed) return;
    failed = true;
    for (const cancel of definitive.values()) cancel();
    definitive.clear();
    opts.onError?.(e);
    const s = store.getState();
    store.setState({
      readOnly: true,
      ready: true,
      settings: s.settings ?? defaultSettings(opts.homeTz, now()),
      profile: s.profile ?? defaultProfile(now()),
    });
    resolveReady();
  };

  /** Spec §9: a cache-only miss should be followed by a definitive snapshot; if none arrives, show the banner instead of "Connecting…" forever. */
  const definitive = new Map<string, () => void>();
  const armDefinitive = (key: string) => {
    if (definitive.has(key)) return;
    definitive.set(key, timer(() => { definitive.delete(key); fail({ code: "unavailable", message: "Storage never became definitive." }); }, timeoutMs));
  };
  const settleDefinitive = (key: string) => { definitive.get(key)?.(); definitive.delete(key); };

  async function seed(path: string, build: () => Record<string, unknown>): Promise<void> {
    const ref = db.doc(path);
    const lease = await ref.acquire({ holder: `seed-${Math.random().toString(36).slice(2)}`, ttlMs: 5000 });
    if (!lease.acquired) return;
    const snap = await ref.get();
    const seeded = path === SETTINGS_PATH ? hasSchema(snap) : hasUpdatedAt(snap);
    if (!seeded) await ref.set(build());
  }

  /** Spec §2: a migration runs once, guarded by a lease on settings/main; the loser waits for the winner's write to arrive. */
  async function migrateWithLease(targetVersion: number): Promise<void> {
    const ref = db.doc(SETTINGS_PATH);
    const lease = await ref.acquire({ holder: `migrate-${Math.random().toString(36).slice(2)}`, ttlMs: 5000 });
    if (!lease.acquired) return;
    const fresh = await ref.get();
    const data = fresh.data() as unknown as Settings | undefined;
    if (!fresh.exists || !data || typeof data.schemaVersion !== "number" || data.schemaVersion >= targetVersion) return;
    await ref.set(migrateSettings(data, opts.migrations) as unknown as Record<string, unknown>);
  }

  unsubs.push(
    retryOnce(
      (onError) =>
        db.doc(SETTINGS_PATH).onSnapshot((snap) => {
          if (stopped) return;
          // A cache-only miss is not proof the document is absent; the definitive snapshot follows on
          // its own -- arm the watchdog instead of seeding, and settle it below on any other outcome.
          if (snap.metadata.fromCache) {
            if (!hasSchema(snap)) armDefinitive("settings");
            return;
          }
          settleDefinitive("settings");
          if (!hasSchema(snap)) {
            void seed(SETTINGS_PATH, () => defaultSettings(opts.homeTz, now()) as unknown as Record<string, unknown>).catch(fail);
            return;
          }
          const raw = snap.data() as unknown as Settings;
          const migrated = migrateSettings(raw, opts.migrations);
          store.setState({ settings: migrated });
          // The store already holds the migrated settings; a failed write just means the next page
          // load retries the migration, so report it without flipping the page read-only.
          if (migrated !== raw) void migrateWithLease(migrated.schemaVersion).catch((e) => opts.onError?.(e as DbError));
          markReady("settings");
        }, onError),
      { isStopped: () => stopped, fail },
    ),
  );

  unsubs.push(
    retryOnce(
      (onError) =>
        db.doc(PROFILE_PATH).onSnapshot((snap) => {
          if (stopped) return;
          if (snap.metadata.fromCache) {
            if (!hasUpdatedAt(snap)) armDefinitive("profile");
            return;
          }
          settleDefinitive("profile");
          if (!hasUpdatedAt(snap)) {
            void seed(PROFILE_PATH, () => defaultProfile(now()) as unknown as Record<string, unknown>).catch(fail);
            return;
          }
          store.setState({ profile: snap.data() as unknown as Profile });
          markReady("profile");
        }, onError),
      { isStopped: () => stopped, fail },
    ),
  );

  for (const name of COLLECTIONS) {
    unsubs.push(
      retryOnce(
        (onError) =>
          db.collection(name).onSnapshot((snap) => {
            if (stopped) return;
            const map: Record<string, unknown> = {};
            for (const d of snap.docs) map[d.id] = d.data();
            store.setState({ [name]: map } as unknown as Partial<StoreState>);
            markReady(name);
          }, onError),
        { isStopped: () => stopped, fail },
      ),
    );
  }

  return {
    stop() {
      stopped = true;
      unsubs.forEach((u) => u());
      for (const cancel of definitive.values()) cancel();
      definitive.clear();
    },
    ready,
  };
}
