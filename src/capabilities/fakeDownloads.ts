import type { DownloadsLike } from "./types";

/** Local-dev stand-in: triggers a browser download through a temporary anchor. */
export function createAnchorDownloads(): DownloadsLike {
  return {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { status: "saved" as const };
    },
  } as DownloadsLike;
}
