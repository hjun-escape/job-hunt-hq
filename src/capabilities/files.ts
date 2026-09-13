import { nowIso } from "../domain/ids";
import type { StoredFile } from "../domain/types";
import { errorCode } from "./errors";
import type { AssetsLike } from "./types";

/** Spec §7: PDF for documents, images for portfolio previews. Word files are refused with a hint. */
export const DOCUMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function blobUrl(assetId: string): string {
  return `/_blob/${assetId}`;
}

export function validateDocument(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!DOCUMENT_TYPES.has(file.type)) {
    return name.endsWith(".doc") || name.endsWith(".docx") ? "Word files are not accepted. Export to PDF first." : "Only PDF, PNG, JPEG and WebP files are accepted.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is over 20 MB. Compress it or split it.";
  return null;
}

export function describeAssetError(e: unknown): string {
  switch (errorCode(e)) {
    case "too_large": return "That file is over 20 MB. Compress it or split it.";
    case "unsupported_type": return "Only PDF, PNG, JPEG and WebP files are accepted. Export documents to PDF first.";
    case "quota_or_state": return "File storage is full. Remove a file you no longer need and try again.";
    case "rate_limited": return "Too many uploads at once. Wait a moment and try again.";
    case "upstream_auth": return "Sign in again to upload files.";
    case "store_unavailable": return "File storage is temporarily unavailable. Try again.";
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return "File uploads are not available in this view.";
    default: return "Could not upload the file. Try again.";
  }
}

export class FileError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FileError";
  }
}

/** Validate, upload, and return the block to store on the owning record. Retries once on `store_unavailable`. */
export async function uploadDocument(assets: AssetsLike, file: File, now: () => string = nowIso): Promise<StoredFile> {
  const problem = validateDocument(file);
  if (problem) throw new FileError("invalid", problem);
  const attempt = () => assets.upload(file, { type: file.type });
  let result: Awaited<ReturnType<AssetsLike["upload"]>>;
  try {
    result = await attempt();
  } catch (e) {
    if (errorCode(e) !== "store_unavailable") throw new FileError(errorCode(e) ?? "unknown", describeAssetError(e));
    try {
      result = await attempt();
    } catch (e2) {
      throw new FileError(errorCode(e2) ?? "unknown", describeAssetError(e2));
    }
  }
  return { assetId: result.id, fileName: file.name, sizeBytes: result.sizeBytes, contentType: result.contentType, uploadedAt: now() };
}
