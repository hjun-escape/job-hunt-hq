import { useRef, useState } from "react";
import { contactLinks, isContactReferenced } from "../../domain/contacts";
import type { Contact, ReferralStatus } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { DateField, Field, NumberField, SelectField, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const REFERRAL: { id: ReferralStatus; label: string }[] = [
  { id: "not_asked", label: "Not asked" }, { id: "asked", label: "Asked" }, { id: "agreed", label: "Agreed" },
  { id: "submitted", label: "Submitted" }, { id: "declined", label: "Declined" },
];

export function ContactEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [useFor, setUseFor] = useState("");
  const referenceRef = useRef<{ consentAt?: string; lastNotifiedAt?: string; usedInApplicationIds: string[] }>({ usedInApplicationIds: [] });
  const contact = state.contacts[id];
  if (!contact) {
    return <Drawer open title="Contact not found" onClose={onClose}><p className="muted">This contact no longer exists.</p></Drawer>;
  }
  // Update ref whenever contact.reference changes
  if (contact.reference) referenceRef.current = contact.reference;

  const apps = Object.values(state.applications);
  const interviews = Object.values(state.interviews);
  const links = contactLinks(id, apps, interviews);
  const referenced = isContactReferenced(id, apps, interviews);
  const ro = repo.readOnly;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<Contact>) => run(() => repo.update("contacts", id, p));
  const companies = Object.values(state.companies).map((c) => ({ id: c.id, label: c.name }));
  const appLabel = (appId: string) => { const a = state.applications[appId]; return a ? `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}` : appId; };
  const isReference = contact.relationshipId === "reference";
  const isReferrer = contact.relationshipId === "referrer";
  const reference = contact.reference ?? { usedInApplicationIds: [] };
  const remove = async () => {
    if (referenced) return;
    const ok = await confirm({ title: `Delete ${contact.name}?`, message: "This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("contacts", id)))) onClose();
  };

  return (
    <Drawer open title={contact.name} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" disabled={referenced || ro} title={referenced ? "Unlink this contact from applications and interviews first" : undefined} onClick={() => void remove()}>Delete contact</button></>}>
      <div className="grid-2">
        <TextField label="Name" value={contact.name} onCommit={(v) => (v.trim() ? patch({ name: v.trim() }) : false)} disabled={ro} />
        <SelectField label="Relationship" value={contact.relationshipId} options={settings.pickLists.contactRelationships} onChange={(v) => { if (v) void patch({ relationshipId: v }); }} allowEmpty={false} disabled={ro} />
        <SelectField label="Company" value={contact.companyId ?? ""} options={companies} onChange={(v) => void patch({ companyId: opt(v) })} disabled={ro} />
        <TextField label="Title" value={contact.title ?? ""} onCommit={(v) => patch({ title: opt(v) })} disabled={ro} />
        <TextField label="Email" type="email" value={contact.email ?? ""} onCommit={(v) => patch({ email: opt(v) })} disabled={ro} />
        <TextField label="Phone" value={contact.phone ?? ""} onCommit={(v) => patch({ phone: opt(v) })} disabled={ro} />
        <TextField label="LinkedIn" type="url" value={contact.linkedin ?? ""} onCommit={(v) => patch({ linkedin: opt(v) })} disabled={ro} />
        <DateField label="Last contacted" value={contact.lastContactedAt ?? ""} onCommit={(v) => void patch({ lastContactedAt: opt(v) })} disabled={ro} />
        <NumberField label="Follow up every (days)" value={contact.followUpEveryDays ?? null} min={1} onCommit={(v) => patch({ followUpEveryDays: v ?? undefined })} disabled={ro} />
      </div>

      {isReferrer ? (
        <div className="section">
          <h3>Referral</h3>
          <div className="grid-3">
            <SelectField label="Referral status" value={contact.referral?.status ?? "not_asked"} options={REFERRAL} onChange={(v) => { if (v) void patch({ referral: { ...contact.referral, status: v as ReferralStatus } }); }} allowEmpty={false} disabled={ro} />
            <DateField label="Asked on" value={contact.referral?.askedAt ?? ""} onCommit={(v) => void patch({ referral: { status: contact.referral?.status ?? "not_asked", ...contact.referral, askedAt: opt(v) } })} disabled={ro} />
            <DateField label="Submitted on" value={contact.referral?.submittedAt ?? ""} onCommit={(v) => void patch({ referral: { status: contact.referral?.status ?? "not_asked", ...contact.referral, submittedAt: opt(v) } })} disabled={ro} />
          </div>
        </div>
      ) : null}

      {isReference ? (
        <div className="section">
          <h3>Reference</h3>
          <div className="grid-2">
            <DateField label="Consent given on" value={reference.consentAt ?? ""} onCommit={(v) => { referenceRef.current.consentAt = opt(v); void patch({ reference: { ...referenceRef.current, consentAt: opt(v) } }); }} disabled={ro} />
            <DateField label="Last told to expect a call" value={reference.lastNotifiedAt ?? ""} onCommit={(v) => { referenceRef.current.lastNotifiedAt = opt(v); void patch({ reference: { ...referenceRef.current, lastNotifiedAt: opt(v) } }); }} disabled={ro} />
          </div>
          <h4>Used for</h4>
          {reference.usedInApplicationIds.length === 0 ? <p className="muted">Not used yet.</p> : (
            <ul>{reference.usedInApplicationIds.map((appId) => (
              <li key={appId}><a href={`#/applications/${appId}`}>{appLabel(appId)}</a>{" "}
                <button type="button" className="btn ghost" aria-label={`Remove use for ${appLabel(appId)}`} disabled={ro} onClick={() => { const filtered = referenceRef.current.usedInApplicationIds.filter((x) => x !== appId); referenceRef.current.usedInApplicationIds = filtered; void patch({ reference: { ...referenceRef.current, usedInApplicationIds: filtered } }); }}>×</button></li>
            ))}</ul>
          )}
          <div className="row">
            <Field label="Used for application" htmlFor="ref-use-for">
              <select id="ref-use-for" value={useFor} onChange={(e) => setUseFor(e.target.value)} disabled={ro}>
                <option value="">Choose an application</option>
                {apps.filter((a) => !reference.usedInApplicationIds.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{appLabel(a.id)}</option>)}
              </select>
            </Field>
            <button type="button" className="btn" disabled={!useFor || ro} onClick={() => { const updated = [...referenceRef.current.usedInApplicationIds, useFor]; referenceRef.current.usedInApplicationIds = updated; void patch({ reference: { ...referenceRef.current, usedInApplicationIds: updated } }); setUseFor(""); }}>Record use</button>
          </div>
        </div>
      ) : null}

      <TextArea label="Notes" rows={6} value={contact.notes} onCommit={(v) => patch({ notes: v })} disabled={ro} />

      <h3>Linked applications</h3>
      {links.asReferrer.length + links.asRecruiter.length === 0 ? <p className="muted">Not linked to any application yet. Pick this contact as referrer or recruiter on an application.</p> : (
        <ul>
          {links.asReferrer.map((a) => <li key={`r-${a.id}`}><a href={`#/applications/${a.id}`}>{appLabel(a.id)}</a> <span className="muted">· referrer</span></li>)}
          {links.asRecruiter.map((a) => <li key={`c-${a.id}`}><a href={`#/applications/${a.id}`}>{appLabel(a.id)}</a> <span className="muted">· recruiter</span></li>)}
        </ul>
      )}
      {links.asInterviewer.length ? <p className="muted">Interviewer on {links.asInterviewer.length} round(s).</p> : null}
    </Drawer>
  );
}
