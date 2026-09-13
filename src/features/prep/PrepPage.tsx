import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { allPatterns, filterPrep, type PrepFilter } from "../../domain/prep";
import type { PrepItem } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { PrepEditor } from "./PrepEditor";

export function PrepPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("updated", "desc");
  const pl = settings.pickLists;
  const [filter, setFilter] = useState<PrepFilter>({ text: "", kindId: "", pattern: "", difficulty: "" });
  const [newKind, setNewKind] = useState(pl.prepKinds[0]?.id ?? "coding");
  const [newTitle, setNewTitle] = useState("");
  const all = Object.values(state.prep);
  const rows = useMemo(() => filterPrep(all, filter), [all, filter]);
  const set = (p: Partial<PrepFilter>) => setFilter({ ...filter, ...p });
  const columns: Column<PrepItem>[] = [
    { key: "title", header: "Title", render: (p) => <strong>{p.title}</strong>, sortValue: (p) => p.title },
    { key: "kind", header: "Kind", render: (p) => <PickChip list={pl.prepKinds} id={p.kindId} />, sortValue: (p) => p.kindId },
    { key: "patterns", header: "Patterns", render: (p) => <span className="row">{p.patterns.map((x) => <Chip key={x}>{x}</Chip>)}</span> },
    { key: "difficulty", header: "Difficulty", render: (p) => p.difficulty ?? <span className="muted">—</span>, sortValue: (p) => p.difficulty ? { easy: 1, medium: 2, hard: 3 }[p.difficulty] : null },
    { key: "confidence", header: "Confidence", align: "right", render: (p) => (p.confidence == null ? <span className="muted">—</span> : `${p.confidence}/5`), sortValue: (p) => p.confidence },
    { key: "attempts", header: "Attempts", align: "right", render: (p) => p.attempts, sortValue: (p) => p.attempts },
    { key: "last", header: "Last attempted", render: (p) => p.lastAttemptedAt ?? <span className="muted">never</span>, sortValue: (p) => p.lastAttemptedAt ?? null },
    { key: "updated", header: "Updated", render: (p) => p.updatedAt.slice(0, 10), sortValue: (p) => p.updatedAt },
  ];
  const create = () => {
    const title = newTitle.trim();
    if (!title) return;
    void run(async () => {
      const p = await repo.createPrep({ kindId: newKind, title });
      setNewTitle("");
      navigate(`/prep/${p.id}`);
    });
  };
  return (
    <section>
      <h1>Prep</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Title, pattern, company" /></label>
        <label className="field"><span className="field-label">Filter by kind</span><select value={filter.kindId} onChange={(e) => set({ kindId: e.target.value })}><option value="">Any</option>{pl.prepKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by pattern</span><select value={filter.pattern} onChange={(e) => set({ pattern: e.target.value })}><option value="">Any</option>{allPatterns(all).map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by difficulty</span><select value={filter.difficulty} onChange={(e) => set({ difficulty: e.target.value })}><option value="">Any</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">New prep kind</span><select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{pl.prepKinds.filter((k) => !k.archived).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">New prep title</span><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Two Sum, Design a rate limiter, 'Tell me about a conflict'…" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add prep item</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(p) => navigate(`/prep/${p.id}`)} selectedId={parts[0]} emptyText="No prep items yet. Track coding problems, system design topics and behavioral stories here." />
      {parts[0] ? <PrepEditor id={parts[0]} onClose={() => navigate("/prep")} /> : null}
    </section>
  );
}
