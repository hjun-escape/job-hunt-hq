import { useState } from "react";
import type { Profile, WorkAuth } from "../../domain/types";
import { useApp, useProfile } from "../../store/context";
import { copyText } from "../../ui/copyText";
import { DateField, TextArea, TextField, TriStateField } from "../../ui/fields";
import { useToast } from "../../ui/Toast";

interface Props {
  countryId: string;
  countryLabel: string;
  save: (patch: Partial<Profile> | ((current: Profile) => Partial<Profile>)) => Promise<boolean>;
}

export function WorkAuthSection({ countryId, countryLabel, save }: Props) {
  const { repo } = useApp();
  const profile = useProfile();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const ro = repo.readOnly;
  const auth: WorkAuth = profile.workAuth[countryId] ?? { status: "", needsSponsorship: null, formSentence: "" };
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<WorkAuth>) =>
    save((cur) => {
      const existing: WorkAuth = cur.workAuth[countryId] ?? { status: "", needsSponsorship: null, formSentence: "" };
      return { workAuth: { ...cur.workAuth, [countryId]: { ...existing, ...p } } };
    });
  const copy = async () => {
    if (await copyText(auth.formSentence)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } else toast.show("Could not copy.", "error");
  };
  return (
    <div className="section">
      <h3>{countryLabel}</h3>
      <div className="grid-3">
        <TextField label={`${countryLabel} work status`} value={auth.status} onCommit={(v) => patch({ status: v.trim() })} placeholder="Citizen, PR, PGWP, H-1B, F-4…" disabled={ro} />
        <TextField label={`${countryLabel} permit type`} value={auth.permitType ?? ""} onCommit={(v) => patch({ permitType: opt(v) })} disabled={ro} />
        <DateField label={`${countryLabel} permit expires`} value={auth.expiresAt ?? ""} onCommit={(v) => void patch({ expiresAt: opt(v) })} disabled={ro} />
      </div>
      <TriStateField label={`${countryLabel} sponsorship needed`} value={auth.needsSponsorship} onChange={(v) => void patch({ needsSponsorship: v })} disabled={ro} />
      <TextArea label={`${countryLabel} form sentence`} rows={2} value={auth.formSentence} onCommit={(v) => patch({ formSentence: v.trim() })} placeholder="The one sentence you paste into application forms about your authorization" disabled={ro} />
      <div className="row"><button type="button" className="btn" aria-label={`Copy ${countryLabel} form sentence`} disabled={!auth.formSentence} onClick={() => void copy()}>Copy sentence</button>{copied ? <span className="muted">Copied</span> : null}</div>
      <TextField label={`${countryLabel} notes`} value={auth.notes ?? ""} onCommit={(v) => patch({ notes: opt(v) })} disabled={ro} />
    </div>
  );
}
