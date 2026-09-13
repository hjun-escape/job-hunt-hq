import { useMemo } from "react";
import { DateTime } from "luxon";
import { dueThisWeek, followUpFlags, overdue, upcomingInterviews } from "../../domain/agenda";
import { formatSlot } from "../../domain/interviews";
import { useAppState, useSettings } from "../../store/context";
import { PickChip } from "../../ui/Chip";
import { AgendaList } from "./AgendaList";
import { FunnelChart } from "./FunnelChart";

export function DashboardPage() {
  const state = useAppState();
  const settings = useSettings();
  const now = DateTime.utc();
  const records = { applications: state.applications, companies: state.companies, contacts: state.contacts, interviews: state.interviews };
  const apps = useMemo(() => Object.values(state.applications), [state.applications]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of apps) m.set(a.statusId, (m.get(a.statusId) ?? 0) + 1);
    return m;
  }, [apps]);
  const open = settings.pickLists.statuses.filter((s) => s.group === "open" && !s.archived);
  const due = dueThisWeek(records, settings, now);
  const late = overdue(records, settings, now);
  const flags = followUpFlags(records, settings, now);
  const upcoming = upcomingInterviews(Object.values(state.interviews), settings.homeTz, now, 5);
  const label = (applicationId: string) => {
    const a = state.applications[applicationId];
    return a ? `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}` : "(deleted application)";
  };
  return (
    <section>
      <h1>Dashboard</h1>
      <div className="cards">
        {open.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-label">{s.label}</div>
            <div className="card-value">{counts.get(s.id) ?? 0}</div>
          </div>
        ))}
        <div className="card">
          <div className="card-label">Total</div>
          <div className="card-value">{apps.length}</div>
        </div>
      </div>
      <div className="grid-2 dashboard-grid">
        <AgendaList title="Overdue" items={late} homeTz={settings.homeTz} tone="red" emptyText="Nothing overdue. Nice." />
        <AgendaList title="Due this week" items={due} homeTz={settings.homeTz} tone="amber" emptyText="Nothing due in the next seven days." />
        <section className="section" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title">Upcoming interviews</h2>
          {upcoming.length === 0 ? <p className="muted">No interviews scheduled.</p> : (
            <ul className="agenda">
              {upcoming.map((iv) => (
                <li key={iv.id} className="agenda-item">
                  <PickChip list={settings.pickLists.roundTypes} id={iv.roundTypeId} />
                  <a href={`#/interviews/${iv.id}`}>{label(iv.applicationId)}</a>
                  <span className="muted">{formatSlot(iv.scheduledAt, settings.homeTz)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="section" aria-labelledby="followups-title">
          <h2 id="followups-title">Follow-ups</h2>
          {flags.length === 0 ? <p className="muted">No one is waiting on you.</p> : (
            <ul className="agenda">
              {flags.map(({ contact, followUp }) => (
                <li key={contact.id} className="agenda-item">
                  <PickChip list={settings.pickLists.contactRelationships} id={contact.relationshipId} />
                  <a href={`#/contacts/${contact.id}`}>{contact.name}</a>
                  <span className="muted">{followUp.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <FunnelChart apps={apps} settings={settings} assets={state.assets} />
    </section>
  );
}
