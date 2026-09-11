import type { ReactNode } from "react";
import type { ColorToken, PickEntry } from "../domain/types";

export function Chip({ color = "gray", children, title }: { color?: ColorToken; children: ReactNode; title?: string }) {
  return <span className={`chip chip-${color}`} title={title}>{children}</span>;
}

export function PickChip({ list, id }: { list: PickEntry[]; id: string | undefined }) {
  if (!id) return <span className="muted">—</span>;
  const entry = list.find((e) => e.id === id);
  return <Chip color={entry?.color ?? "gray"}>{entry?.label ?? id}</Chip>;
}
