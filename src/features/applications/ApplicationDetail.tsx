import { useState } from "react";
import { priorityScore, suggestedTier } from "../../domain/scoring";
import type { Tier } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";
import { ActivityTab } from "./ActivityTab";
import { AnswersTab } from "./AnswersTab";
import { InterviewsTab } from "./InterviewsTab";
import { NotesTab } from "./NotesTab";
import { OverviewTab } from "./OverviewTab";
import type { AppPatch } from "./types";

export type { AppPatch } from "./types";

type Tab = "overview" | "interviews" | "answers" | "activity" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "interviews", label: "Interviews" },
  { id: "answers", label: "Answers" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
];

export function ApplicationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("overview");
  const app = state.applications[id];

  if (!app) {
    return (
      <Drawer open title="Application not found" onClose={onClose}>
        <p className="muted">This application no longer exists.</p>
      </Drawer>
    );
  }

  const company = state.companies[app.companyId];
  const patch = (p: AppPatch) => run(() => (typeof p === "function" ? repo.modify("applications", id, p) : repo.update("applications", id, p)));
  const score = priorityScore(app, settings.priorityWeights);
  const remove = async () => {
    const ok = await confirm({ title: `Delete ${app.title} at ${company?.name ?? "?"}?`, message: "Interviews linked to it lose their link. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("applications", id)))) onClose();
  };

  return (
    <Drawer open wide onClose={onClose}
      title={<span>{company?.name ?? "?"} <span className="muted">·</span> {app.title}</span>}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" onClick={() => void remove()} disabled={repo.readOnly}>Delete application</button></>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Status</span>
          <select aria-label="Application status" value={app.statusId} onChange={(e) => void run(() => repo.changeStatus(id, e.target.value))}>
            {settings.pickLists.statuses.filter((s) => !s.archived || s.id === app.statusId).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Tier</span>
          <select aria-label="Application tier" value={app.tier ?? ""} onChange={(e) => void patch({ tier: (e.target.value || null) as Tier | null })}>
            <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Score</span>
          <span>{score ?? "—"}{score != null ? <span className="muted"> (suggests {suggestedTier(score)})</span> : null}</span>
        </div>
      </div>
      <div className="tabs" role="tablist" onKeyDown={(e) => {
        const idx = TABS.findIndex((t) => t.id === tab);
        const go = (n: number) => { const next = TABS[(n + TABS.length) % TABS.length]; setTab(next.id); document.getElementById(`tab-${next.id}`)?.focus(); e.preventDefault(); };
        if (e.key === "ArrowRight") go(idx + 1);
        else if (e.key === "ArrowLeft") go(idx - 1);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(TABS.length - 1);
      }}>
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" ? <OverviewTab app={app} patch={patch} />
          : tab === "interviews" ? <InterviewsTab app={app} />
          : tab === "answers" ? <AnswersTab app={app} patch={patch} />
          : tab === "activity" ? <ActivityTab app={app} />
          : <NotesTab app={app} patch={patch} />}
      </div>
    </Drawer>
  );
}
