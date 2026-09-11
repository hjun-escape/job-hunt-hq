/* In-memory implementation of the platform `db` contract (see src/types/claude/db.d.ts).
   Used for local development (persisted to localStorage) and for tests. */

type Body = Record<string, unknown>;
type Listener = () => void;
interface Filter { field: string; op: string; value: unknown }
interface Order { field: string; dir: "asc" | "desc" }

export interface FakeDbOptions {
  persistKey?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface FakeDb extends DB {
  _dump(): Record<string, Body>;
  _load(docs: Record<string, Body>): void;
  _reset(): void;
}

function dbError(code: DbErrorCode, message: string): DbError {
  return { code, message };
}

const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;
function segments(path: string): string[] {
  const parts = path.split("/");
  for (const p of parts) {
    if (p === "" || p === "." || p === ".." || !SEGMENT.test(p)) throw new TypeError(`invalid path segment in "${path}"`);
  }
  return parts;
}
function assertDocPath(path: string): void {
  if (segments(path).length % 2 !== 0) throw new TypeError(`document path needs an even number of segments: "${path}"`);
}
function assertCollectionPath(path: string): void {
  if (segments(path).length % 2 !== 1) throw new TypeError(`collection path needs an odd number of segments: "${path}"`);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
function isPlainObject(v: unknown): v is Body {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function deepMerge(base: Body, patch: Body): Body {
  const out: Body = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k] as Body, v) : v;
  }
  return out;
}
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const lastOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function matches(body: Body, f: Filter): boolean {
  const v = body[f.field];
  if (v === undefined) return false;
  switch (f.op) {
    case "==": return v === f.value;
    case "!=": return v !== f.value;
    case "<": return compare(v, f.value) < 0;
    case "<=": return compare(v, f.value) <= 0;
    case ">": return compare(v, f.value) > 0;
    case ">=": return compare(v, f.value) >= 0;
    case "in": return Array.isArray(f.value) && f.value.includes(v);
    case "not-in": return Array.isArray(f.value) && !f.value.includes(v);
    case "array-contains": return Array.isArray(v) && v.includes(f.value);
    default: throw dbError("invalid_argument", `unknown operator ${f.op}`);
  }
}

export function createFakeDb(opts: FakeDbOptions = {}): FakeDb {
  const storage = opts.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  let docs = new Map<string, Body>();
  const leases = new Map<string, { holder: string; expiresAt: number }>();
  const versions = new Map<string, number>();
  const docListeners = new Map<string, Set<Listener>>();
  const collListeners = new Map<string, Set<Listener>>();
  const metadata: SnapshotMetadata = { fromCache: false, hasPendingWrites: false };

  if (opts.persistKey && storage) {
    try {
      const raw = storage.getItem(opts.persistKey);
      if (raw) docs = new Map(Object.entries(JSON.parse(raw) as Record<string, Body>));
    } catch {
      /* corrupt or unavailable storage: start empty */
    }
  }

  function persist(): void {
    if (!opts.persistKey || !storage) return;
    try {
      storage.setItem(opts.persistKey, JSON.stringify(Object.fromEntries(docs)));
    } catch {
      /* quota or private mode */
    }
  }
  function fire(map: Map<string, Set<Listener>>, key: string): void {
    map.get(key)?.forEach((fn) => fn());
  }
  function notify(path: string): void {
    persist();
    fire(docListeners, path);
    fire(collListeners, parentOf(path));
  }
  function notifyAll(): void {
    persist();
    for (const set of docListeners.values()) set.forEach((fn) => fn());
    for (const set of collListeners.values()) set.forEach((fn) => fn());
  }
  function addListener(map: Map<string, Set<Listener>>, key: string, fn: Listener): Unsubscribe {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }
  function bump(path: string): void {
    versions.set(path, (versions.get(path) ?? 0) + 1);
  }

  function snapshotOf(path: string): DocumentSnapshot {
    const body = docs.get(path);
    const frozen = body === undefined ? undefined : deepFreeze(clone(body));
    return { id: lastOf(path), exists: body !== undefined, data: () => frozen, metadata };
  }

  function docRef(path: string): DocumentReference {
    assertDocPath(path);
    return {
      id: lastOf(path),
      path,
      async get() {
        return snapshotOf(path);
      },
      async set(data) {
        if (!isPlainObject(data)) throw dbError("invalid_argument", "document body must be a plain object");
        docs.set(path, clone(data));
        bump(path);
        notify(path);
      },
      async update(data) {
        const current = docs.get(path);
        if (current === undefined) throw dbError("invalid_argument", `update requires an existing document: ${path}`);
        if (!isPlainObject(data)) throw dbError("invalid_argument", "patch must be a plain object");
        docs.set(path, deepMerge(current, clone(data)));
        bump(path);
        notify(path);
      },
      async delete() {
        if (docs.delete(path)) notify(path);
      },
      async acquire({ holder, ttlMs, data }) {
        const now = Date.now();
        const ttl = Math.min(600000, Math.max(1000, ttlMs || 30000));
        const current = leases.get(path);
        if (current && current.expiresAt > now && current.holder !== holder) {
          return { acquired: false, expiresAt: new Date(current.expiresAt).toISOString() };
        }
        const expiresAt = now + ttl;
        leases.set(path, { holder, expiresAt });
        if (data) {
          docs.set(path, deepMerge(docs.get(path) ?? {}, clone(data)));
          bump(path);
          notify(path);
        }
        return { acquired: true, version: versions.get(path) ?? 0, expiresAt: new Date(expiresAt).toISOString(), holder };
      },
      onSnapshot(next) {
        const fn = () => next(snapshotOf(path));
        const off = addListener(docListeners, path, fn);
        queueMicrotask(fn);
        return off;
      },
      collection(sub) {
        return collRef(`${path}/${sub}`);
      },
    };
  }

  function runQuery(coll: string, filters: Filter[], order?: Order, max?: number): DocumentSnapshot[] {
    let rows: { path: string; body: Body }[] = [];
    for (const [path, body] of docs) if (parentOf(path) === coll) rows.push({ path, body });
    rows = rows.filter((r) => filters.every((f) => matches(r.body, f)));
    if (order) {
      rows.sort((a, b) => {
        const av = a.body[order.field];
        const bv = b.body[order.field];
        if (av === undefined && bv === undefined) return compare(lastOf(a.path), lastOf(b.path));
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        const c = compare(av, bv);
        return order.dir === "desc" ? -c : c;
      });
    } else {
      rows.sort((a, b) => compare(lastOf(a.path), lastOf(b.path)));
    }
    if (max !== undefined) rows = rows.slice(0, max);
    return rows.map((r) => snapshotOf(r.path));
  }

  function makeQuery(coll: string, filters: Filter[], order?: Order, max?: number): Query {
    const build = (): QuerySnapshot => {
      const list = runQuery(coll, filters, order, max);
      return {
        docs: list,
        size: list.length,
        empty: list.length === 0,
        docChanges: () => list.map((doc, i) => ({ type: "added" as const, doc, oldIndex: -1, newIndex: i })),
        metadata,
      };
    };
    return {
      where(field, op, value) {
        if (filters.length >= 10) throw dbError("invalid_argument", "at most 10 filters");
        return makeQuery(coll, [...filters, { field, op, value }], order, max);
      },
      orderBy(field, dir = "asc") {
        return makeQuery(coll, filters, { field, dir }, max);
      },
      limit(n) {
        if (n < 1 || n > 1000) throw dbError("invalid_argument", "limit must be between 1 and 1000");
        return makeQuery(coll, filters, order, n);
      },
      async get() {
        return build();
      },
      onSnapshot(next) {
        let previous = new Map<string, string>();
        const fn = () => {
          const snap = build();
          const current = new Map(snap.docs.map((d) => [d.id, JSON.stringify(d.data())] as const));
          const changes: DocumentChange[] = [];
          snap.docs.forEach((doc, i) => {
            const before = previous.get(doc.id);
            if (before === undefined) changes.push({ type: "added", doc, oldIndex: -1, newIndex: i });
            else if (before !== current.get(doc.id)) changes.push({ type: "modified", doc, oldIndex: i, newIndex: i });
          });
          for (const [id, body] of previous) {
            if (!current.has(id)) {
              const last = deepFreeze(JSON.parse(body) as Body);
              changes.push({ type: "removed", doc: { id, exists: true, data: () => last, metadata }, oldIndex: -1, newIndex: -1 });
            }
          }
          previous = current;
          next({ ...snap, docChanges: () => changes });
        };
        const off = addListener(collListeners, coll, fn);
        queueMicrotask(fn);
        return off;
      },
    };
  }

  function collRef(path: string): CollectionReference {
    assertCollectionPath(path);
    const ref: CollectionReference = {
      ...makeQuery(path, []),
      path,
      doc(id?: string) {
        const child = id ?? `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        return docRef(`${path}/${child}`);
      },
      async add(data) {
        const r = ref.doc();
        await r.set(data);
        return r;
      },
    };
    return ref;
  }

  return {
    doc: docRef,
    collection: collRef,
    _dump: () => Object.fromEntries([...docs].map(([k, v]) => [k, clone(v)])),
    _load: (all) => {
      docs = new Map(Object.entries(clone(all)));
      notifyAll();
    },
    _reset: () => {
      docs = new Map();
      leases.clear();
      notifyAll();
    },
  };
}
