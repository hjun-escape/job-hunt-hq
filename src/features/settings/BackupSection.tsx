import { useRef, useState } from "react";
import { saveText } from "../../capabilities/downloads";
import { buildBackup, planRestore, validateBackup, type Backup, type RestoreMode } from "../../domain/backup";
import { collectionCsv } from "../../domain/csv";
import { nowIso } from "../../domain/ids";
import { COLLECTIONS, type CollectionName } from "../../domain/types";
import { useApp, useAppState, useProfile, useSettings } from "../../store/context";
import { runRestore, type RestoreProgress } from "../../store/restore";
import { useCapability } from "../../store/useCapability";
import { useConfirm } from "../../ui/Confirm";
import { Field } from "../../ui/fields";
import { useToast } from "../../ui/Toast";

const LABELS: Record<CollectionName, string> = { applications: "Applications", companies: "Companies", contacts: "Contacts", assets: "Assets", answers: "Answers", interviews: "Interviews", prep: "Prep" };

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
const summary = (b: Backup) => COLLECTIONS.map((c) => `${(b[c] as unknown[]).length} ${c}`).join(", ");

export function BackupSection() {
  const { repo, store, caps } = useApp();
  const downloads = useCapability(caps.downloads);
  const state = useAppState();
  const settings = useSettings();
  const profile = useProfile();
  const toast = useToast();
  const confirm = useConfirm();
  const [csvCollection, setCsvCollection] = useState<CollectionName>("applications");
  const [pending, setPending] = useState<{ backup: Backup; fileName: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stamp = () => nowIso().slice(0, 10);

  const download = async (filename: string, text: string) => {
    if (!downloads) return;
    try {
      if (await saveText(downloads, filename, text)) toast.show(`Saved ${filename}.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the file.", "error");
    }
  };
  const downloadBackup = () => download(`job-hunt-hq-backup-${stamp()}.json`, JSON.stringify(buildBackup({ ...state, settings, profile }, nowIso()), null, 2));
  const downloadCsv = () => download(`job-hunt-hq-${csvCollection}-${stamp()}.csv`, collectionCsv(Object.values(state[csvCollection])));

  const onPick = async (file: File | undefined) => {
    setProblems([]);
    setPending(null);
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await readFileText(file));
    } catch {
      setProblems(["The file is not valid JSON."]);
      return;
    }
    const v = validateBackup(raw);
    if (!v.ok) setProblems(v.problems);
    else setPending({ backup: v.backup, fileName: file.name });
  };

  const restore = async () => {
    if (!pending || busy) return;
    if (mode === "replace") {
      const ok = await confirm({ title: "Replace everything?", message: "Every current record is deleted, then the backup is written. Uploaded files stay in storage. Type REPLACE to continue.", confirmLabel: "Replace", typed: "REPLACE" });
      if (!ok) return;
    }
    const steps = planRestore(pending.backup, store.getState(), mode);
    const writes = steps.filter((s) => s.kind !== "delete").length;
    setBusy(true);
    setProgress({ done: 0, total: steps.length });
    try {
      const r = await runRestore(repo, steps, { onProgress: setProgress });
      if (r.stopped) toast.show(`Storage is full: wrote ${r.written} of ${writes} documents before stopping.`, "error");
      else toast.show(`Restored ${r.written} documents${r.deleted ? ` and deleted ${r.deleted}` : ""}.`, "success");
      setPending(null);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Restore failed.", "error");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div>
      <h3>Export</h3>
      {downloads === undefined ? <p className="muted">Checking downloads…</p> : downloads === null ? <p className="muted">Downloads are not available in this view, so export is hidden.</p> : (
        <div className="row" style={{ alignItems: "end" }}>
          <button type="button" className="btn primary" onClick={() => void downloadBackup()}>Download backup (JSON)</button>
          <Field label="Collection to export" htmlFor="csv-collection">
            <select id="csv-collection" value={csvCollection} onChange={(e) => setCsvCollection(e.target.value as CollectionName)}>
              {COLLECTIONS.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
            </select>
          </Field>
          <button type="button" className="btn" onClick={() => void downloadCsv()}>Export CSV</button>
        </div>
      )}
      <p className="muted">The backup holds every record, your settings and profile. Uploaded files are not included; their ids are.</p>

      <h3>Restore</h3>
      <Field label="Restore from backup" htmlFor="restore-file" hint="A backup JSON downloaded from this app.">
        <input id="restore-file" ref={fileInput} type="file" accept=".json,application/json" disabled={repo.readOnly || busy} onChange={(e) => void onPick(e.target.files?.[0])} />
      </Field>
      {problems.length ? (
        <ul className="problems" role="alert" aria-label="Backup problems">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
      ) : null}
      {pending ? (
        <div className="section">
          <p>{pending.fileName}: {summary(pending.backup)}. Exported {String(pending.backup.exportedAt ?? "").slice(0, 10)}.</p>
          <div className="row" role="radiogroup" aria-label="Restore mode">
            <label className="row"><input type="radio" name="restore-mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge into current data</label>
            <label className="row"><input type="radio" name="restore-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace everything</label>
          </div>
          <p className="muted">Merge writes every record in the file over any current record with the same id. Replace also deletes current records the file does not contain. Settings and profile come from the file; in merge mode, pick-list entries you added since the backup are kept.</p>
          <button type="button" className={mode === "replace" ? "btn danger" : "btn primary"} onClick={() => void restore()} disabled={busy || repo.readOnly}>Restore</button>
          {progress ? <p aria-live="polite">{progress.done} of {progress.total} steps done</p> : null}
        </div>
      ) : null}
    </div>
  );
}
