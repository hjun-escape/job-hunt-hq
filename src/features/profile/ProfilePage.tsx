import { useState } from "react";
import { COUNTRY_CURRENCY, profileSectionText, type ProfileSection } from "../../domain/profile";
import type { Profile } from "../../domain/types";
import { useApp, useProfile, useSettings } from "../../store/context";
import { copyText } from "../../ui/copyText";
import { DateField, NumberField, TextArea, TextField } from "../../ui/fields";
import { RowsEditor } from "../../ui/RowsEditor";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useToast } from "../../ui/Toast";
import { useSaver } from "../../ui/useSaver";
import { WorkAuthSection } from "./WorkAuthSection";

type Education = Profile["education"][number];
type Employment = Profile["employment"][number];

export function ProfilePage() {
  const { repo, store } = useApp();
  const profile = useProfile();
  const settings = useSettings();
  const { status, run } = useSaver();
  const toast = useToast();
  const [copied, setCopied] = useState<ProfileSection | null>(null);
  const ro = repo.readOnly;

  type ProfilePatch = Partial<Profile> | ((current: Profile) => Partial<Profile>);
  const save = (p: ProfilePatch) =>
    run(() => {
      const current = store.getState().profile ?? profile;
      const patch = typeof p === "function" ? p(current) : p;
      return repo.saveProfile({ ...current, ...patch });
    });

  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const copySection = async (section: ProfileSection) => {
    if (await copyText(profileSectionText(profile, section))) { setCopied(section); setTimeout(() => setCopied(null), 1500); } else toast.show("Could not copy.", "error");
  };
  const CopyButton = ({ section, label }: { section: ProfileSection; label: string }) => (
    <span className="row"><button type="button" className="btn" onClick={() => void copySection(section)}>{label}</button>{copied === section ? <span className="muted">Copied</span> : null}</span>
  );
  const countries = settings.pickLists.countries;
  const salary = (countryId: string) => profile.salaryExpectations[countryId] ?? { currency: COUNTRY_CURRENCY[countryId] ?? settings.displayCurrency };
  const setSalary = (countryId: string, p: Partial<{ min?: number; max?: number; currency: string }>) =>
    save((cur) => {
      const existing = cur.salaryExpectations[countryId] ?? { currency: COUNTRY_CURRENCY[countryId] ?? settings.displayCurrency };
      return { salaryExpectations: { ...cur.salaryExpectations, [countryId]: { ...existing, ...p } } };
    });

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}><h1>Profile</h1><SaveIndicator status={status} /></div>
      <p className="muted">Your form-fill sheet: copy sections straight into applications. Never store passport, SIN, SSN or 주민번호 here — only where they live.</p>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Identity</h2><CopyButton section="identity" label="Copy identity" /></div>
        <div className="grid-2">
          <TextField label="Full name" value={profile.name} onCommit={(v) => save({ name: v.trim() })} disabled={ro} />
          <TextField label="Email address" type="email" value={profile.email} onCommit={(v) => save({ email: v.trim() })} disabled={ro} />
        </div>
        <RowsEditor label="Phone numbers" rows={profile.phones} columns={[{ key: "label", label: "Label", placeholder: "CA / KR" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={(fn) => void save((cur) => ({ phones: fn(cur.phones) }))} disabled={ro} addLabel="Add phone" />
        <RowsEditor label="Addresses" rows={profile.addresses} columns={[{ key: "countryId", label: "Country", type: "select", options: countries }, { key: "lines", label: "Address", placeholder: "Street, city, postal code" }]} blank={() => ({ countryId: countries[0]?.id ?? "CA", lines: "" })} onChange={(fn) => void save((cur) => ({ addresses: fn(cur.addresses) }))} disabled={ro} addLabel="Add address" />
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Links</h2><CopyButton section="links" label="Copy links" /></div>
        <RowsEditor label="Links" rows={profile.links} columns={[{ key: "label", label: "Label", placeholder: "GitHub, LinkedIn, portfolio" }, { key: "url", label: "URL" }]} blank={() => ({ label: "", url: "" })} onChange={(fn) => void save((cur) => ({ links: fn(cur.links) }))} disabled={ro} addLabel="Add link" />
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Education</h2><CopyButton section="education" label="Copy education" /></div>
        <RowsEditor<Education> label="Education" rows={profile.education}
          columns={[{ key: "school", label: "School" }, { key: "degree", label: "Degree" }, { key: "field", label: "Field" }, { key: "start", label: "Start", placeholder: "2019-09" }, { key: "end", label: "End", placeholder: "2023-05" }, { key: "gpa", label: "GPA" }, { key: "notes", label: "Notes" }]}
          blank={() => ({ school: "", degree: "", field: "", start: "", end: "" })} onChange={(fn) => void save((cur) => ({ education: fn(cur.education) }))} disabled={ro} addLabel="Add education" />
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Employment</h2><CopyButton section="employment" label="Copy employment" /></div>
        <RowsEditor<Employment> label="Employment" rows={profile.employment}
          columns={[{ key: "company", label: "Company" }, { key: "title", label: "Title" }, { key: "start", label: "Start", placeholder: "2023-06" }, { key: "end", label: "End", placeholder: "blank = present" }, { key: "location", label: "Location" }, { key: "summary", label: "Summary" }]}
          blank={() => ({ company: "", title: "", start: "", summary: "" })} onChange={(fn) => void save((cur) => ({ employment: fn(cur.employment) }))} disabled={ro} addLabel="Add employment" />
      </div>

      <div className="section">
        <h2>Salary expectations</h2>
        {countries.map((c) => (
          <div key={c.id} className="grid-3">
            <NumberField label={`${c.label} salary min`} value={salary(c.id).min ?? null} onCommit={(v) => setSalary(c.id, { min: v ?? undefined })} disabled={ro} />
            <NumberField label={`${c.label} salary max`} value={salary(c.id).max ?? null} onCommit={(v) => setSalary(c.id, { max: v ?? undefined })} disabled={ro} />
            <TextField label={`${c.label} salary currency`} value={salary(c.id).currency} onCommit={(v) => setSalary(c.id, { currency: v.trim().toUpperCase() || salary(c.id).currency })} disabled={ro} />
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Availability</h2>
        <div className="grid-2">
          <TextField label="Notice period" value={profile.noticePeriod ?? ""} onCommit={(v) => save({ noticePeriod: opt(v) })} placeholder="2 weeks, 1 month…" disabled={ro} />
          <DateField label="Earliest start date" value={profile.earliestStart ?? ""} onCommit={(v) => void save({ earliestStart: opt(v) })} disabled={ro} />
        </div>
      </div>

      <h2>Work authorization</h2>
      {countries.map((c) => <WorkAuthSection key={c.id} countryId={c.id} countryLabel={c.label} save={save} />)}

      <div className="section">
        <h2>Sensitive documents</h2>
        <TextArea label="Where sensitive documents live" rows={3} value={profile.sensitiveNote} onCommit={(v) => save({ sensitiveNote: v })} placeholder="e.g. Passport scan in 1Password › Documents. Never the numbers themselves." disabled={ro} />
      </div>
    </section>
  );
}
