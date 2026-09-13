import { useEffect, useState } from "react";
import { formatBytes } from "../../domain/assets";
import { useApp } from "../../store/context";
import { useCapability } from "../../store/useCapability";

export function StorageMeter() {
  const { caps } = useApp();
  const assets = useCapability(caps.assets);
  const [usage, setUsage] = useState<{ files: number; bytes: number; maxFiles: number; maxBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    if (!assets) return;
    let live = true;
    assets.list().then((r) => { if (live) setUsage(r.usage); }, () => { if (live) setError("Could not read storage usage."); });
    return () => { live = false; };
  };
  useEffect(() => {
    if (!assets) return;
    load();
  }, [assets]);
  if (assets === undefined) return <p className="muted">Checking file storage…</p>;
  if (assets === null) return <p className="muted">File storage is not available in this view.</p>;
  if (error) return <p className="muted">{error}</p>;
  if (!usage) return <p className="muted">Loading…</p>;
  const pct = usage.maxBytes > 0 ? Math.min(100, Math.round((usage.bytes / usage.maxBytes) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
        <p style={{ margin: 0 }}>{usage.files} file{usage.files === 1 ? "" : "s"} · {formatBytes(usage.bytes)} of {formatBytes(usage.maxBytes)} ({pct}%) · {usage.maxFiles - usage.files} file slots left</p>
        <button type="button" className="btn" aria-label="Refresh storage usage" onClick={() => void load()}>Refresh</button>
      </div>
      <progress max={100} value={pct} aria-label="Storage used" style={{ width: "100%" }} />
    </div>
  );
}
