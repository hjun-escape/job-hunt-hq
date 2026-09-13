import type { PickEntry } from "../domain/types";
import { DateField, SelectField, TextField } from "./fields";

export type RowsColumn<T> =
  | { key: keyof T & string; label: string; type?: "text" | "date"; placeholder?: string }
  | { key: keyof T & string; label: string; type: "select"; options: PickEntry[] };

interface Props<T extends object> {
  label: string;
  rows: T[];
  columns: RowsColumn<T>[];
  blank: () => T;
  onChange: (update: (current: T[]) => T[]) => void;
  disabled?: boolean;
  addLabel?: string;
  rowLabel?: (row: T, index: number) => string;
}

/** Add/edit/remove rows of small string fields; every input is labelled "<row name> <column label>". The updater is applied to the caller's current rows. */
export function RowsEditor<T extends object>({ label, rows, columns, blank, onChange, disabled, addLabel = "Add row", rowLabel }: Props<T>) {
  const update = (i: number, key: keyof T & string, value: string) => onChange((cur) => cur.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return (
    <div className="rows">
      {rows.length === 0 ? <p className="muted">None yet.</p> : null}
      {rows.map((row, i) => {
        const name = rowLabel ? rowLabel(row, i) : `${label} ${i + 1}`;
        return (
          <div key={i} className="rows-row">
            <div className="grid-3">
              {columns.map((c) => {
                const v = String((row as Record<string, unknown>)[c.key] ?? "");
                const fieldLabel = `${name} ${c.label}`;
                if (c.type === "date") return <DateField key={c.key} label={fieldLabel} value={v} onCommit={(nv) => update(i, c.key, nv)} disabled={disabled} />;
                if (c.type === "select") return <SelectField key={c.key} label={fieldLabel} value={v} options={c.options} onChange={(nv) => update(i, c.key, nv)} allowEmpty={false} disabled={disabled} />;
                return <TextField key={c.key} label={fieldLabel} value={v} onCommit={(nv) => update(i, c.key, nv)} placeholder={c.placeholder} disabled={disabled} />;
              })}
            </div>
            <button type="button" className="btn ghost" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => onChange((cur) => cur.filter((_, j) => j !== i))}>Remove</button>
          </div>
        );
      })}
      <button type="button" className="btn" disabled={disabled} onClick={() => onChange((cur) => [...cur, blank()])}>{addLabel}</button>
    </div>
  );
}
