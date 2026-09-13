import { useState } from "react";
import { ALL_COLUMN_KEYS, COLUMN_LABELS, LOCKED_COLUMNS } from "./columnPrefs";

export function ColumnChooser({ visible, onChange }: { visible: string[]; onChange: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (key: string, on: boolean) => onChange(ALL_COLUMN_KEYS.filter((k) => (k === key ? on : visible.includes(k))));
  return (
    <div className="chooser">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Columns</button>
      {open ? (
        <div className="chooser-menu" role="group" aria-label="Visible columns">
          {ALL_COLUMN_KEYS.map((k) => (
            <label key={k} className="row">
              <input type="checkbox" aria-label={`Show ${COLUMN_LABELS[k]} column`} checked={visible.includes(k)} disabled={LOCKED_COLUMNS.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />
              {COLUMN_LABELS[k]}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
