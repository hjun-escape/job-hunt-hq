export const COLUMN_LABELS: Record<string, string> = {
  company: "Company", title: "Role", where: "Where", status: "Status", score: "Tier / score", deadline: "Deadline", next: "Next action", channel: "Channel", updated: "Updated",
};
export const ALL_COLUMN_KEYS = Object.keys(COLUMN_LABELS);
export const LOCKED_COLUMNS = ["company", "title"];
const KEY = "jhq.applications.columns";

/** Per-viewer convenience in localStorage; anything unreadable falls back to every column. */
export function loadColumnPrefs(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return ALL_COLUMN_KEYS;
    const chosen: unknown = JSON.parse(raw);
    if (!Array.isArray(chosen)) return ALL_COLUMN_KEYS;
    return ALL_COLUMN_KEYS.filter((k) => LOCKED_COLUMNS.includes(k) || chosen.includes(k));
  } catch {
    return ALL_COLUMN_KEYS;
  }
}
export function saveColumnPrefs(keys: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* private mode or full: the choice just does not persist */
  }
}
