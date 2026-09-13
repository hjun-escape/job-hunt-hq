import { useId } from "react";
import type { PickEntry } from "../domain/types";

interface Props {
  label: string;
  options: PickEntry[];
  value: string[];
  onChange: (update: (current: string[]) => string[]) => void;
  disabled?: boolean;
}

/** Multi-select over a pick list as toggle chips; archived options stay visible only while selected. */
export function MultiPick({ label, options, value, onChange, disabled }: Props) {
  const id = useId();
  const visible = options.filter((o) => !o.archived || value.includes(o.id));
  /** Which way to flip is decided from what the click saw rendered (on vs. off); the flip
   * itself is applied against `current` at write time, so a value already added/removed by a
   * concurrent write is never duplicated or resurrected by this click. */
  const toggle = (optId: string) => {
    const removing = value.includes(optId);
    onChange((current) => (removing ? current.filter((v) => v !== optId) : current.includes(optId) ? current : [...current, optId]));
  };
  return (
    <div className="field">
      <span className="field-label" id={id}>{label}</span>
      <div className="row" role="group" aria-labelledby={id}>
        {visible.map((o) => {
          const on = value.includes(o.id);
          return (
            <button key={o.id} type="button" className={on ? "chip chip-blue chip-toggle" : "chip chip-gray chip-toggle"} aria-pressed={on} disabled={disabled} onClick={() => toggle(o.id)}>
              {o.label}
            </button>
          );
        })}
        {visible.length === 0 ? <span className="muted">No options</span> : null}
      </div>
    </div>
  );
}
