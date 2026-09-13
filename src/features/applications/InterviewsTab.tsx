import { useState } from "react";
import { navigate } from "../../app/router";
import { formatSlot, roundsFor } from "../../domain/interviews";
import type { Application, ColorToken, Interview } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Field } from "../../ui/fields";
import { useSaver } from "../../ui/useSaver";

const OUTCOME_COLOR: Record<Interview["outcome"], ColorToken> = { pending: "gray", passed: "green", failed: "red", cancelled: "amber" };

export function InterviewsTab({ app }: { app: Application }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run, status } = useSaver();
  const pl = settings.pickLists;
  const [type, setType] = useState(pl.roundTypes[0]?.id ?? "");
  const rounds = roundsFor(app.id, Object.values(state.interviews));
  const add = () => {
    if (!type) return;
    void run(async () => {
      const iv = await repo.createInterview({ applicationId: app.id, roundTypeId: type });
      navigate(`/interviews/${iv.id}`);
    });
  };
  return (
    <div>
      <div className="row" style={{ alignItems: "end" }}>
        <Field label="Round type to add" htmlFor="add-round-type">
          <select id="add-round-type" value={type} onChange={(e) => setType(e.target.value)} disabled={repo.readOnly}>
            {pl.roundTypes.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <button type="button" className="btn primary" onClick={add} disabled={!type || repo.readOnly || status === "saving"}>Add round</button>
      </div>
      {rounds.length === 0 ? <p className="muted">No rounds yet. Add the recruiter screen as soon as it's booked.</p> : (
        <ul className="activity">
          {rounds.map((iv) => (
            <li key={iv.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="row"><PickChip list={pl.roundTypes} id={iv.roundTypeId} /><span>{formatSlot(iv.scheduledAt, settings.homeTz)}</span></span>
                <span className="row"><Chip color={OUTCOME_COLOR[iv.outcome]}>{iv.outcome}</Chip><a href={`#/interviews/${iv.id}`}>Open round</a></span>
              </div>
              {iv.prepChecklist.length ? <p className="muted" style={{ margin: "4px 0 0" }}>Prep {iv.prepChecklist.filter((c) => c.done).length}/{iv.prepChecklist.length}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
