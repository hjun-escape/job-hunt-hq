import { useState } from "react";
import type { Application } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { PickChip } from "../../ui/Chip";
import { copyText } from "../../ui/copyText";
import { Field } from "../../ui/fields";
import { useToast } from "../../ui/Toast";
import type { AppPatch } from "./ApplicationDetail";

export function AnswersTab({ app, patch }: { app: Application; patch: (p: AppPatch) => Promise<boolean> }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const attached = app.answerIds.map((id) => state.answers[id]).filter((a): a is NonNullable<typeof a> => !!a);
  const available = Object.values(state.answers).filter((a) => !app.answerIds.includes(a.id)).sort((a, b) => a.title.localeCompare(b.title));
  const copy = async (id: string, body: string) => {
    if (await copyText(body)) { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } else toast.show("Could not copy.", "error");
  };
  return (
    <div>
      <div className="row" style={{ alignItems: "end" }}>
        <Field label="Attach answer" htmlFor="attach-answer">
          <select id="attach-answer" value={pick} onChange={(e) => setPick(e.target.value)} disabled={repo.readOnly}>
            <option value="">Choose from the bank</option>
            {available.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </Field>
        <button type="button" className="btn primary" disabled={!pick || repo.readOnly} onClick={() => { void patch((cur) => ({ answerIds: [...cur.answerIds, pick] })); setPick(""); }}>Attach</button>
        <a href="#/answers" className="muted">Manage the bank</a>
      </div>
      {attached.length === 0 ? <p className="muted">No answers attached. Attach the ones you used or plan to use for this application.</p> : (
        <ul className="activity">
          {attached.map((a) => (
            <li key={a.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span><a href={`#/answers/${a.id}`}>{a.title}</a> <PickChip list={settings.pickLists.answerKinds} id={a.kindId} /></span>
                <span className="row">
                  {copiedId === a.id ? <span className="muted">Copied</span> : null}
                  <button type="button" className="btn ghost" aria-label={`Copy ${a.title}`} onClick={() => void copy(a.id, a.body)}>Copy</button>
                  <button type="button" className="btn ghost" aria-label={`Detach ${a.title}`} disabled={repo.readOnly} onClick={() => void patch((cur) => ({ answerIds: cur.answerIds.filter((x) => x !== a.id) }))}>Detach</button>
                </span>
              </div>
              {a.body ? <p className="muted" style={{ margin: "4px 0 0" }}>{a.body.length > 160 ? `${a.body.slice(0, 160)}…` : a.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
