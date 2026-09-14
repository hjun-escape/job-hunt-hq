/** Wraps a fake db so `set`/`delete` resolve at once while the real write waits for `flush()` -- the
 * platform confirms a write before its subscription echoes it, without any timer. */
export function gatedDb(db: DB): { db: DB; flush: () => Promise<void> } {
  const queued: (() => Promise<void>)[] = [];
  const wrapped = {
    ...db,
    doc: (path: string) => {
      const real = db.doc(path);
      return {
        ...real,
        set: (body: Record<string, unknown>) => { queued.push(() => real.set(body)); return Promise.resolve(); },
        delete: () => { queued.push(() => real.delete()); return Promise.resolve(); },
      };
    },
  } as unknown as DB;
  return { db: wrapped, flush: async () => { while (queued.length) await (queued.shift() as () => Promise<void>)(); } };
}
