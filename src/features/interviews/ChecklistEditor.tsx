import { useState } from "react";
import { newId } from "../../domain/ids";
import type { ChecklistItem } from "../../domain/types";

interface Props {
  items: ChecklistItem[];
  onChange: (update: (current: ChecklistItem[]) => ChecklistItem[]) => void;
  disabled?: boolean;
}

export function ChecklistEditor({ items, onChange, disabled }: Props) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const item: ChecklistItem = { id: newId("ck"), text, done: false };
    onChange((current) => [...current, item]);
    setDraft("");
  };
  return (
    <div className="field">
      <span className="field-label">Prep checklist</span>
      {items.length ? (
        <ul className="checklist">
          {items.map((it, i) => (
            <li key={it.id}>
              <label className="row">
                <input type="checkbox" checked={it.done} disabled={disabled}
                  onChange={(e) => { const checked = e.target.checked; onChange((current) => current.map((x) => (x.id === it.id ? { ...x, done: checked } : x))); }} />
                <span className={it.done ? "done" : undefined}>{it.text}</span>
              </label>
              <button type="button" className="btn ghost" aria-label={`Remove ${it.text} (item ${i + 1})`} disabled={disabled} onClick={() => onChange((current) => current.filter((x) => x.id !== it.id))}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <input aria-label="New checklist item" value={draft} disabled={disabled} placeholder="Re-read the job description, review system design basics…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn" onClick={add} disabled={disabled}>Add item</button>
      </div>
    </div>
  );
}
