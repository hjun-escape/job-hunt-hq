import { formatMoney, normalizeAmount } from "../../domain/money";
import type { Application, Comp, Rating, Settings } from "../../domain/types";
import { useAppState, useSettings } from "../../store/context";
import { DateField, NumberField, RatingField, SelectField, TagInput, TextArea, TextField, TriStateField } from "../../ui/fields";
import { DeadlineField } from "./DeadlineField";

const PERIODS = [{ id: "year", label: "per year" }, { id: "month", label: "per month" }, { id: "hour", label: "per hour" }];

function normalizedText(comp: Comp, settings: Settings): string | null {
  if (comp.currency === settings.displayCurrency) return null;
  const lo = comp.min != null ? normalizeAmount(comp.min, comp.currency, settings) : null;
  const hi = comp.max != null ? normalizeAmount(comp.max, comp.currency, settings) : null;
  if (lo == null && hi == null) return null;
  const f = (n: number | null) => (n == null ? "?" : formatMoney(n, settings.displayCurrency));
  return `${f(lo)} – ${f(hi)}`;
}

export function OverviewTab({ app, patch }: { app: Application; patch: (p: Partial<Application>) => Promise<boolean> }) {
  const state = useAppState();
  const settings = useSettings();
  const pl = settings.pickLists;
  const companies = Object.values(state.companies).map((c) => ({ id: c.id, label: c.name }));
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const comp: Comp = app.comp ?? { currency: settings.displayCurrency, period: "year" };
  const setComp = (p: Partial<Comp>) => patch({ comp: { ...comp, ...p } });
  const closed = pl.statuses.find((s) => s.id === app.statusId)?.group !== "open";
  const hasAmounts = comp.min != null || comp.max != null;
  const normalized = normalizedText(comp, settings);

  return (
    <div>
      <div className="section">
        <h3>Role</h3>
        <div className="grid-2">
          <SelectField label="Company" value={app.companyId} options={companies} onChange={(v) => { if (v) patch({ companyId: v }); }} allowEmpty={false} />
          <TextField label="Title" value={app.title} onCommit={(v) => (v.trim() ? patch({ title: v.trim() }) : false)} />
          <TextField label="Req ID" value={app.reqId ?? ""} onCommit={(v) => patch({ reqId: opt(v) })} />
          <TextField label="Posting URL" type="url" value={app.url ?? ""} onCommit={(v) => patch({ url: opt(v) })} />
          <TextField label="Team" value={app.team ?? ""} onCommit={(v) => patch({ team: opt(v) })} />
          <SelectField label="Level" value={app.levelId ?? ""} options={pl.levels} onChange={(v) => patch({ levelId: opt(v) })} />
          <SelectField label="Role family" value={app.roleFamilyId ?? ""} options={pl.roleFamilies} onChange={(v) => patch({ roleFamilyId: opt(v) })} />
          <SelectField label="Employment type" value={app.employmentTypeId ?? ""} options={pl.employmentTypes} onChange={(v) => patch({ employmentTypeId: opt(v) })} />
          <SelectField label="Hiring track" value={app.hiringTrackId ?? ""} options={pl.hiringTracks} onChange={(v) => patch({ hiringTrackId: opt(v) })} />
          <SelectField label="Work mode" value={app.workModeId ?? ""} options={pl.workModes} onChange={(v) => patch({ workModeId: opt(v) })} />
        </div>
      </div>

      <div className="section">
        <h3>Where and how</h3>
        <div className="grid-2">
          <SelectField label="Country" value={app.countryId} options={pl.countries} onChange={(v) => { if (v) patch({ countryId: v }); }} allowEmpty={false} />
          <TextField label="City" value={app.city ?? ""} onCommit={(v) => patch({ city: opt(v) })} />
          <SelectField label="Channel" value={app.channelId} options={pl.channels} onChange={(v) => { if (v) patch({ channelId: v }); }} allowEmpty={false} />
          <TextField label="Source note" value={app.sourceNote ?? ""} onCommit={(v) => patch({ sourceNote: opt(v) })} placeholder="Who referred, which recruiter, which posting" />
        </div>
      </div>

      <div className="section">
        <h3>Timeline</h3>
        <DeadlineField value={app.deadline} homeTz={settings.homeTz} onCommit={(d) => patch({ deadline: d })} />
        <div className="grid-3">
          <DateField label="Applied on" value={app.appliedAt ?? ""} onCommit={(v) => patch({ appliedAt: opt(v) })} />
          <TextField label="Next action" value={app.nextAction ?? ""} onCommit={(v) => patch({ nextAction: opt(v) })} placeholder="Follow up with recruiter" />
          <DateField label="Next action due" value={app.nextActionDue ?? ""} onCommit={(v) => patch({ nextActionDue: opt(v) })} />
        </div>
      </div>

      <div className="section">
        <h3>Priority</h3>
        <div className="grid-3">
          <RatingField label="Desire" value={app.desire} onChange={(v) => patch({ desire: v as Rating | null })} />
          <RatingField label="Fit" value={app.fit} onChange={(v) => patch({ fit: v as Rating | null })} />
          <RatingField label="Likelihood" value={app.likelihood} onChange={(v) => patch({ likelihood: v as Rating | null })} />
        </div>
      </div>

      <div className="section">
        <h3>Compensation</h3>
        <div className="grid-3">
          <NumberField label="Min" value={comp.min ?? null} onCommit={(v) => setComp({ min: v ?? undefined })} />
          <NumberField label="Max" value={comp.max ?? null} onCommit={(v) => setComp({ max: v ?? undefined })} />
          <TextField label="Currency" value={comp.currency} onCommit={(v) => setComp({ currency: v.trim().toUpperCase() || settings.displayCurrency })} />
          <SelectField label="Period" value={comp.period} options={PERIODS} onChange={(v) => { if (v) setComp({ period: v as Comp["period"] }); }} allowEmpty={false} />
          <TextField label="Comp note" value={comp.note ?? ""} onCommit={(v) => setComp({ note: opt(v) })} />
          <div className="field">
            <span className="field-label">In {settings.displayCurrency}</span>
            <span>{normalized ?? (comp.currency !== settings.displayCurrency && hasAmounts ? <span className="muted">Set a rate for {comp.currency} in Settings</span> : <span className="muted">—</span>)}</span>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Work authorization</h3>
        <div className="grid-2">
          <TriStateField label="Sponsorship needed" value={app.needsSponsorship} onChange={(v) => patch({ needsSponsorship: v })} />
          <TriStateField label="Sponsorship offered" value={app.sponsorshipOffered} onChange={(v) => patch({ sponsorshipOffered: v })} />
        </div>
      </div>

      {closed ? (
        <div className="section">
          <h3>Closed</h3>
          <SelectField label="Closed reason" value={app.closedReasonId ?? ""} options={pl.closedReasons} onChange={(v) => patch({ closedReasonId: opt(v) })} />
          <p className="muted">Closed on {app.closedAt?.slice(0, 10) ?? "—"}</p>
        </div>
      ) : null}

      <div className="section">
        <h3>Tags and job description</h3>
        <TagInput label="Tags" value={app.tags} onChange={(v) => patch({ tags: v })} />
        <TextArea label="Job description" rows={10} value={app.jobDescription ?? ""} onCommit={(v) => patch({ jobDescription: opt(v) })}
          placeholder="Paste the posting here. AI drafting and requirement extraction use it in a later plan." />
      </div>
    </div>
  );
}
