import { useId } from "react";
import type { PickEntry } from "../domain/types";

interface Props {
  label: string;
  options: PickEntry[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/** Multi-select over a pick list as toggle chips; archived options stay visible only while selected. */
export function MultiPick({ label, options, value, onChange, disabled }: Props) {
  const id = useId();
  const visible = options.filter((o) => !o.archived || value.includes(o.id));
  const toggle = (optId: string) => onChange(value.includes(optId) ? value.filter((v) => v !== optId) : [...value, optId]);
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
