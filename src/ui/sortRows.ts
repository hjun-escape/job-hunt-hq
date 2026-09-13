import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  width?: string;
  align?: "left" | "right";
}

/** Stable sort; empty values (null, undefined, "") always sort last regardless of direction. */
export function sortRows<T>(rows: T[], column: Column<T> | undefined, dir: SortDir): T[] {
  const sv = column?.sortValue;
  if (!sv) return rows;
  const empty = (v: unknown) => v == null || v === "";
  return [...rows].sort((a, b) => {
    const av = sv(a);
    const bv = sv(b);
    if (empty(av) && empty(bv)) return 0;
    if (empty(av)) return 1;
    if (empty(bv)) return -1;
    const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "asc" ? c : -c;
  });
}
