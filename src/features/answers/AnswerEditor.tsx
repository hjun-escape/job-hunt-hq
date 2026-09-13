import { useState } from "react";
import { answerUsage } from "../../domain/answers";
import type { Answer } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { copyText } from "../../ui/copyText";
import { Drawer } from "../../ui/Drawer";
import { Markdown } from "../../ui/Markdown";
import { MultiPick } from "../../ui/MultiPick";
import { SelectField, TagInput, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useToast } from "../../ui/Toast";
import { useSaver } from "../../ui/useSaver";

const LANGUAGES = [{ id: "en", label: "English" }, { id: "ko", label: "한국어" }, { id: "other", label: "Other" }];

export function AnswerEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const answer = state.answers[id];
  if (!answer) return <Drawer open title="Answer not found" onClose={onClose}><p className="muted">This answer no longer exists.</p></Drawer>;
  const used = answerUsage(id, Object.values(state.applications));
  const ro = repo.readOnly;
  const pl = settings.pickLists;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  type AnswerPatch = Partial<Answer> | ((current: Answer) => Partial<Answer>);
  const patch = (p: AnswerPatch) => run(() => (typeof p === "function" ? repo.modify("answers", id, p) : repo.update("answers", id, p)));
  const copy = async () => {
    const ok = await copyText(answer.body);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); } else toast.show("Could not copy. Select the text and copy it manually.", "error");
  };
  const remove = async () => {
    if (used.length) return;
    const ok = await confirm({ title: `Delete "${answer.title}"?`, message: "This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("answers", id)))) onClose();
  };
  return (
    <Drawer open wide title={answer.title} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" disabled={used.length > 0 || ro} title={used.length ? "Detach it from applications first" : undefined} onClick={() => void remove()}>Delete answer</button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={answer.kindId} options={pl.answerKinds} onChange={(v) => { if (v) void patch({ kindId: v }); }} allowEmpty={false} disabled={ro} />
        <TextField label="Title" value={answer.title} onCommit={(v) => (v.trim() ? patch({ title: v.trim() }) : false)} disabled={ro} />
        <TextField label="Question it answers" value={answer.question ?? ""} onCommit={(v) => patch({ question: opt(v) })} placeholder="Tell me about a time you…" disabled={ro} />
        <SelectField label="Language" value={answer.language} options={LANGUAGES} onChange={(v) => { if (v) void patch({ language: v as Answer["language"] }); }} allowEmpty={false} disabled={ro} />
      </div>
      <MultiPick label="Themes" options={pl.answerThemes} value={answer.themeIds} onChange={(fn) => void patch((cur) => ({ themeIds: fn(cur.themeIds) }))} disabled={ro} />
      <TagInput label="Tags" value={answer.tags} onChange={(fn) => void patch((cur) => ({ tags: fn(cur.tags) }))} disabled={ro} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <button type="button" className={preview ? "btn" : "btn primary"} onClick={() => setPreview(false)} aria-pressed={!preview}>Edit</button>
          <button type="button" className={preview ? "btn primary" : "btn"} onClick={() => setPreview(true)} aria-pressed={preview}>Preview</button>
        </div>
        <div className="row"><button type="button" className="btn" onClick={() => void copy()}>Copy</button>{copied ? <span className="muted">Copied</span> : null}</div>
      </div>
      {preview ? <div className="section"><Markdown text={answer.body} /></div> : (
        <TextArea label="Body" rows={14} value={answer.body} onCommit={(v) => patch({ body: v })} placeholder="Markdown works: **bold**, - bullets, [links](https://…)" disabled={ro} />
      )}
      <h3>Used in {used.length} application{used.length === 1 ? "" : "s"}</h3>
      {used.length ? <ul>{used.map((a) => <li key={a.id}><a href={`#/applications/${a.id}`}>{state.companies[a.companyId]?.name ?? "?"} · {a.title}</a></li>)}</ul> : <p className="muted">Attach it from an application's Answers tab.</p>}
    </Drawer>
  );
}
