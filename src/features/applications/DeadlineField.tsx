import { useEffect, useState } from "react";
import { formatForHome, makeDeadline, toLocalInputValue } from "../../domain/dates";
import type { Deadline } from "../../domain/types";
import { allTimeZones } from "../../ui/timeZones";

interface Props {
  value: Deadline | undefined;
  homeTz: string;
  onCommit: (deadline: Deadline | undefined) => void;
}

/** Date or date-time input plus a source timezone; stores UTC with the zone (spec §4 Timezones). */
export function DeadlineField({ value, homeTz, onCommit }: Props) {
  const [tz, setTz] = useState(value?.tz ?? homeTz);
  const [dateOnly, setDateOnly] = useState(value?.dateOnly ?? true);
  const [draft, setDraft] = useState(value ? toLocalInputValue(value.at, value.tz, value.dateOnly) : "");

  useEffect(() => {
    setTz(value?.tz ?? homeTz);
    setDateOnly(value?.dateOnly ?? true);
    setDraft(value ? toLocalInputValue(value.at, value.tz, value.dateOnly) : "");
  }, [value, homeTz]);

  const commit = (d: string, z: string, only: boolean) => {
    if (!d) {
      if (value) onCommit(undefined);
      return;
    }
    try {
      onCommit(makeDeadline(d, z, only));
    } catch {
      /* partial input while typing; keep the draft */
    }
  };

  const shown = value ? formatForHome(value, homeTz) : null;
  return (
    <div className="field">
      <span className="field-label">Deadline</span>
      <div className="row">
        <input aria-label={dateOnly ? "Deadline date" : "Deadline date and time"} type={dateOnly ? "date" : "datetime-local"} value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value, tz, dateOnly); }} />
        <select aria-label="Deadline timezone" value={tz} onChange={(e) => { setTz(e.target.value); commit(draft, e.target.value, dateOnly); }}>
          {allTimeZones().map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <label className="row">
          <input type="checkbox" checked={dateOnly} onChange={(e) => {
            const only = e.target.checked;
            const next = draft ? (only ? draft.slice(0, 10) : draft.length <= 10 ? `${draft}T23:59` : draft) : "";
            setDateOnly(only);
            setDraft(next);
            commit(next, tz, only);
          }} />
          Date only
        </label>
        {value ? <button type="button" className="btn ghost" onClick={() => onCommit(undefined)}>Clear</button> : null}
      </div>
      {shown ? <span className="field-hint">{shown.home}{shown.source ? ` · source ${shown.source}` : ""}</span> : null}
    </div>
  );
}
