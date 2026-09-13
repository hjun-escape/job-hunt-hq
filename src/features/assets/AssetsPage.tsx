import { useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { formatBytes } from "../../domain/assets";
import type { AssetDoc } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { AssetEditor } from "./AssetEditor";

export function AssetsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("updated", "desc");
  const kinds = settings.pickLists.assetKinds;
  const [newKind, setNewKind] = useState(kinds[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const all = Object.values(state.assets);
  const usedBy = (id: string) => Object.values(state.applications).filter((a) => a.resumeAssetId === id || a.coverLetterAssetId === id).length;
  const countryLabel = (id: string) => settings.pickLists.countries.find((c) => c.id === id)?.label ?? id;
  const columns: Column<AssetDoc>[] = [
    { key: "name", header: "Name", render: (a) => <strong>{a.name}</strong>, sortValue: (a) => a.name },
    { key: "version", header: "Version", render: (a) => a.version, sortValue: (a) => a.version },
    { key: "targets", header: "Targets", render: (a) => <span className="row">{a.targetCountryIds.map((c) => <Chip key={c}>{countryLabel(c)}</Chip>)}</span> },
    { key: "file", header: "File", render: (a) => (a.file ? <span>{a.file.fileName} <span className="muted">({formatBytes(a.file.sizeBytes)})</span></span> : <span className="muted">no file</span>), sortValue: (a) => a.file?.fileName ?? null },
    { key: "used", header: "Used by", align: "right", render: (a) => usedBy(a.id), sortValue: (a) => usedBy(a.id) },
    { key: "updated", header: "Updated", render: (a) => a.updatedAt.slice(0, 10), sortValue: (a) => a.updatedAt },
  ];
  const create = () => {
    const name = newName.trim();
    if (!name || !newKind) return;
    void run(async () => {
      const a = await repo.createAsset({ kindId: newKind, name });
      setNewName("");
      navigate(`/assets/${a.id}`);
    });
  };
  const groups = kinds.filter((k) => all.some((a) => a.kindId === k.id));
  const orphans = all.filter((a) => !kinds.some((k) => k.id === a.kindId));
  return (
    <section>
      <h1>Assets</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">New asset kind</span>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{kinds.filter((k) => !k.archived).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        </label>
        <label className="field"><span className="field-label">New asset name</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Backend resume, Korean 이력서, …" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add asset</button>
      </div>
      {all.length === 0 ? <p className="empty">No assets yet. Add a resume version to get started; upload its PDF from the editor.</p> : null}
      {groups.map((k) => (
        <div key={k.id} className="section">
          <h2>{k.label}</h2>
          <Table rows={all.filter((a) => a.kindId === k.id)} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(a) => navigate(`/assets/${a.id}`)} selectedId={parts[0]} />
        </div>
      ))}
      {orphans.length ? <div className="section"><h2>Other</h2><Table rows={orphans} columns={columns} onRowClick={(a) => navigate(`/assets/${a.id}`)} selectedId={parts[0]} /></div> : null}
      {parts[0] ? <AssetEditor id={parts[0]} onClose={() => navigate("/assets")} /> : null}
    </section>
  );
}
