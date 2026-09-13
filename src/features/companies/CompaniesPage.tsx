import { useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import type { Company } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column, SortDir } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { CompanyEditor } from "./CompanyEditor";

export function CompaniesPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const appCount = (id: string) => Object.values(state.applications).filter((a) => a.companyId === id).length;
  const needle = q.trim().toLowerCase();
  const rows = Object.values(state.companies).filter((c) => !needle || c.name.toLowerCase().includes(needle));

  const columns: Column<Company>[] = [
    { key: "name", header: "Company", render: (c) => <strong>{c.name}</strong>, sortValue: (c) => c.name },
    { key: "hq", header: "HQ", render: (c) => c.hq ?? <span className="muted">—</span>, sortValue: (c) => c.hq ?? null },
    { key: "industry", header: "Industry", render: (c) => c.industry ?? <span className="muted">—</span>, sortValue: (c) => c.industry ?? null },
    { key: "apps", header: "Applications", align: "right", render: (c) => appCount(c.id), sortValue: (c) => appCount(c.id) },
    {
      key: "sponsorship", header: "Sponsorship",
      render: (c) => (
        <span className="row">
          {settings.pickLists.countries.map((co) => {
            const p = c.sponsorship[co.id]?.policy ?? "unknown";
            return <Chip key={co.id} color={p === "yes" ? "green" : p === "no" ? "red" : "gray"} title={c.sponsorship[co.id]?.note}>{co.id}: {p}</Chip>;
          })}
        </span>
      ),
    },
    { key: "updated", header: "Updated", render: (c) => c.updatedAt.slice(0, 10), sortValue: (c) => c.updatedAt },
  ];

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      const c = await repo.createCompany({ name });
      setNewName("");
      navigate(`/companies/${c.id}`);
    });
  };

  return (
    <section>
      <h1>Companies</h1>
      <div className="toolbar">
        <label className="field">
          <span className="field-label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name" />
        </label>
        <label className="field">
          <span className="field-label">New company</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
        </label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add company</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
        onRowClick={(c) => navigate(`/companies/${c.id}`)} selectedId={parts[0]}
        emptyText="No companies yet. Add one above, or create an application and its company is created for you." />
      {parts[0] ? <CompanyEditor id={parts[0]} onClose={() => navigate("/companies")} /> : null}
    </section>
  );
}
