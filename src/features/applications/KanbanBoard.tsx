import { useState, type DragEvent } from "react";
import { daysUntil, formatForHome, urgency } from "../../domain/dates";
import { kanbanColumns } from "../../domain/kanban";
import type { Application, ColorToken } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip } from "../../ui/Chip";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const URGENCY_COLOR: Record<ReturnType<typeof urgency>, ColorToken> = { overdue: "red", urgent: "red", soon: "amber", later: "gray" };

interface Props {
  apps: Application[];
  includeClosed: boolean;
  selectedId?: string;
  onOpen: (id: string) => void;
}

export function KanbanBoard({ apps, includeClosed, selectedId, onOpen }: Props) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const [over, setOver] = useState<string | null>(null);
  const columns = kanbanColumns(apps, settings, includeClosed);
  const targets = settings.pickLists.statuses.filter((s) => !s.archived);
  const move = (appId: string, statusId: string) => void run(() => repo.changeStatus(appId, statusId));
  const label = (a: Application) => `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}`;
  const onDrop = (e: DragEvent<HTMLElement>, statusId: string) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id && state.applications[id] && state.applications[id].statusId !== statusId) move(id, statusId);
  };
  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end" }}><SaveIndicator status={status} /></div>
      <div className="kanban">
        {columns.map(({ status: s, apps: cards }) => (
          <section key={s.id} className={over === s.id ? "kanban-col over" : "kanban-col"} aria-label={s.label}
            onDragOver={(e) => { e.preventDefault(); if (over !== s.id) setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => onDrop(e, s.id)}>
            <h3 className="kanban-head">{s.label} <span className="muted">{cards.length}</span></h3>
            {cards.map((a) => {
              const deadline = a.deadline ? formatForHome(a.deadline, settings.homeTz) : null;
              return (
                <article key={a.id} className={selectedId === a.id ? "kanban-card selected" : "kanban-card"} draggable={!repo.readOnly} tabIndex={0}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => onOpen(a.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(a.id); }}>
                  <div><strong>{state.companies[a.companyId]?.name ?? "?"}</strong></div>
                  <div>{a.title}</div>
                  <div className="row" style={{ marginTop: 4 }}>
                    {a.tier ? <Chip color="blue">{a.tier}</Chip> : null}
                    {a.deadline && deadline ? <Chip color={URGENCY_COLOR[urgency(daysUntil(a.deadline.at, settings.homeTz))]} title={deadline.source ?? undefined}>{deadline.home}</Chip> : null}
                  </div>
                  <select className="kanban-move" aria-label={`Move ${label(a)} to`} value={a.statusId} disabled={repo.readOnly}
                    onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => move(a.id, e.target.value)}>
                    {targets.concat(targets.some((t) => t.id === a.statusId) ? [] : settings.pickLists.statuses.filter((t) => t.id === a.statusId)).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </article>
              );
            })}
            {cards.length === 0 ? <p className="muted kanban-empty">Drop here</p> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
