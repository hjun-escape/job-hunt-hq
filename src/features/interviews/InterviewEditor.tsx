import { formatSlot } from "../../domain/interviews";
import type { Interview, Rating } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { MultiPick } from "../../ui/MultiPick";
import { DateField, NumberField, RatingField, SelectField, TextArea, TextField, UrlField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";
import { ZonedTimeField } from "../../ui/ZonedTimeField";
import { ChecklistEditor } from "./ChecklistEditor";

const FORMATS = [{ id: "video", label: "Video call" }, { id: "phone", label: "Phone" }, { id: "onsite", label: "Onsite" }, { id: "take_home", label: "Take-home" }, { id: "other", label: "Other" }];
const OUTCOMES = [{ id: "pending", label: "Pending" }, { id: "passed", label: "Passed" }, { id: "failed", label: "Failed" }, { id: "cancelled", label: "Cancelled" }];

export function InterviewEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const iv = state.interviews[id];
  if (!iv) return <Drawer open title="Round not found" onClose={onClose}><p className="muted">This interview round no longer exists.</p></Drawer>;
  const app = state.applications[iv.applicationId];
  const company = app ? state.companies[app.companyId] : undefined;
  const ro = repo.readOnly;
  const pl = settings.pickLists;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  type InterviewPatch = Partial<Interview> | ((current: Interview) => Partial<Interview>);
  const patch = (p: InterviewPatch) => run(() => (typeof p === "function" ? repo.modify("interviews", id, p) : repo.update("interviews", id, p)));
  const contacts = Object.values(state.contacts)
    .sort((a, b) => Number(b.companyId === app?.companyId) - Number(a.companyId === app?.companyId) || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, label: c.companyId && c.companyId !== app?.companyId ? `${c.name} (${state.companies[c.companyId]?.name ?? "?"})` : c.name }));
  const roundLabel = pl.roundTypes.find((r) => r.id === iv.roundTypeId)?.label ?? iv.roundTypeId;
  const remove = async () => {
    const ok = await confirm({ title: `Delete this ${roundLabel} round?`, message: "Its notes and checklist are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("interviews", id)))) onClose();
  };
  return (
    <Drawer open wide onClose={onClose}
      title={<span>{roundLabel} <span className="muted">·</span> {app ? <a href={`#/applications/${app.id}`}>{company?.name ?? "?"} · {app.title}</a> : <span className="muted">(deleted application)</span>}</span>}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" onClick={() => void remove()} disabled={ro}>Delete round</button></>}>
      <div className="grid-2">
        <SelectField label="Round type" value={iv.roundTypeId} options={pl.roundTypes} onChange={(v) => { if (v) void patch({ roundTypeId: v }); }} allowEmpty={false} disabled={ro} />
        <SelectField label="Format" value={iv.format} options={FORMATS} onChange={(v) => { if (v) void patch({ format: v as Interview["format"] }); }} allowEmpty={false} disabled={ro} />
      </div>
      <ZonedTimeField label="Scheduled" value={iv.scheduledAt} homeTz={settings.homeTz} onCommit={(v) => void patch({ scheduledAt: v })} disabled={ro} />
      <p className="muted">{formatSlot(iv.scheduledAt, settings.homeTz)}</p>
      <div className="grid-3">
        <NumberField label="Duration (minutes)" value={iv.durationMin ?? null} min={5} step={5} onCommit={(v) => patch({ durationMin: v ?? undefined })} disabled={ro} />
        <TextField label="Location" value={iv.location ?? ""} onCommit={(v) => patch({ location: opt(v) })} placeholder="Office address or 'remote'" disabled={ro} />
        <UrlField label="Meeting link" value={iv.meetingUrl ?? ""} onCommit={(v) => patch({ meetingUrl: opt(v) })} disabled={ro} />
      </div>
      <MultiPick label="Interviewers" options={contacts} value={iv.interviewerContactIds} onChange={(fn) => void patch((cur) => ({ interviewerContactIds: fn(cur.interviewerContactIds) }))} disabled={ro} />
      <TextField label="Other interviewer names" value={iv.interviewerNames ?? ""} onCommit={(v) => patch({ interviewerNames: opt(v) })} placeholder="Names not in Contacts" disabled={ro} />
      <ChecklistEditor items={iv.prepChecklist} onChange={(fn) => void patch((cur) => ({ prepChecklist: fn(cur.prepChecklist) }))} disabled={ro} />

      <div className="section">
        <h3>Afterwards</h3>
        <TextArea label="Questions asked" rows={6} value={iv.questionsAsked} onCommit={(v) => patch({ questionsAsked: v })} placeholder="What they asked, what you answered, what you'd change" disabled={ro} />
        <div className="grid-3">
          <RatingField label="Self rating" value={iv.selfRating} onChange={(v) => void patch({ selfRating: v as Rating | null })} disabled={ro} />
          <SelectField label="Outcome" value={iv.outcome} options={OUTCOMES} onChange={(v) => { if (v) void patch({ outcome: v as Interview["outcome"] }); }} allowEmpty={false} disabled={ro} />
          <DateField label="Thank-you sent on" value={iv.thankYouSentAt ?? ""} onCommit={(v) => void patch({ thankYouSentAt: opt(v) })} disabled={ro} />
        </div>
      </div>
      <TextArea label="Notes" rows={5} value={iv.notes} onCommit={(v) => patch({ notes: v })} disabled={ro} />
    </Drawer>
  );
}
