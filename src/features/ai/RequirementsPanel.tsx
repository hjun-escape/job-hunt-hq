import { useState } from "react";
import { buildRequirementsPrompt, parseRequirements, type Requirements } from "../../capabilities/ai";
import type { SampleLike } from "../../capabilities/types";
import type { Application } from "../../domain/types";
import { copyText } from "../../ui/copyText";
import { useToast } from "../../ui/Toast";
import type { AppPatch } from "../applications/ApplicationDetail";
import { useSample } from "./useSample";

/** Spec §6 "Extract requirements": sample.json → checklist the user can copy or append to the notes. */
export function RequirementsPanel({ app, patch, sample: sampleCapability }: { app: Application; patch: (p: AppPatch) => Promise<boolean>; sample: SampleLike | null | undefined }) {
  const sample = useSample(sampleCapability);
  const toast = useToast();
  const [reqs, setReqs] = useState<Requirements | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [shapeError, setShapeError] = useState<string | null>(null);
  const jd = app.jobDescription?.trim() ?? "";
  if (!sample.available || !jd) return null;
  const busy = sample.phase === "thinking" || sample.phase === "streaming";
  const extract = async () => {
    setShapeError(null);
    const data = await sample.runJson<unknown>(buildRequirementsPrompt(jd), { modelTier: "quick" });
    if (data == null) return;
    const parsed = parseRequirements(data);
    if (!parsed) { setShapeError("Claude answered in an unexpected shape. Try again."); return; }
    setReqs(parsed);
    setChecked([]);
  };
  const markdown = () => !reqs ? "" : [
    ...reqs.must.map((r) => `- [${checked.includes(r) ? "x" : " "}] ${r}`),
    ...reqs.nice.map((r) => `- [${checked.includes(r) ? "x" : " "}] (nice) ${r}`),
  ].join("\n");
  const toggle = (r: string, on: boolean) => setChecked((cur) => (on ? [...cur, r] : cur.filter((x) => x !== r)));
  const copy = async () => { if (await copyText(markdown())) toast.show("Checklist copied.", "success"); else toast.show("Could not copy.", "error"); };
  const append = () => void patch((cur) => ({ notes: `${cur.notes.trimEnd()}\n\n## Requirements\n${markdown()}\n`.trimStart() }));
  return (
    <div className="ai-panel">
      <div className="row">
        <button type="button" className="btn" onClick={() => void extract()} disabled={busy || sample.disabledUntil > Date.now()}>Extract requirements</button>
        <span className="muted" aria-live="polite">{busy ? "Thinking…" : ""}</span>
      </div>
      {sample.error || shapeError ? <p className="field-hint danger-text" role="alert">{sample.error ?? shapeError}</p> : null}
      {reqs ? (
        <div>
          {(["must", "nice"] as const).map((group) => (
            <div key={group}>
              <h4>{group === "must" ? "Must have" : "Nice to have"}</h4>
              {reqs[group].length === 0 ? <p className="muted">None listed.</p> : reqs[group].map((r) => (
                <label key={r} className="row"><input type="checkbox" aria-label={r} checked={checked.includes(r)} onChange={(e) => toggle(r, e.target.checked)} /> {r}</label>
              ))}
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => void copy()}>Copy as checklist</button>
            <button type="button" className="btn" onClick={append}>Append to notes</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
