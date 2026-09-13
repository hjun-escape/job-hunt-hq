import { saveLabel, type SaveStatus } from "./useSaver";

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = saveLabel(status);
  return <span className={`save-indicator save-${status}`} aria-live="polite">{text}</span>;
}
