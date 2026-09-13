// Node 22+ ships an experimental `localStorage` global that is a non-functional stub unless the
// process runs with --localstorage-file; on Node 25 it is on by default and shadows jsdom's
// implementation inside vitest. Tests (and the fake db's persistence) expect a working Storage,
// so install an in-memory one whenever the global cannot `clear()`.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.has(key) ? (this.map.get(key) as string) : null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
}

const stubbed = (() => {
  try {
    return typeof localStorage === "undefined" || typeof localStorage.clear !== "function";
  } catch {
    return true;
  }
})();
if (stubbed) {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true, writable: true });
}
