import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { allTags, emptyFilter, filterApplications, type AppFilter, type SponsorshipFilter } from "../../domain/applicationFilters";
import { daysUntil, formatForHome, isPastDate, urgency, type Urgency } from "../../domain/dates";
import { priorityScore } from "../../domain/scoring";
import type { Application, ColorToken } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column, SortDir } from "../../ui/sortRows";
import { ApplicationDetail } from "./ApplicationDetail";
import { ColumnChooser } from "./ColumnChooser";
import { loadColumnPrefs, saveColumnPrefs } from "./columnPrefs";
import { KanbanBoard } from "./KanbanBoard";
import { QuickAdd } from "./QuickAdd";

const URGENCY_COLOR: Record<Urgency, ColorToken> = { overdue: "red", urgent: "red", soon: "amber", later: "gray" };
const SPONSORSHIP_OPTIONS: { value: SponsorshipFilter; label: string }[] = [
  { value: "", label: "Any" }, { value: "needs", label: "Needs sponsorship" }, { value: "no_need", label: "No sponsorship needed" }, { value: "offered", label: "Sponsorship offered" }, { value: "not_offered", label: "Sponsorship not offered" },
];

export function ApplicationsPage({ parts, query }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const [filter, setFilter] = useState<AppFilter>(emptyFilter());
  const [sortKey, setSortKey] = useState(() => (loadColumnPrefs().includes("deadline") ? "deadline" : "company"));
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [adding, setAdding] = useState(false);
  const [visible, setVisible] = useState<string[]>(loadColumnPrefs);
  const pl = settings.pickLists;
  const tz = settings.homeTz;
  const view = query.get("view") === "board" ? "board" : "table";
  const viewQuery = view === "board" ? "?view=board" : "";

  const rows = useMemo(
    () => filterApplications(Object.values(state.applications), filter, { companies: state.companies, settings }),
    [state.applications, state.companies, settings, filter],
  );
  const tags = useMemo(() => allTags(Object.values(state.applications)), [state.applications]);

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
  const shownColumns = columns.filter((c) => visible.includes(c.key));

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const set = (p: Partial<AppFilter>) => setFilter({ ...filter, ...p });
  const chooseColumns = (keys: string[]) => {
    setVisible(keys);
    saveColumnPrefs(keys);
    if (!keys.includes(sortKey)) { setSortKey("company"); setSortDir("asc"); }
  };
  const openDetail = (id: string) => navigate(`/applications/${id}${viewQuery}`);

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Applications</h1>
        <div className="row">
          <div className="row" role="group" aria-label="View">
            <button type="button" className={view === "table" ? "btn primary" : "btn"} aria-pressed={view === "table"} onClick={() => navigate("/applications")}>Table view</button>
            <button type="button" className={view === "board" ? "btn primary" : "btn"} aria-pressed={view === "board"} onClick={() => navigate("/applications?view=board")}>Board view</button>
          </div>
          {view === "table" ? <ColumnChooser visible={visible} onChange={chooseColumns} /> : null}
          <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={repo.readOnly}>New application</button>
        </div>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Company, title, city, tag" /></label>
        <label className="field"><span className="field-label">Filter by country</span>
          <select aria-label="Filter by country" value={filter.countryId} onChange={(e) => set({ countryId: e.target.value })}>
            <option value="">All</option>{pl.countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by status</span>
          <select aria-label="Filter by status" value={filter.statusId} onChange={(e) => set({ statusId: e.target.value })}>
            <option value="">All open</option>{pl.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by tier</span>
          <select aria-label="Filter by tier" value={filter.tier} onChange={(e) => set({ tier: e.target.value as AppFilter["tier"] })}>
            <option value="">Any</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by channel</span>
          <select aria-label="Filter by channel" value={filter.channelId} onChange={(e) => set({ channelId: e.target.value })}>
            <option value="">Any</option>{pl.channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by sponsorship</span>
          <select aria-label="Filter by sponsorship" value={filter.sponsorship} onChange={(e) => set({ sponsorship: e.target.value as SponsorshipFilter })}>
            {SPONSORSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by tag</span>
          <select aria-label="Filter by tag" value={filter.tag} onChange={(e) => set({ tag: e.target.value })}>
            <option value="">Any</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={filter.includeClosed} onChange={(e) => set({ includeClosed: e.target.checked })} /> Include closed</label>
        <span className="muted">{rows.length} shown</span>
      </div>
      {view === "board" ? (
        <KanbanBoard apps={rows} includeClosed={filter.includeClosed || !!filter.statusId} selectedId={parts[0]} onOpen={openDetail} />
      ) : (
        <Table rows={rows} columns={shownColumns} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          onRowClick={(a) => openDetail(a.id)} selectedId={parts[0]}
          emptyText='No applications match. Add one with "New application".' />
      )}
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
      {parts[0] ? <ApplicationDetail id={parts[0]} onClose={() => navigate(`/applications${viewQuery}`)} /> : null}
    </section>
  );
}
