import { useState } from "react";
import { navigate } from "../../app/router";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Drawer } from "../../ui/Drawer";
import { Field } from "../../ui/fields";
import { useSaver } from "../../ui/useSaver";

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const pl = settings.pickLists;
  const countries = pl.countries.filter((c) => !c.archived);
  const channels = pl.channels.filter((c) => !c.archived);
  const blank = () => ({ title: "", company: "", url: "", countryId: countries[0]?.id ?? "", channelId: channels[0]?.id ?? "", statusId: "saved" });
  const [form, setForm] = useState(blank);
  const companies = Object.values(state.companies);
  const openStatuses = pl.statuses.filter((s) => s.group === "open" && !s.archived);
  const canSubmit = openStatuses.length > 0 && form.title.trim() !== "" && form.company.trim() !== "" && status !== "saving";

  const submit = () => {
    if (!canSubmit) return;
    const title = form.title.trim();
    const name = form.company.trim();
    void run(async () => {
      const existing = companies.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const company = existing ?? (await repo.createCompany({ name }));
      const statusId = openStatuses.some((s) => s.id === form.statusId) ? form.statusId : (openStatuses[0]?.id ?? "");
      const app = await repo.createApplication({
        companyId: company.id, title, countryId: form.countryId, channelId: form.channelId, statusId,
        ...(form.url.trim() ? { url: form.url.trim() } : {}),
      });
      setForm(blank());
      onClose();
      navigate(`/applications/${app.id}`);
    });
  };

  return (
    <Drawer open={open} title="New application" onClose={onClose}
      footer={<><span className="muted">{status === "saving" ? "Saving…" : ""}</span><button type="button" className="btn primary" onClick={submit} disabled={!canSubmit}>Create</button></>}>
      {openStatuses.length === 0 ? <p className="banner banner-warn" role="alert">There is no open status to file this under. Unarchive one in Settings › Pick lists first.</p> : null}
      <Field label="Role title" htmlFor="qa-title">
        <input id="qa-title" value={form.title} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      </Field>
      <Field label="Company" htmlFor="qa-company" hint="Pick an existing company or type a new name">
        <input id="qa-company" list="qa-companies" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <datalist id="qa-companies">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </Field>
      <Field label="Posting URL" htmlFor="qa-url">
        <input id="qa-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
      </Field>
      <div className="grid-3">
        <Field label="Country" htmlFor="qa-country">
          <select id="qa-country" value={form.countryId} onChange={(e) => setForm({ ...form, countryId: e.target.value })}>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Channel" htmlFor="qa-channel">
          <select id="qa-channel" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })}>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="qa-status">
          <select id="qa-status" value={form.statusId} onChange={(e) => setForm({ ...form, statusId: e.target.value })}>
            {openStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
    </Drawer>
  );
}
