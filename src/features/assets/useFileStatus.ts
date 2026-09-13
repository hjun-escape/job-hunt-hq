import { useEffect, useState } from "react";
import { blobUrl } from "../../capabilities/files";

export type FileStatus = "unknown" | "ok" | "missing";

/** Spec §7: a pointer whose file 404s renders as "file missing". A HEAD request settles it; anything else stays unknown. */
export function useFileStatus(assetId: string | undefined): FileStatus {
  const [status, setStatus] = useState<FileStatus>("unknown");
  useEffect(() => {
    let live = true;
    setStatus("unknown");
    if (!assetId || typeof fetch !== "function") return;
    fetch(blobUrl(assetId), { method: "HEAD" })
      .then((r) => { if (live) setStatus(r.status === 404 ? "missing" : "ok"); })
      .catch(() => { /* relative URL outside the platform, offline, etc.: stay unknown */ });
    return () => { live = false; };
  }, [assetId]);
  return status;
}
