import { useState } from "react";
import type { SortDir } from "./sortRows";

/** Column sort state for a Table: same column toggles direction, a new column starts ascending. */
export function useSort(initialKey: string, initialDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  const onSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  return { sortKey, sortDir, onSort };
}
