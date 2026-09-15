import { errorCode } from "./errors";
import type { DownloadsLike } from "./types";

/** Viewer copy for a downloads failure; null means the viewer declined and nothing should be shown. */
export function describeDownloadsError(e: unknown): string | null {
  switch (errorCode(e)) {
    case "declined": return null;
    case "rate_limited": return "A download prompt is already open. Answer it, then try again.";
    case "rejected_extension":
    case "extension_not_enabled": return "This file type cannot be saved from this view.";
    case "too_large": return "The file is too large for the destination you chose.";
    case "unavailable":
    case "not_granted":
    case "capability_disabled":
    case "capability_removed": return "Downloads are not available in this view.";
    default: return "Could not save the file. Try again.";
  }
}

/** Offers a text file. True when saved, false when declined; throws an Error carrying viewer copy otherwise. */
export async function saveText(downloads: DownloadsLike, filename: string, text: string): Promise<boolean> {
  try {
    await downloads.save({ filename, data: text });
    return true;
  } catch (e) {
    const message = describeDownloadsError(e);
    if (message === null) return false;
    throw new Error(message);
  }
}

export interface FakeDownloads extends DownloadsLike {
  /** `data` is the string form; `raw` is the payload exactly as passed (a Blob for file saves). */
  saved: { filename: string; data: string; raw: unknown }[];
}

/** Records saves instead of prompting (tests). */
export function createFakeDownloads(opts: { fail?: { code: string; message: string } } = {}): FakeDownloads {
  const saved: { filename: string; data: string; raw: unknown }[] = [];
  const fake = {
    saved,
    async save({ filename, data }: { filename: string; data: unknown }) {
      if (opts.fail) throw opts.fail;
      saved.push({ filename, data: typeof data === "string" ? data : String(data), raw: data });
      return { status: "saved" as const };
    },
  };
  return fake as unknown as FakeDownloads;
}
