import type { DbLike } from "../capabilities/types";
import { defaultProfile, defaultSettings } from "../domain/defaults";
import { nowIso } from "../domain/ids";
import { migrateSettings } from "../domain/migrate";
import { COLLECTIONS, type Profile, type Settings } from "../domain/types";
import type { Store, StoreState } from "./store";

export interface SyncOptions {
  homeTz: string;
  now?: () => string;
  onError?: (e: DbError) => void;
}
export interface SyncHandle {
  stop(): void;
  ready: Promise<void>;
}

export const SETTINGS_PATH = "settings/main";
export const PROFILE_PATH = "profile/main";

function hasSchema(snap: DocumentSnapshot): boolean {
  return snap.exists && typeof snap.data()?.schemaVersion === "number";
}
function hasUpdatedAt(snap: DocumentSnapshot): boolean {
  return snap.exists && typeof snap.data()?.updatedAt === "string";
}

/** Subscribe the store to every collection plus the two singletons; seed defaults once when missing. */
export function startSync(db: DbLike, store: Store, opts: SyncOptions): SyncHandle {
  const now = opts.now ?? nowIso;
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

  async function seed(path: string, build: () => Record<string, unknown>): Promise<void> {
    const ref = db.doc(path);
    const lease = await ref.acquire({ holder: `seed-${Math.random().toString(36).slice(2)}`, ttlMs: 5000 });
    if (!lease.acquired) return;
    const snap = await ref.get();
    const seeded = path === SETTINGS_PATH ? hasSchema(snap) : hasUpdatedAt(snap);
    if (!seeded) await ref.set(build());
  }

  /** Spec §9: "a terminated listener is re-subscribed once, then the banner shows." Wraps one
   * subscription so its first terminal error tears it down and re-attaches it; a second
   * terminal error for the same subscription gives up via `fail`. */
  function retryOnce(attach: (onError: (e: DbError) => void) => Unsubscribe): Unsubscribe {
    let current: Unsubscribe = () => {};
    let attempted = false;
    const onError = (e: DbError) => {
      if (stopped) return;
      if (!attempted) {
        attempted = true;
        current();
        current = attach(onError);
      } else {
        fail(e);
      }
    };
    current = attach(onError);
    return () => current();
  }

  unsubs.push(
    retryOnce((onError) =>
      db.doc(SETTINGS_PATH).onSnapshot((snap) => {
        if (stopped) return;
        if (!hasSchema(snap)) {
          void seed(SETTINGS_PATH, () => defaultSettings(opts.homeTz, now()) as unknown as Record<string, unknown>).catch(fail);
          return;
        }
        const raw = snap.data() as unknown as Settings;
        const migrated = migrateSettings(raw);
        store.setState({ settings: migrated });
        if (migrated !== raw) void db.doc(SETTINGS_PATH).set(migrated as unknown as Record<string, unknown>).catch(fail);
        markReady("settings");
      }, onError),
    ),
  );

  unsubs.push(
    retryOnce((onError) =>
      db.doc(PROFILE_PATH).onSnapshot((snap) => {
        if (stopped) return;
        if (!hasUpdatedAt(snap)) {
          void seed(PROFILE_PATH, () => defaultProfile(now()) as unknown as Record<string, unknown>).catch(fail);
          return;
        }
        store.setState({ profile: snap.data() as unknown as Profile });
        markReady("profile");
      }, onError),
    ),
  );

  for (const name of COLLECTIONS) {
    unsubs.push(
      retryOnce((onError) =>
        db.collection(name).onSnapshot((snap) => {
          if (stopped) return;
          const map: Record<string, unknown> = {};
          for (const d of snap.docs) map[d.id] = d.data();
          store.setState({ [name]: map } as unknown as Partial<StoreState>);
          markReady(name);
        }, onError),
      ),
    );
  }

  return {
    stop() {
      stopped = true;
      unsubs.forEach((u) => u());
    },
    ready,
  };
}
