import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { BUCKET_LABELS, BUCKET_ORDER, formatSlot, groupInterviews } from "../../domain/interviews";
import type { ColorToken, Interview } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { InterviewEditor } from "./InterviewEditor";

const OUTCOME_COLOR: Record<Interview["outcome"], ColorToken> = { pending: "gray", passed: "green", failed: "red", cancelled: "amber" };

export function InterviewsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("when");
  const pl = settings.pickLists;
  const openStatuses = new Set(pl.statuses.filter((s) => s.group === "open").map((s) => s.id));
  const openApps = Object.values(state.applications).filter((a) => openStatuses.has(a.statusId));
  const [newApp, setNewApp] = useState("");
  const [newType, setNewType] = useState(pl.roundTypes[0]?.id ?? "");
  const all = Object.values(state.interviews);
  const groups = useMemo(() => groupInterviews(all, settings.homeTz), [all, settings.homeTz]);
  const appLabel = (i: Interview) => { const a = state.applications[i.applicationId]; return a ? `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}` : "(deleted application)"; };
  const columns: Column<Interview>[] = [
    { key: "when", header: "When", render: (i) => formatSlot(i.scheduledAt, settings.homeTz), sortValue: (i) => i.scheduledAt?.at ?? null },
    { key: "app", header: "Application", render: (i) => appLabel(i), sortValue: (i) => appLabel(i) },
    { key: "type", header: "Round", render: (i) => <PickChip list={pl.roundTypes} id={i.roundTypeId} />, sortValue: (i) => i.roundTypeId },
    { key: "outcome", header: "Outcome", render: (i) => <Chip color={OUTCOME_COLOR[i.outcome]}>{i.outcome}</Chip>, sortValue: (i) => i.outcome },
    { key: "prep", header: "Prep", render: (i) => (i.prepChecklist.length ? `${i.prepChecklist.filter((c) => c.done).length}/${i.prepChecklist.length}` : <span className="muted">—</span>) },
  ];
  const create = () => {
    if (!newApp || !newType) return;
    void run(async () => {
      const iv = await repo.createInterview({ applicationId: newApp, roundTypeId: newType });
      navigate(`/interviews/${iv.id}`);
    });
  };
  return (
    <section>
      <h1>Interviews</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">New round application</span>
          <select value={newApp} onChange={(e) => setNewApp(e.target.value)}>
            <option value="">Choose an open application</option>
            {openApps.map((a) => <option key={a.id} value={a.id}>{state.companies[a.companyId]?.name ?? "?"} · {a.title}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">New round type</span>
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>{pl.roundTypes.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </label>
        <button type="button" className="btn primary" onClick={create} disabled={!newApp || repo.readOnly}>Add round</button>
      </div>
      {all.length === 0 ? <p className="empty">No interview rounds yet. Add one for an open application.</p> : null}
      {BUCKET_ORDER.filter((b) => groups[b].length > 0).map((b) => (
        <div key={b} className="section">
          <h2>{BUCKET_LABELS[b]}</h2>
          <ul className="slots">
            {groups[b].map((i) => (
              <li key={i.id}>
                <button type="button" className="slot" onClick={() => navigate(`/interviews/${i.id}`)}>
                  <span className="slot-when">{formatSlot(i.scheduledAt, settings.homeTz)}</span>
                  <span>{appLabel(i)}</span>
                  <span className="row"><PickChip list={pl.roundTypes} id={i.roundTypeId} /><Chip color={OUTCOME_COLOR[i.outcome]}>{i.outcome}</Chip></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {all.length ? <><h2>All rounds</h2><Table rows={all} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(i) => navigate(`/interviews/${i.id}`)} selectedId={parts[0]} /></> : null}
      {parts[0] ? <InterviewEditor id={parts[0]} onClose={() => navigate("/interviews")} /> : null}
    </section>
  );
}
