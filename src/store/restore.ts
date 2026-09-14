import type { RestoreStep } from "../domain/backup";
import { RepoError, type Repository } from "./repository";

export interface RestoreProgress { done: number; total: number }
export interface RestoreOptions {
  onProgress?: (p: RestoreProgress) => void;
  /** Injectable for tests; defaults to a real timer. */
  wait?: (ms: number) => Promise<void>;
}
export interface RestoreResult {
  written: number;
  deleted: number;
  total: number;
  stopped?: "quota_exceeded" | "error";
  error?: string;
}

const MAX_RETRIES = 5;
const realWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function applyStep(repo: Repository, step: RestoreStep): Promise<unknown> {
  switch (step.kind) {
    case "settings": return repo.saveSettings(step.settings);
    case "profile": return repo.saveProfile(step.profile);
    case "delete": return repo.remove(step.collection, step.id);
    case "write": return repo.create(step.collection, step.doc);
  }
}

/** Spec §8: sequential writes with progress; resource_exhausted backs off and continues; quota_exceeded stops and reports. */
export async function runRestore(repo: Repository, steps: RestoreStep[], opts: RestoreOptions = {}): Promise<RestoreResult> {
  const wait = opts.wait ?? realWait;
  const result: RestoreResult = { written: 0, deleted: 0, total: steps.length };
  let done = 0;
  for (const step of steps) {
    for (let attempt = 0; ; attempt++) {
      try {
        await applyStep(repo, step);
        break;
      } catch (e) {
        const code = e instanceof RepoError ? e.code : "";
        if (code === "quota_exceeded") {
          result.stopped = "quota_exceeded";
          return result;
        }
        if (code === "resource_exhausted" && attempt < MAX_RETRIES) {
          await wait(Math.min(8000, 500 * 2 ** attempt));
          continue;
        }
        result.stopped = "error";
        result.error = e instanceof Error ? e.message : String(e);
        return result;
      }
    }
    if (step.kind === "delete") result.deleted++;
    else result.written++;
    done++;
    opts.onProgress?.({ done, total: steps.length });
  }
  return result;
}
