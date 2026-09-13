import { useState } from "react";
import { buildDraftPrompt, profileSummary } from "../../capabilities/ai";
import type { SampleLike } from "../../capabilities/types";
import type { Answer, Application } from "../../domain/types";
import { useApp, useAppState, useProfile } from "../../store/context";
import { Field } from "../../ui/fields";
import { useToast } from "../../ui/Toast";
import { useSaver } from "../../ui/useSaver";
import { useSample } from "./useSample";

interface Props {
  app?: Application;
  answer?: Answer;
  sample: SampleLike | null | undefined;
  onClose: () => void;
}

/** Spec §6 "Draft answer": explicit click, streamed into an editable textarea, save/attach/discard. Inline so no dialog nests inside a drawer. */
export function DraftPanel({ app, answer, sample: sampleCapability, onClose }: Props) {
  const { repo } = useApp();
  const state = useAppState();
  const profile = useProfile();
  const sample = useSample(sampleCapability);
  const toast = useToast();
  const { status, run } = useSaver();
  const company = app ? (state.companies[app.companyId]?.name ?? "the company") : "the company";
  const [question, setQuestion] = useState(answer?.question ?? answer?.title ?? "");
  const [language, setLanguage] = useState<"en" | "ko">(answer?.language === "ko" ? "ko" : "en");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [includeJd, setIncludeJd] = useState(!!app?.jobDescription?.trim());
  const [includeProfile, setIncludeProfile] = useState(true);
  const [ticked, setTicked] = useState<string[]>(() => (answer ? [answer.id] : (app?.answerIds ?? [])));
  const bank = Object.values(state.answers).sort((a, b) => a.title.localeCompare(b.title));
  const busy = sample.phase === "thinking" || sample.phase === "streaming";
  const rateLimited = sample.disabledUntil > Date.now();

  if (!sample.available) {
    return <section className="section ai-panel" aria-label="Draft with Claude"><p className="muted">Claude drafting is not available in this view.</p><button type="button" className="btn" onClick={onClose}>Close</button></section>;
  }

  const draft = () => void sample.run(buildDraftPrompt({
    question, company, role: app?.title ?? "the role",
    jobDescription: includeJd ? app?.jobDescription : undefined,
    sources: ticked.map((id) => state.answers[id]).filter((a): a is Answer => !!a).map((a) => ({ title: a.title, body: a.body })),
    profileSummary: includeProfile ? profileSummary(profile) : undefined,
    language, length,
  }), { cache: false });

  const save = (attach: boolean) => void run(async () => {
    const title = question.trim() || `Draft for ${company}`;
    const created = await repo.createAnswer({ kindId: "answer", title, ...(question.trim() ? { question: question.trim() } : {}), body: sample.text, language });
    if (attach && app) await repo.modify("applications", app.id, (cur) => ({ answerIds: cur.answerIds.includes(created.id) ? cur.answerIds : [...cur.answerIds, created.id] }));
    toast.show(attach ? "Saved to the bank and attached." : "Saved to the bank.", "success");
    onClose();
  });

  return (
    <section className="section ai-panel" aria-label="Draft with Claude">
      <div className="row" style={{ justifyContent: "space-between" }}><h3>Draft with Claude</h3><span className="muted">Uses your own Claude usage; nothing is sent until you click Draft.</span></div>
      <Field label="Question to answer" htmlFor="ai-question">
        <input id="ai-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Why do you want to work here?" disabled={busy} />
      </Field>
      <div className="grid-3">
        <Field label="Output language" htmlFor="ai-language">
          <select id="ai-language" value={language} onChange={(e) => setLanguage(e.target.value as "en" | "ko")} disabled={busy}><option value="en">English</option><option value="ko">한국어</option></select>
        </Field>
        <Field label="Target length" htmlFor="ai-length">
          <select id="ai-length" value={length} onChange={(e) => setLength(e.target.value as "short" | "medium" | "long")} disabled={busy}><option value="short">Short (~120 words)</option><option value="medium">Medium (~250 words)</option><option value="long">Long (~450 words)</option></select>
        </Field>
        <div className="field">
          {app?.jobDescription?.trim() ? <label className="row"><input type="checkbox" checked={includeJd} onChange={(e) => setIncludeJd(e.target.checked)} disabled={busy} /> Include job description</label> : null}
          <label className="row"><input type="checkbox" checked={includeProfile} onChange={(e) => setIncludeProfile(e.target.checked)} disabled={busy} /> Include background summary</label>
        </div>
      </div>
      <fieldset className="field">
        <legend className="field-label">Sources from the bank</legend>
        {bank.length === 0 ? <p className="muted">The bank is empty; Claude will only use the job description and your background.</p> : bank.map((a) => (
          <label key={a.id} className="row">
            <input type="checkbox" aria-label={`Use ${a.title}`} checked={ticked.includes(a.id)} disabled={busy}
              onChange={(e) => setTicked((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id)))} />
            {a.title}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button type="button" className="btn primary" onClick={draft} disabled={!question.trim() || busy || rateLimited}>Draft</button>
        {busy ? <button type="button" className="btn" onClick={sample.stop}>Stop</button> : null}
        <span className="muted" aria-live="polite">{sample.phase === "thinking" ? "Thinking…" : sample.phase === "streaming" ? "Writing…" : sample.truncated ? "Cut short — ask for a shorter answer." : ""}</span>
      </div>
      {sample.error ? <p className="field-hint danger-text" role="alert">{sample.error}</p> : null}
      {sample.phase !== "idle" || sample.text ? (
        <Field label="Draft" htmlFor="ai-draft" hint="Edit freely before saving.">
          <textarea id="ai-draft" rows={12} value={sample.text} readOnly={busy} onChange={(e) => sample.setText(e.target.value)} />
        </Field>
      ) : null}
      <div className="row">
        <button type="button" className="btn primary" disabled={!sample.text.trim() || busy || repo.readOnly || status === "saving"} onClick={() => save(false)}>Save as new answer</button>
        {app ? <button type="button" className="btn" disabled={!sample.text.trim() || busy || repo.readOnly || status === "saving"} onClick={() => save(true)}>Attach to application</button> : null}
        <button type="button" className="btn ghost" onClick={() => { sample.reset(); onClose(); }}>Discard</button>
      </div>
    </section>
  );
}
