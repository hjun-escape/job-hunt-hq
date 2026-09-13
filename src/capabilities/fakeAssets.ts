import type { AssetsLike } from "./types";

const ACCEPTED = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "video/mp4", "video/webm", "application/pdf",
  "font/woff2", "font/woff", "font/ttf", "font/otf", "text/csv", "text/markdown", "application/json", "text/plain", "text/css", "text/javascript",
]);
const MAX_FILE = 20 * 1024 * 1024;

export interface FakeAssets extends AssetsLike {
  _blobs: Map<string, Blob>;
}

/** In-memory stand-in for the platform `assets` capability (dev page and tests). Ids are 32 hex chars like the real ones. */
export function createFakeAssets(opts: { maxFiles?: number; maxBytes?: number } = {}): FakeAssets {
  const maxFiles = opts.maxFiles ?? 100;
  const maxBytes = opts.maxBytes ?? 100 * 1024 * 1024;
  const items = new Map<string, { contentType: string; sizeBytes: number; createdAt: string; url: string }>();
  const blobs = new Map<string, Blob>();
  const reject = (code: string, message: string) => Promise.reject({ code, message });
  const urlFor = (id: string, blob: Blob) => (typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : `/_blob/${id}`);
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return {
    _blobs: blobs,
    async upload(blob, options) {
      if (!(blob instanceof Blob) || blob.size === 0) return reject("invalid_request", "empty body or not a Blob");
      const type = options?.type ?? blob.type;
      if (!ACCEPTED.has(type)) return reject("unsupported_type", `unsupported type ${type}`);
      if (blob.size > MAX_FILE) return reject("too_large", "over 20 MiB");
      const used = [...items.values()].reduce((n, i) => n + i.sizeBytes, 0);
      if (items.size >= maxFiles || used + blob.size > maxBytes) return reject("quota_or_state", "storage quota exhausted");
      const id = newId();
      const entry = { contentType: type, sizeBytes: blob.size, createdAt: new Date().toISOString(), url: urlFor(id, blob) };
      items.set(id, entry);
      blobs.set(id, blob);
      return { id, url: entry.url, sizeBytes: entry.sizeBytes, contentType: type };
    },
    async list() {
      const assets = [...items].map(([id, i]) => ({ id, url: i.url, contentType: i.contentType, sizeBytes: i.sizeBytes, createdAt: i.createdAt }));
      return { assets, usage: { files: items.size, bytes: assets.reduce((n, a) => n + a.sizeBytes, 0), maxFiles, maxBytes } };
    },
    async delete(ref) {
      const id = ref.replace(/^.*\/_blob\//, "");
      const deleted = items.delete(id);
      blobs.delete(id);
      return { deleted };
    },
  };
}
