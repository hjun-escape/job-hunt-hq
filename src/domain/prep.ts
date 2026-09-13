import type { PrepItem } from "./types";

export interface PrepFilter {
  text: string;
  kindId: string;
  pattern: string;
  difficulty: string;
}

export function filterPrep(items: PrepItem[], f: PrepFilter): PrepItem[] {
  const needle = f.text.trim().toLowerCase();
  return items.filter((p) => {
    if (f.kindId && p.kindId !== f.kindId) return false;
    if (f.pattern && !p.patterns.includes(f.pattern)) return false;
    if (f.difficulty && p.difficulty !== f.difficulty) return false;
    if (needle && !`${p.title} ${p.patterns.join(" ")} ${p.companyTags.join(" ")}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function allPatterns(items: PrepItem[]): string[] {
  return [...new Set(items.flatMap((p) => p.patterns))].sort((a, b) => a.localeCompare(b));
}

export function logAttempt(item: PrepItem, today: string): Pick<PrepItem, "attempts" | "lastAttemptedAt"> {
  return { attempts: item.attempts + 1, lastAttemptedAt: today };
}
