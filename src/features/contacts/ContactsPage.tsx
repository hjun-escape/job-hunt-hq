import { useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { followUpDue } from "../../domain/contacts";
import { todayIso } from "../../domain/dates";
import type { Contact } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { ContactEditor } from "./ContactEditor";

export function ContactsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("name");
  const [q, setQ] = useState("");
  const [rel, setRel] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState(settings.pickLists.contactRelationships[0]?.id ?? "");
  const apps = Object.values(state.applications);
  const today = todayIso(settings.homeTz);
  const flag = (c: Contact) => followUpDue(c, apps, settings.pickLists.statuses, settings.followUpCadenceDays, today);
  const needle = q.trim().toLowerCase();
  const rows = Object.values(state.contacts).filter((c) => {
    if (rel && c.relationshipId !== rel) return false;
    if (onlyDue && !flag(c).due) return false;
    if (needle) {
      const company = c.companyId ? state.companies[c.companyId]?.name ?? "" : "";
      if (!`${c.name} ${c.email ?? ""} ${c.title ?? ""} ${company}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
  const columns: Column<Contact>[] = [
    { key: "name", header: "Name", render: (c) => <strong>{c.name}</strong>, sortValue: (c) => c.name },
    { key: "rel", header: "Relationship", render: (c) => <PickChip list={settings.pickLists.contactRelationships} id={c.relationshipId} />, sortValue: (c) => c.relationshipId },
    { key: "company", header: "Company", render: (c) => (c.companyId ? state.companies[c.companyId]?.name ?? "?" : <span className="muted">—</span>), sortValue: (c) => (c.companyId ? state.companies[c.companyId]?.name ?? null : null) },
    { key: "last", header: "Last contacted", render: (c) => c.lastContactedAt ?? <span className="muted">never</span>, sortValue: (c) => c.lastContactedAt ?? null },
    { key: "due", header: "Follow-up", render: (c) => { const f = flag(c); return f.due ? <Chip color="amber" title={f.reason}>Follow up</Chip> : <span className="muted">—</span>; }, sortValue: (c) => (flag(c).due ? 0 : 1) },
    { key: "email", header: "Email", render: (c) => c.email ?? <span className="muted">—</span>, sortValue: (c) => c.email ?? null },
  ];
  const create = () => {
    const name = newName.trim();
    if (!name || !newRel) return;
    void run(async () => {
      const c = await repo.createContact({ name, relationshipId: newRel });
      setNewName("");
      navigate(`/contacts/${c.id}`);
    });
  };
  return (
    <section>
      <h1>Contacts</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, company" /></label>
        <label className="field"><span className="field-label">Filter by relationship</span>
          <select value={rel} onChange={(e) => setRel(e.target.value)}><option value="">Any</option>{settings.pickLists.contactRelationships.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </label>
        <label className="row"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Follow-up due only</label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">New contact name</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <label className="field"><span className="field-label">New contact relationship</span>
          <select value={newRel} onChange={(e) => setNewRel(e.target.value)}>{settings.pickLists.contactRelationships.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add contact</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(c) => navigate(`/contacts/${c.id}`)} selectedId={parts[0]} emptyText="No contacts yet. Add recruiters, referrers, interviewers and references here." />
      {parts[0] ? <ContactEditor id={parts[0]} onClose={() => navigate("/contacts")} /> : null}
    </section>
  );
}
