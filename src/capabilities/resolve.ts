import type { Capabilities } from "./types";
import { createFakeAssets } from "./fakeAssets";
import { createFakeDb } from "./fakeDb";
import { createAnchorDownloads } from "./fakeDownloads";
import { createFakeSample } from "./fakeSample";

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
      user: w.claude.use("user"),
    };
  }
  return {
    db: Promise.resolve(createFakeDb({ persistKey: DEV_PERSIST_KEY })),
    assets: Promise.resolve(createFakeAssets()),
    downloads: Promise.resolve(createAnchorDownloads()),
    sample: Promise.resolve(createFakeSample({
      reply: (input) => `(dev sample) This is a canned draft. The real page streams Claude's answer here.\n\nPrompt began: ${typeof input === "string" ? input.slice(0, 80) : "…"}`,
      json: () => ({ must: ["(dev) 3+ years backend", "(dev) Go"], nice: ["(dev) gRPC"] }),
    })),
    // dev.html?viewer previews what someone below Editor sees.
    user: Promise.resolve({ canEdit: async () => !new URLSearchParams(window.location.search).has("viewer") }),
  };
}
