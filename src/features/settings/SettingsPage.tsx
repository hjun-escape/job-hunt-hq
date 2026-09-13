import { useState } from "react";
import { defaultSettings } from "../../domain/defaults";
import { nowIso } from "../../domain/ids";
import type { Settings } from "../../domain/types";
import { useApp, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Field, NumberField, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { allTimeZones } from "../../ui/timeZones";
import { useSaver } from "../../ui/useSaver";
import { PickListEditor } from "./PickListEditor";
import { StorageMeter } from "./StorageMeter";

export function SettingsPage() {
  const { repo } = useApp();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [fxCurrency, setFxCurrency] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [fxError, setFxError] = useState<string | null>(null);
  const w = settings.priorityWeights;

  type SettingsPatch = Partial<Settings> | ((current: Settings) => Partial<Settings>);
  const save = (p: SettingsPatch) => run(() => repo.modifySettings((cur) => (typeof p === "function" ? p(cur) : p)));
  const setWeight = (key: keyof Settings["priorityWeights"], v: number | null) => save((cur) => ({ priorityWeights: { ...cur.priorityWeights, [key]: v ?? 0 } }));
  const addFx = () => {
    const code = fxCurrency.trim().toUpperCase();
    const rate = Number(fxRate);
    if (!code || !(rate > 0)) {
      setFxError("Enter a 3-letter currency code and a rate above 0.");
      return;
    }
    setFxError(null);
    void save((cur) => ({ fxRates: { ...cur.fxRates, [code]: rate } }));
    setFxCurrency("");
    setFxRate("");
  };
  const removeFx = (code: string) =>
    void save((cur) => {
      const next = { ...cur.fxRates };
      delete next[code];
      return { fxRates: next };
    });
  const reset = async () => {
    const ok = await confirm({ title: "Reset settings?", message: "Pick lists, weights, rates and cadence return to defaults. Your records are untouched.", confirmLabel: "Reset", typed: "RESET" });
    if (ok) void run(() => repo.saveSettings(defaultSettings(settings.homeTz, nowIso())));
  };

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Settings</h1>
        <SaveIndicator status={status} />
      </div>

      <div className="section">
        <h2>General</h2>
        <div className="grid-2">
          <Field label="Home timezone" htmlFor="home-tz">
            <select id="home-tz" value={settings.homeTz} onChange={(e) => void save({ homeTz: e.target.value })}>
              {allTimeZones().map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <TextField label="Display currency" value={settings.displayCurrency} onCommit={(v) => save({ displayCurrency: v.trim().toUpperCase() || "CAD" })} />
          <NumberField label="Follow-up cadence (days)" value={settings.followUpCadenceDays} min={1} onCommit={(v) => save({ followUpCadenceDays: v ?? 7 })} />
        </div>
        <h3>Priority weights</h3>
        <div className="grid-3">
          <NumberField label="Desire weight" value={w.desire} step={0.05} min={0} onCommit={(v) => setWeight("desire", v)} />
          <NumberField label="Fit weight" value={w.fit} step={0.05} min={0} onCommit={(v) => setWeight("fit", v)} />
          <NumberField label="Likelihood weight" value={w.likelihood} step={0.05} min={0} onCommit={(v) => setWeight("likelihood", v)} />
        </div>
      </div>

      <div className="section">
        <h2>Exchange rates to {settings.displayCurrency}</h2>
        <p className="muted">How many {settings.displayCurrency} one unit of each currency is worth. Used only for the normalized compensation column.</p>
        {Object.keys(settings.fxRates).length > 0 ? (
          <table className="table">
            <tbody>
              {Object.entries(settings.fxRates).map(([cur, rate]) => (
                <tr key={cur}>
                  <td>{cur}</td><td>{rate}</td>
                  <td><button type="button" className="btn ghost" aria-label={`Remove ${cur}`} onClick={() => removeFx(cur)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="row" style={{ marginTop: 8 }}>
          <input aria-label="Currency code" placeholder="USD" value={fxCurrency} onChange={(e) => setFxCurrency(e.target.value)} style={{ width: 100 }} />
          <input aria-label="Rate" placeholder="1.36" value={fxRate} onChange={(e) => setFxRate(e.target.value)} style={{ width: 120 }} />
          <button type="button" className="btn" onClick={addFx} disabled={repo.readOnly}>Add rate</button>
        </div>
        {fxError ? <p className="field-hint danger-text" role="alert" aria-label="Exchange rate problem">{fxError}</p> : null}
      </div>

      <div className="section">
        <h2>Pick lists</h2>
        <p className="muted">Rename freely: records reference entries by id. Archive an entry to hide it from new selections. Entries in use cannot be deleted.</p>
        <PickListEditor />
      </div>

      <div className="section">
        <h2>Files</h2>
        <StorageMeter />
      </div>

      <div className="section">
        <h2>Reset</h2>
        <button type="button" className="btn danger" onClick={() => void reset()} disabled={repo.readOnly}>Reset settings to defaults</button>
      </div>
    </section>
  );
}
