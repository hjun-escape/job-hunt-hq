import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { answerUsage, filterAnswers, type AnswerFilter } from "../../domain/answers";
import type { Answer } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { AnswerEditor } from "./AnswerEditor";

export function AnswersPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("updated", "desc");
  const pl = settings.pickLists;
  const [filter, setFilter] = useState<AnswerFilter>({ text: "", kindId: "", themeId: "", language: "" });
  const [newKind, setNewKind] = useState(pl.answerKinds[0]?.id ?? "answer");
  const [newTitle, setNewTitle] = useState("");
  const apps = Object.values(state.applications);
  const rows = useMemo(() => filterAnswers(Object.values(state.answers), filter), [state.answers, filter]);
  const set = (p: Partial<AnswerFilter>) => setFilter({ ...filter, ...p });
  const columns: Column<Answer>[] = [
    { key: "title", header: "Title", render: (a) => <strong>{a.title}</strong>, sortValue: (a) => a.title },
    { key: "kind", header: "Kind", render: (a) => <PickChip list={pl.answerKinds} id={a.kindId} />, sortValue: (a) => a.kindId },
    { key: "themes", header: "Themes", render: (a) => <span className="row">{a.themeIds.map((t) => <Chip key={t}>{pl.answerThemes.find((x) => x.id === t)?.label ?? t}</Chip>)}</span> },
    { key: "lang", header: "Language", render: (a) => a.language, sortValue: (a) => a.language },
    { key: "used", header: "Used by", align: "right", render: (a) => answerUsage(a.id, apps).length, sortValue: (a) => answerUsage(a.id, apps).length },
    { key: "updated", header: "Updated", render: (a) => a.updatedAt.slice(0, 10), sortValue: (a) => a.updatedAt },
  ];
  const create = () => {
    const title = newTitle.trim();
    if (!title) return;
    void run(async () => {
      const a = await repo.createAnswer({ kindId: newKind, title });
      setNewTitle("");
      navigate(`/answers/${a.id}`);
    });
  };
  return (
    <section>
      <h1>Answers</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Title, question, body, tag" /></label>
        <label className="field"><span className="field-label">Filter by kind</span><select value={filter.kindId} onChange={(e) => set({ kindId: e.target.value })}><option value="">Any</option>{pl.answerKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by theme</span><select value={filter.themeId} onChange={(e) => set({ themeId: e.target.value })}><option value="">Any</option>{pl.answerThemes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by language</span><select value={filter.language} onChange={(e) => set({ language: e.target.value })}><option value="">Any</option><option value="en">English</option><option value="ko">한국어</option><option value="other">Other</option></select></label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">New answer kind</span><select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{pl.answerKinds.filter((k) => !k.archived).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">New answer title</span><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Why this company, STAR: outage, 지원동기…" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add answer</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(a) => navigate(`/answers/${a.id}`)} selectedId={parts[0]} emptyText="No answers yet. Store the answers, STAR stories and email templates you reuse." />
      {parts[0] ? <AnswerEditor id={parts[0]} onClose={() => navigate("/answers")} /> : null}
    </section>
  );
}
