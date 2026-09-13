import { useState } from "react";
import { todayIso } from "../../domain/dates";
import { allPatterns, logAttempt } from "../../domain/prep";
import type { PrepItem, Rating } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { Markdown } from "../../ui/Markdown";
import { RatingField, SelectField, TagInput, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const DIFFICULTIES = [{ id: "easy", label: "Easy" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Hard" }];

export function PrepEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [preview, setPreview] = useState(false);
  const item = state.prep[id];
  if (!item) return <Drawer open title="Prep item not found" onClose={onClose}><p className="muted">This item no longer exists.</p></Drawer>;
  const ro = repo.readOnly;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  type PrepPatch = Partial<PrepItem> | ((current: PrepItem) => Partial<PrepItem>);
  const patch = (p: PrepPatch) => run(() => (typeof p === "function" ? repo.modify("prep", id, p) : repo.update("prep", id, p)));
  const remove = async () => {
    const ok = await confirm({ title: `Delete "${item.title}"?`, message: "Its notes are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("prep", id)))) onClose();
  };
  return (
    <Drawer open title={item.title} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" onClick={() => void remove()} disabled={ro}>Delete prep item</button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={item.kindId} options={settings.pickLists.prepKinds} onChange={(v) => { if (v) void patch({ kindId: v }); }} allowEmpty={false} disabled={ro} />
        <TextField label="Title" value={item.title} onCommit={(v) => (v.trim() ? patch({ title: v.trim() }) : false)} disabled={ro} />
        <TextField label="Source URL" type="url" value={item.sourceUrl ?? ""} onCommit={(v) => patch({ sourceUrl: opt(v) })} placeholder="https://leetcode.com/problems/…" disabled={ro} />
        <SelectField label="Difficulty" value={item.difficulty ?? ""} options={DIFFICULTIES} onChange={(v) => void patch({ difficulty: (v || null) as PrepItem["difficulty"] })} disabled={ro} />
      </div>
      <TagInput label="Patterns" value={item.patterns} onChange={(fn) => void patch((cur) => ({ patterns: fn(cur.patterns) }))} suggestions={allPatterns(Object.values(state.prep))} placeholder="two pointers, BFS, consistent hashing…" disabled={ro} />
      <TagInput label="Company tags" value={item.companyTags} onChange={(fn) => void patch((cur) => ({ companyTags: fn(cur.companyTags) }))} suggestions={Object.values(state.companies).map((c) => c.name)} disabled={ro} />
      <div className="row" style={{ alignItems: "end" }}>
        <RatingField label="Confidence" value={item.confidence} onChange={(v) => void patch({ confidence: v as Rating | null })} disabled={ro} />
        <div className="field">
          <span className="field-label">Attempts</span>
          <span>{item.attempts}{item.lastAttemptedAt ? <span className="muted"> · last {item.lastAttemptedAt}</span> : null}</span>
        </div>
        <button type="button" className="btn" disabled={ro} onClick={() => void patch(logAttempt(item, todayIso(settings.homeTz)))}>Log attempt</button>
      </div>
      <div className="row">
        <button type="button" className={preview ? "btn" : "btn primary"} aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</button>
        <button type="button" className={preview ? "btn primary" : "btn"} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
      </div>
      {preview ? <div className="section"><Markdown text={item.notes} /></div> : (
        <TextArea label="Notes" rows={12} value={item.notes} onCommit={(v) => patch({ notes: v })} placeholder="Approach, complexity, traps, the story you'd tell" disabled={ro} />
      )}
    </Drawer>
  );
}
