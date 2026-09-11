import { useMemo } from "react";
import { useAppState, useSettings } from "../store/context";

export function DashboardPage() {
  const { applications } = useAppState();
  const settings = useSettings();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of Object.values(applications)) m.set(a.statusId, (m.get(a.statusId) ?? 0) + 1);
    return m;
  }, [applications]);
  const open = settings.pickLists.statuses.filter((s) => s.group === "open" && !s.archived);
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
          <div className="card-value">{Object.keys(applications).length}</div>
        </div>
      </div>
    </section>
  );
}
