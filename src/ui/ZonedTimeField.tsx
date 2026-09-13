import { useEffect, useState } from "react";
import { formatForHome, makeZoned, toLocalInputValue } from "../domain/dates";
import type { ZonedInstant } from "../domain/types";
import { allTimeZones } from "./timeZones";

interface Props {
  label: string;
  value: ZonedInstant | undefined;
  homeTz: string;
  onCommit: (value: ZonedInstant | undefined) => void;
  disabled?: boolean;
}

/** A timed instant with its source zone; stores UTC + zone, shows the home-zone time beside it (spec §4). */
export function ZonedTimeField({ label, value, homeTz, onCommit, disabled }: Props) {
  const at = value?.at;
  const valueTz = value?.tz;
  const [tz, setTz] = useState(valueTz ?? homeTz);
  const [draft, setDraft] = useState(at && valueTz ? toLocalInputValue(at, valueTz, false) : "");
  useEffect(() => {
    setTz(valueTz ?? homeTz);
    setDraft(at && valueTz ? toLocalInputValue(at, valueTz, false) : "");
  }, [at, valueTz, homeTz]);
  const commit = (d: string, z: string) => {
    if (!d) {
      if (value) onCommit(undefined);
      return;
    }
    try {
      onCommit(makeZoned(d, z));
    } catch {
      /* partial input while typing */
    }
  };
  const shown = value ? formatForHome(value, homeTz) : null;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="row">
        <input aria-label={`${label} date and time`} type="datetime-local" value={draft} disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value, tz); }} />
        <select aria-label={`${label} timezone`} value={tz} disabled={disabled} onChange={(e) => { setTz(e.target.value); commit(draft, e.target.value); }}>
          {allTimeZones().map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        {value ? <button type="button" className="btn ghost" disabled={disabled} onClick={() => onCommit(undefined)}>Clear</button> : null}
      </div>
      {shown ? <span className="field-hint">{shown.home}{shown.source ? ` · ${shown.source} there` : ""}</span> : null}
    </div>
  );
}
