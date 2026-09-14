import { useState } from "react";
import { formatInstant } from "../../domain/dates";
import type { Application } from "../../domain/types";
import { useApp, useSettings } from "../../store/context";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

export function ActivityTab({ app }: { app: Application }) {
  const { repo } = useApp();
  const settings = useSettings();
  const { run, status } = useSaver();
  const [note, setNote] = useState("");
  const label = (id?: string) => settings.pickLists.statuses.find((s) => s.id === id)?.label ?? id ?? "";
  const add = () => {
    const text = note.trim();
    if (!text) return;
    void run(async () => {
      await repo.logActivity(app.id, { type: "note", text });
      setNote("");
    });
  };
  const entries = [...app.activity].reverse();
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input aria-label="New note" value={note} placeholder="Log a note (emailed recruiter, got the OA link…)"
          onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" className="btn" onClick={add} disabled={status === "saving" || repo.readOnly}>Add note</button>
        <SaveIndicator status={status} />
      </div>
      {entries.length === 0 ? (
        <p className="muted">No activity yet. Status changes and notes appear here.</p>
      ) : (
        <ul className="activity">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="muted">{formatInstant(e.at, settings.homeTz)}</span>{" "}
              {e.type === "status" ? `${label(e.from)} → ${label(e.to)}${e.text ? ` · ${e.text}` : ""}` : e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
