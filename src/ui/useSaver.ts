import { useCallback, useRef, useState } from "react";
import { useToast } from "./Toast";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

/** Runs a write, tracks its status for an indicator, and toasts failures with the repository's message. */
export function useSaver() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setStatus("saving");
      try {
        await fn();
        setStatus("saved");
        timer.current = setTimeout(() => setStatus("idle"), 1500);
        return true;
      } catch (e) {
        setStatus("failed");
        toast.show(e instanceof Error ? e.message : "Could not save.", "error");
        return false;
      }
    },
    [toast],
  );
  return { status, run };
}

export function saveLabel(status: SaveStatus): string {
  switch (status) {
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "failed": return "Failed, retry";
    default: return "";
  }
}
