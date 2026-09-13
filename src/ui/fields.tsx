import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { PickEntry, Rating } from "../domain/types";

/** What a field's `onCommit` may return: nothing/`true` means "saved, keep the draft",
 * `false` (or a rejected promise) means "the save failed, revert to the last committed value"
 * so Enter/blur is not a no-op the next time the caller tries the same edit. */
type CommitOutcome = void | boolean | Promise<boolean | void>;

function isPromiseLike(v: unknown): v is Promise<boolean | void> {
  return !!v && typeof (v as { then?: unknown }).then === "function";
}

/** Calls `revert` when `outcome` is (or resolves/rejects to) a failure. */
function afterCommit(outcome: CommitOutcome, revert: () => void): void {
  if (isPromiseLike(outcome)) {
    outcome.then((ok) => {
      if (ok === false) revert();
    }, revert);
    return;
  }
  if (outcome === false) revert();
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onCommit: (value: string) => CommitOutcome;
  placeholder?: string;
  type?: "text" | "url" | "email";
  disabled?: boolean;
}
export function TextField({ label, value, onCommit, placeholder, type = "text", disabled }: TextProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const last = useRef(value); // last committed value: Enter then blur commits once
  useEffect(() => {
    setDraft(value);
    last.current = value;
  }, [value]);
  const commit = () => {
    if (draft === last.current) return;
    last.current = draft;
    afterCommit(onCommit(draft), () => {
      last.current = value;
      setDraft(value);
    });
  };
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </Field>
  );
}

interface TextAreaProps {
  label: string;
  value: string;
  onCommit: (value: string) => CommitOutcome;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}
export function TextArea({ label, value, onCommit, rows = 4, placeholder, disabled }: TextAreaProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    setDraft(value);
    last.current = value;
  }, [value]);
  return (
    <Field label={label} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === last.current) return;
          last.current = draft;
          afterCommit(onCommit(draft), () => {
            last.current = value;
            setDraft(value);
          });
        }}
      />
    </Field>
  );
}

interface NumberProps {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => CommitOutcome;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}
export function NumberField({ label, value, onCommit, min, max, step, disabled }: NumberProps) {
  const id = useId();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const last = useRef<number | null>(value);
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
    last.current = value;
  }, [value]);
  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && Number.isNaN(next)) return;
    if (next === last.current) return;
    last.current = next;
    afterCommit(onCommit(next), () => {
      last.current = value;
      setDraft(value == null ? "" : String(value));
    });
  };
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
    </Field>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: PickEntry[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}
export function SelectField({ label, value, options, onChange, allowEmpty = true, emptyLabel = "—", disabled }: SelectProps) {
  const id = useId();
  const visible = options.filter((o) => !o.archived || o.id === value);
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {visible.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

interface DateProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}
export function DateField({ label, value, onCommit, disabled }: DateProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="date" value={value} disabled={disabled} onChange={(e) => onCommit(e.target.value)} />
    </Field>
  );
}

interface RatingProps {
  label: string;
  value: Rating | null;
  onChange: (value: Rating | null) => void;
}
export function RatingField({ label, value, onChange }: RatingProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="rating" role="group" aria-label={label}>
        {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
          <button key={n} type="button" aria-label={`${label} ${n}`} aria-pressed={value === n}
            className={value != null && n <= value ? "rating-dot on" : "rating-dot"}
            onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TagProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}
export function TagInput({ label, value, onChange, placeholder = "Add and press Enter", suggestions }: TagProps) {
  const id = useId();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  };
  return (
    <Field label={label} htmlFor={id}>
      <div className="tags">
        {value.map((t) => (
          <span key={t} className="chip chip-gray">
            {t}
            <button type="button" className="chip-x" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
          </span>
        ))}
        <input id={id} value={draft} placeholder={placeholder} list={suggestions ? listId : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            else if (e.key === "Backspace" && draft === "" && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={add} />
        {suggestions ? <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist> : null}
      </div>
    </Field>
  );
}

interface TriProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
}
export function TriStateField({ label, value, onChange, yesLabel = "Yes", noLabel = "No" }: TriProps) {
  const id = useId();
  const current = value === null ? "unknown" : value ? "yes" : "no";
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} value={current} onChange={(e) => onChange(e.target.value === "unknown" ? null : e.target.value === "yes")}>
        <option value="unknown">Unknown</option>
        <option value="yes">{yesLabel}</option>
        <option value="no">{noLabel}</option>
      </select>
    </Field>
  );
}
