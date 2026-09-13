import { useState } from "react";
import type { Company, SponsorshipPolicy } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { Field, TagInput, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

export function CompanyEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [newSource, setNewSource] = useState({ label: "", url: "" });
  const company = state.companies[id];

  if (!company) {
    return (
      <Drawer open title="Company not found" onClose={onClose}>
        <p className="muted">This company no longer exists.</p>
      </Drawer>
    );
  }

  const linked = Object.values(state.applications).filter((a) => a.companyId === id);
  const patch = (p: Partial<Company>) => run(() => repo.update("companies", id, p));
  const setPolicy = (countryId: string, p: Partial<SponsorshipPolicy>) => {
    const existing: SponsorshipPolicy = company.sponsorship[countryId] ?? { policy: "unknown" };
    return patch({ sponsorship: { ...company.sponsorship, [countryId]: { ...existing, ...p } } });
  };
  const remove = async () => {
    if (linked.length) return;
    const ok = await confirm({ title: `Delete ${company.name}?`, message: "Notes and sponsorship info on this company are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("companies", id)))) onClose();
  };

  return (
    <Drawer
      open
      title={company.name}
      onClose={onClose}
      footer={
        <>
          <SaveIndicator status={status} />
          <button type="button" className="btn danger" disabled={linked.length > 0 || repo.readOnly}
            title={linked.length ? "Reassign or delete its applications first" : undefined} onClick={() => void remove()}>
            Delete company
          </button>
        </>
      }
    >
      <div className="grid-2">
        <TextField label="Name" value={company.name} onCommit={(v) => (v.trim() ? patch({ name: v.trim() }) : false)} />
        <TextField label="Website" type="url" value={company.website ?? ""} onCommit={(v) => patch({ website: v || undefined })} />
        <TextField label="Industry" value={company.industry ?? ""} onCommit={(v) => patch({ industry: v || undefined })} />
        <TextField label="Size" value={company.size ?? ""} onCommit={(v) => patch({ size: v || undefined })} />
        <TextField label="HQ" value={company.hq ?? ""} onCommit={(v) => patch({ hq: v || undefined })} />
      </div>
      <TagInput label="Office cities" value={company.cities} onChange={(v) => void patch({ cities: v })} />
      <TagInput label="Tech stack" value={company.techStack} onChange={(v) => void patch({ techStack: v })} />

      <h3>Sponsorship by country</h3>
      {settings.pickLists.countries.map((co) => {
        const p = company.sponsorship[co.id];
        return (
          <div className="grid-2" key={co.id}>
            <Field label={`${co.label} sponsorship`} htmlFor={`sp-${co.id}`}>
              <select id={`sp-${co.id}`} value={p?.policy ?? "unknown"} onChange={(e) => void setPolicy(co.id, { policy: e.target.value as SponsorshipPolicy["policy"] })}>
                <option value="unknown">Unknown</option>
                <option value="yes">Sponsors</option>
                <option value="no">Does not sponsor</option>
              </select>
            </Field>
            <TextField label={`${co.label} note`} value={p?.note ?? ""} onCommit={(v) => setPolicy(co.id, { note: v || undefined })} />
          </div>
        );
      })}

      <TextArea label="Interview process" rows={6} value={company.interviewProcess} onCommit={(v) => patch({ interviewProcess: v })}
        placeholder="Rounds, formats, what people report on Blind / Glassdoor / 잡플래닛" />

      <h3>Sources</h3>
      {company.sources.length ? (
        <ul>
          {company.sources.map((s, i) => (
            <li key={`${s.url}-${i}`}>
              <a href={s.url} target="_blank" rel="noreferrer">{s.label || s.url}</a>{" "}
              <button type="button" className="btn ghost" aria-label={`Remove source ${s.label || s.url}`} onClick={() => void patch({ sources: company.sources.filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <input placeholder="Label" aria-label="Source label" value={newSource.label} onChange={(e) => setNewSource({ ...newSource, label: e.target.value })} />
        <input placeholder="https://" aria-label="Source URL" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
        <button type="button" className="btn" onClick={() => {
          if (!newSource.url.trim()) return;
          void patch({ sources: [...company.sources, { label: newSource.label.trim(), url: newSource.url.trim() }] });
          setNewSource({ label: "", url: "" });
        }}>Add source</button>
      </div>

      <TextArea label="Notes" rows={6} value={company.notes} onCommit={(v) => patch({ notes: v })} />

      <h3>Applications ({linked.length})</h3>
      {linked.length === 0 ? <p className="muted">None yet.</p> : (
        <ul>{linked.map((a) => <li key={a.id}><a href={`#/applications/${a.id}`}>{a.title}</a></li>)}</ul>
      )}
    </Drawer>
  );
}
