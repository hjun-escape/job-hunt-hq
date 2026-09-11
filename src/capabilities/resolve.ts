import type { Capabilities } from "./types";
import { createFakeDb } from "./fakeDb";
import { createAnchorDownloads } from "./fakeDownloads";

export const DEV_PERSIST_KEY = "job-hunt-hq-dev";

/** Real capabilities inside the claude.ai viewer; localStorage-backed fakes for local development. */
export function createCapabilities(): Capabilities {
  const w = window as Window & { claude?: Claude };
  if (w.claude && typeof w.claude.use === "function") {
    return {
      db: w.claude.use("db"),
      assets: w.claude.use("assets"),
      downloads: w.claude.use("downloads"),
      sample: w.claude.use("sample"),
    };
  }
  return {
    db: Promise.resolve(createFakeDb({ persistKey: DEV_PERSIST_KEY })),
    assets: Promise.resolve(null),
    downloads: Promise.resolve(createAnchorDownloads()),
    sample: Promise.resolve(null),
  };
}
