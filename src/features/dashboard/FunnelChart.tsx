import { useState } from "react";
import { funnel, funnelBy, openStages, type FunnelGrouping, type FunnelStage } from "../../domain/funnel";
import type { Application, AssetDoc, Settings } from "../../domain/types";

type Grouping = "all" | FunnelGrouping;
const OPTIONS: { id: Grouping; label: string }[] = [
  { id: "all", label: "All" },
  { id: "channel", label: "By channel" },
  { id: "resume", label: "By resume version" },
];

function Bars({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.reached));
  return (
    <ul className="funnel">
      {stages.map((s) => (
        <li key={s.id} className="funnel-row">
          <span className="funnel-label">{s.label}</span>
          <span className="funnel-track"><span className="funnel-bar" style={{ width: `${Math.round((s.reached / max) * 100)}%` }} /></span>
          <span className="funnel-count">{`${s.label}: ${s.reached} reached${s.conversion == null ? "" : ` · ${Math.round(s.conversion * 100)}%`}`}</span>
        </li>
      ))}
    </ul>
  );
}

export function FunnelChart({ apps, settings, assets }: { apps: Application[]; settings: Settings; assets: Record<string, AssetDoc> }) {
  const [grouping, setGrouping] = useState<Grouping>("all");
  const stages = openStages(settings);
  const groupLabel = (key: string) => grouping === "channel"
    ? (settings.pickLists.channels.find((c) => c.id === key)?.label ?? key)
    : (key ? (assets[key]?.name ?? "Deleted resume") : "No resume linked");
  return (
    <section className="section" aria-labelledby="funnel-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="funnel-title">Funnel</h2>
        <div className="row" role="radiogroup" aria-label="Funnel grouping">
          {OPTIONS.map((o) => (
            <label key={o.id} className="row"><input type="radio" name="funnel-grouping" value={o.id} checked={grouping === o.id} onChange={() => setGrouping(o.id)} /> {o.label}</label>
          ))}
        </div>
      </div>
      <p className="muted">How many applications reached each stage (lost ones still count for the stages they reached) and the conversion from the previous stage.</p>
      {apps.length === 0 ? <p className="muted">No applications yet.</p>
        : grouping === "all" ? <Bars stages={funnel(apps, stages)} />
        : [...funnelBy(apps, stages, grouping)].sort((a, b) => groupLabel(a[0]).localeCompare(groupLabel(b[0]))).map(([key, rows]) => (
          <div key={key || "none"} className="funnel-group">
            <h3>{groupLabel(key)}</h3>
            <Bars stages={rows} />
          </div>
        ))}
    </section>
  );
}
