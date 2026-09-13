import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { emptyFilter, filterApplications, type AppFilter } from "../../domain/applicationFilters";
import { daysUntil, formatForHome, isPastDate, urgency, type Urgency } from "../../domain/dates";
import { priorityScore } from "../../domain/scoring";
import type { Application, ColorToken } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column, SortDir } from "../../ui/sortRows";
import { ApplicationDetail } from "./ApplicationDetail";
import { QuickAdd } from "./QuickAdd";

const URGENCY_COLOR: Record<Urgency, ColorToken> = { overdue: "red", urgent: "red", soon: "amber", later: "gray" };

export function ApplicationsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const [filter, setFilter] = useState<AppFilter>(emptyFilter());
  const [sortKey, setSortKey] = useState("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [adding, setAdding] = useState(false);
  const pl = settings.pickLists;
  const tz = settings.homeTz;

  const rows = useMemo(
    () => filterApplications(Object.values(state.applications), filter, { companies: state.companies, settings }),
    [state.applications, state.companies, settings, filter],
  );

  const columns: Column<Application>[] = [
    { key: "company", header: "Company", render: (a) => <strong>{state.companies[a.companyId]?.name ?? "?"}</strong>, sortValue: (a) => state.companies[a.companyId]?.name ?? null },
    { key: "title", header: "Role", render: (a) => <>{a.title}{a.reqId ? <span className="muted"> · {a.reqId}</span> : null}</>, sortValue: (a) => a.title },
    {
      key: "where", header: "Where",
      render: (a) => (
        <>
          {pl.countries.find((c) => c.id === a.countryId)?.label ?? a.countryId}
          {a.city ? ` · ${a.city}` : ""}
          {a.workModeId ? <span className="muted"> · {pl.workModes.find((w) => w.id === a.workModeId)?.label}</span> : null}
        </>
      ),
      sortValue: (a) => `${a.countryId} ${a.city ?? ""}`,
    },
    { key: "status", header: "Status", render: (a) => <PickChip list={pl.statuses} id={a.statusId} />, sortValue: (a) => pl.statuses.find((s) => s.id === a.statusId)?.stageRank ?? null },
    {
      key: "score", header: "Tier / score",
      render: (a) => <>{a.tier ?? <span className="muted">—</span>} <span className="muted">{priorityScore(a, settings.priorityWeights) ?? ""}</span></>,
      sortValue: (a) => priorityScore(a, settings.priorityWeights),
    },
    {
      key: "deadline", header: "Deadline",
      render: (a) => {
        if (!a.deadline) return <span className="muted">—</span>;
        const f = formatForHome(a.deadline, tz);
        const u = urgency(daysUntil(a.deadline.at, tz));
        return <Chip color={URGENCY_COLOR[u]} title={f.source ?? undefined}>{f.home}</Chip>;
      },
      sortValue: (a) => a.deadline?.at ?? null,
    },
    {
      key: "next", header: "Next action",
      render: (a) => a.nextAction ? (
        <>{a.nextAction}{a.nextActionDue ? <span className={isPastDate(a.nextActionDue, tz) ? "chip chip-red" : "muted"}> {a.nextActionDue}</span> : null}</>
      ) : <span className="muted">—</span>,
      sortValue: (a) => a.nextActionDue ?? null,
    },
    { key: "channel", header: "Channel", render: (a) => <PickChip list={pl.channels} id={a.channelId} />, sortValue: (a) => a.channelId },
    { key: "updated", header: "Updated", render: (a) => DateTime.fromISO(a.updatedAt).setZone(tz).toFormat("yyyy-MM-dd"), sortValue: (a) => a.updatedAt },
  ];

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const set = (p: Partial<AppFilter>) => setFilter({ ...filter, ...p });

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Applications</h1>
        <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={repo.readOnly}>New application</button>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Company, title, city, tag" /></label>
        <label className="field"><span className="field-label">Country</span>
          <select value={filter.countryId} onChange={(e) => set({ countryId: e.target.value })}>
            <option value="">All</option>{pl.countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Status</span>
          <select value={filter.statusId} onChange={(e) => set({ statusId: e.target.value })}>
            <option value="">All open</option>{pl.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Tier</span>
          <select value={filter.tier} onChange={(e) => set({ tier: e.target.value as AppFilter["tier"] })}>
            <option value="">Any</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <label className="field"><span className="field-label">Channel</span>
          <select value={filter.channelId} onChange={(e) => set({ channelId: e.target.value })}>
            <option value="">Any</option>{pl.channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={filter.includeClosed} onChange={(e) => set({ includeClosed: e.target.checked })} /> Include closed</label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <Table rows={rows} columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
        onRowClick={(a) => navigate(`/applications/${a.id}`)} selectedId={parts[0]}
        emptyText='No applications match. Add one with "New application".' />
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
      {parts[0] ? <ApplicationDetail id={parts[0]} onClose={() => navigate("/applications")} /> : null}
    </section>
  );
}
