import { useState } from "react";
import type { Company, SponsorshipPolicy } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { Field, TagInput, TextArea, TextField, UrlField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const isSafeUrl = (u: string) => /^https?:\/\//i.test(u);

export function CompanyEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [newSource, setNewSource] = useState({ label: "", url: "" });
  const company = state.companies[id];
  const ro = repo.readOnly;

  if (!company) {
    return (
      <Drawer open title="Company not found" onClose={onClose}>
        <p className="muted">This company no longer exists.</p>
      </Drawer>
    );
  }

  const linked = Object.values(state.applications).filter((a) => a.companyId === id);
  const contacts = Object.values(state.contacts).filter((c) => c.companyId === id).sort((a, b) => a.name.localeCompare(b.name));
  const patch = (p: Partial<Company>) => run(() => repo.update("companies", id, p));
  /** Reads the company at write time, inside its own write chain -- so the sponsorship matrix
   * and sources list never clobber a sibling field that a concurrent write just set. */
  const modify = (fn: (current: Company) => Partial<Company>) => run(() => repo.modify("companies", id, fn));
  const setPolicy = (countryId: string, p: Partial<SponsorshipPolicy>) =>
    modify((cur) => {
      const existing: SponsorshipPolicy = cur.sponsorship[countryId] ?? { policy: "unknown" };
      return { sponsorship: { ...cur.sponsorship, [countryId]: { ...existing, ...p } } };
    });
  const remove = async () => {
    if (linked.length || contacts.length) return;
    const ok = await confirm({ title: `Delete ${company.name}?`, message: "Notes and sponsorship info on this company are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("companies", id)))) onClose();
  };
  const deleteBlockedBy = [linked.length ? "applications" : null, contacts.length ? "contacts" : null].filter(Boolean).join(" and ");

  return (
    <Drawer
      open
      title={company.name}
      onClose={onClose}
      footer={
        <>
          <SaveIndicator status={status} />
          <button type="button" className="btn danger" disabled={linked.length > 0 || contacts.length > 0 || repo.readOnly}
            title={deleteBlockedBy ? `Reassign or delete its ${deleteBlockedBy} first` : undefined} onClick={() => void remove()}>
            Delete company
          </button>
        </>
      }
    >
      <div className="grid-2">
        <TextField label="Name" value={company.name} disabled={ro} onCommit={(v) => (v.trim() ? patch({ name: v.trim() }) : false)} />
        <UrlField label="Website" value={company.website ?? ""} disabled={ro} onCommit={(v) => patch({ website: v || undefined })} />
        <TextField label="Industry" value={company.industry ?? ""} disabled={ro} onCommit={(v) => patch({ industry: v || undefined })} />
        <TextField label="Size" value={company.size ?? ""} disabled={ro} onCommit={(v) => patch({ size: v || undefined })} />
        <TextField label="HQ" value={company.hq ?? ""} disabled={ro} onCommit={(v) => patch({ hq: v || undefined })} />
      </div>
      <TagInput label="Office cities" value={company.cities} disabled={ro} onChange={(fn) => void modify((cur) => ({ cities: fn(cur.cities) }))} />
      <TagInput label="Tech stack" value={company.techStack} disabled={ro} onChange={(fn) => void modify((cur) => ({ techStack: fn(cur.techStack) }))} />

      <h3>Sponsorship by country</h3>
      {settings.pickLists.countries.map((co) => {
        const p = company.sponsorship[co.id];
        return (
          <div className="grid-2" key={co.id}>
            <Field label={`${co.label} sponsorship`} htmlFor={`sp-${co.id}`}>
              <select id={`sp-${co.id}`} value={p?.policy ?? "unknown"} disabled={ro} onChange={(e) => void setPolicy(co.id, { policy: e.target.value as SponsorshipPolicy["policy"] })}>
                <option value="unknown">Unknown</option>
                <option value="yes">Sponsors</option>
                <option value="no">Does not sponsor</option>
              </select>
            </Field>
            <TextField label={`${co.label} note`} value={p?.note ?? ""} disabled={ro} onCommit={(v) => setPolicy(co.id, { note: v || undefined })} />
          </div>
        );
      })}

      <TextArea label="Interview process" rows={6} value={company.interviewProcess} disabled={ro} onCommit={(v) => patch({ interviewProcess: v })}
        placeholder="Rounds, formats, what people report on Blind / Glassdoor / 잡플래닛" />

      <h3>Sources</h3>
      {company.sources.length ? (
        <ul>
          {company.sources.map((s, i) => (
            <li key={`${s.url}-${i}`}>
              {isSafeUrl(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.label || s.url}</a> : <span>{s.label || s.url}</span>}{" "}
              <button type="button" className="btn ghost" aria-label={`Remove source ${s.label || s.url}`} disabled={ro} onClick={() => void modify((cur) => ({ sources: cur.sources.filter((x) => !(x.url === s.url && x.label === s.label)) }))}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <input placeholder="Label" aria-label="Source label" value={newSource.label} disabled={ro} onChange={(e) => setNewSource({ ...newSource, label: e.target.value })} />
        <input placeholder="https://" aria-label="Source URL" value={newSource.url} disabled={ro} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
        <button type="button" className="btn" disabled={ro} onClick={() => {
          if (!newSource.url.trim()) return;
          const toAdd = { label: newSource.label.trim(), url: newSource.url.trim() };
          void modify((cur) => ({ sources: [...cur.sources, toAdd] }));
          setNewSource({ label: "", url: "" });
        }}>Add source</button>
      </div>

      <TextArea label="Notes" rows={6} value={company.notes} disabled={ro} onCommit={(v) => patch({ notes: v })} />

      <h3>Applications ({linked.length})</h3>
      {linked.length === 0 ? <p className="muted">None yet.</p> : (
        <ul>{linked.map((a) => <li key={a.id}><a href={`#/applications/${a.id}`}>{a.title}</a></li>)}</ul>
      )}

      <h3>Contacts ({contacts.length})</h3>
      {contacts.length === 0 ? <p className="muted">No contacts at this company yet. Add them under <a href="#/contacts">Contacts</a>.</p> : (
        <ul>{contacts.map((c) => <li key={c.id}><a href={`#/contacts/${c.id}`}>{c.name}</a> <span className="muted">· {settings.pickLists.contactRelationships.find((r) => r.id === c.relationshipId)?.label ?? c.relationshipId}</span></li>)}</ul>
      )}
    </Drawer>
  );
}
