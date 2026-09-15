import { useRef, useState } from "react";
import { downloadFileName, saveStoredFile, uploadDocument, validateDocument } from "../../capabilities/files";
import { assetUsage, formatBytes, isAssetReferenced } from "../../domain/assets";
import { openStages, screenRate } from "../../domain/funnel";
import type { AssetDoc } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useCapability } from "../../store/useCapability";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { MultiPick } from "../../ui/MultiPick";
import { SelectField, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useToast } from "../../ui/Toast";
import { useSaver } from "../../ui/useSaver";
import { useFileStatus } from "./useFileStatus";

export function AssetEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo, caps } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const assets = useCapability(caps.assets);
  const downloads = useCapability(caps.downloads);
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const asset = state.assets[id];
  const fileStatus = useFileStatus(asset?.file?.assetId);
  if (!asset) return <Drawer open title="Asset not found" onClose={onClose}><p className="muted">This asset no longer exists.</p></Drawer>;

  const apps = Object.values(state.applications);
  const usage = assetUsage(id, apps);
  const referenced = isAssetReferenced(id, apps);
  const ro = repo.readOnly;
  const pl = settings.pickLists;
  const stages = openStages(settings);
  type AssetPatch = Partial<AssetDoc> | ((current: AssetDoc) => Partial<AssetDoc>);
  const patch = (p: AssetPatch) => run(() => (typeof p === "function" ? repo.modify("assets", id, p) : repo.update("assets", id, p)));
  const appLabel = (a: { companyId: string; title: string }) => `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}`;

  const onPick = async (file: File | undefined) => {
    setProblem(null);
    if (!file || !assets) return;
    const invalid = validateDocument(file);
    if (invalid) { setProblem(invalid); return; }
    setBusy(true);
    try {
      const stored = await uploadDocument(assets, file);
      await patch({ file: stored });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not upload the file.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  /** The /_blob/ path resolves only inside the artifact frame, so the file is fetched here and
   * offered through the downloads capability instead of opened in a new tab. */
  const download = async () => {
    const f = asset.file;
    if (!f || !downloads) return;
    setSaving(true);
    try {
      if (await saveStoredFile(downloads, f)) toast.show(`Saved ${downloadFileName(f.fileName)}.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the file.", "error");
    } finally {
      setSaving(false);
    }
  };
  const removeFile = async () => {
    const f = asset.file;
    if (!f) return;
    const ok = await confirm({ title: "Remove this file?", message: `${f.fileName} is deleted from storage. The asset record stays.`, confirmLabel: "Remove" });
    if (!ok) return;
    if (await patch({ file: undefined })) {
      try { await assets?.delete(f.assetId); } catch { toast.show("The file record was cleared but storage could not delete it yet.", "error"); }
    }
  };
  const removeRecord = async () => {
    if (referenced) return;
    const ok = await confirm({ title: `Delete ${asset.name}?`, message: asset.file ? "Its file is deleted from storage too. This cannot be undone." : "This cannot be undone.", confirmLabel: "Delete" });
    if (!ok) return;
    const file = asset.file;
    if (!(await run(() => repo.remove("assets", id)))) return;
    if (file) {
      try { await assets?.delete(file.assetId); } catch { toast.show("The record was deleted but storage could not delete its file yet.", "error"); }
    }
    onClose();
  };

  return (
    <Drawer open title={asset.name} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" disabled={referenced || ro || (!!asset.file && assets === undefined)} title={referenced ? "Unlink it from applications first" : undefined} onClick={() => void removeRecord()}>Delete asset</button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={asset.kindId} options={pl.assetKinds} onChange={(v) => { if (v) void patch({ kindId: v }); }} allowEmpty={false} disabled={ro} />
        <TextField label="Name" value={asset.name} onCommit={(v) => (v.trim() ? patch({ name: v.trim() }) : false)} disabled={ro} />
        <TextField label="Version" value={asset.version} onCommit={(v) => patch({ version: v.trim() || "v1" })} disabled={ro} />
      </div>
      <MultiPick label="Target countries" options={pl.countries} value={asset.targetCountryIds} onChange={(fn) => void patch((cur) => ({ targetCountryIds: fn(cur.targetCountryIds) }))} disabled={ro} />
      <MultiPick label="Target role families" options={pl.roleFamilies} value={asset.targetRoleFamilyIds} onChange={(fn) => void patch((cur) => ({ targetRoleFamilyIds: fn(cur.targetRoleFamilyIds) }))} disabled={ro} />

      <div className="section">
        <h3>File</h3>
        {asset.file ? (
          <div className="row">
            <span>{asset.file.fileName} <span className="muted">· {formatBytes(asset.file.sizeBytes)} · uploaded {asset.file.uploadedAt.slice(0, 10)}</span></span>
            {downloads ? (
              <button type="button" className="btn" disabled={saving} onClick={() => void download()}>Download file</button>
            ) : downloads === null ? (
              <span className="muted">Saving files is not available in this view.</span>
            ) : null}
            {fileStatus === "missing" ? <span className="chip chip-red">file missing</span> : null}
            {assets ? <button type="button" className="btn ghost" onClick={() => void removeFile()} disabled={ro}>Remove file</button> : null}
          </div>
        ) : assets === null ? (
          <p className="muted">File uploads are not available in this view.</p>
        ) : (
          <div className="row">
            <input ref={fileInput} aria-label="Upload file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" disabled={busy || ro || assets === undefined} onChange={(e) => void onPick(e.target.files?.[0])} />
            {busy ? <span className="muted">Uploading…</span> : null}
          </div>
        )}
        {problem ? <p className="field-hint danger-text" role="alert">{problem}</p> : null}
        <p className="field-hint">PDF for documents (export Word files to PDF first); PNG, JPEG or WebP for portfolio previews. 20 MB per file.</p>
      </div>

      <TextArea label="Changelog" rows={4} value={asset.changelog} onCommit={(v) => patch({ changelog: v })} placeholder="What changed in this version and why" disabled={ro} />
      <TextArea label="Notes" rows={4} value={asset.notes} onCommit={(v) => patch({ notes: v })} disabled={ro} />

      <h3>Used by</h3>
      {usage.asResume.length + usage.asCoverLetter.length === 0 ? <p className="muted">No application uses this yet. Pick it as the resume or cover letter on an application.</p> : (
        <ul>
          {usage.asResume.map((a) => <li key={`r-${a.id}`}><a href={`#/applications/${a.id}`}>{appLabel(a)}</a> <span className="muted">· resume</span></li>)}
          {usage.asCoverLetter.map((a) => <li key={`c-${a.id}`}><a href={`#/applications/${a.id}`}>{appLabel(a)}</a> <span className="muted">· cover letter</span></li>)}
        </ul>
      )}
      {usage.asResume.length > 0 ? (() => {
        const rate = screenRate(usage.asResume, stages);
        const reached = usage.asResume.filter((a) => a.maxStageRank >= (stages.find((s) => s.id === "screening")?.stageRank ?? Infinity)).length;
        return rate == null ? null : <p className="muted">{`Screen-rate ${Math.round(rate * 100)}%: ${reached} of ${usage.asResume.length} applications using this resume reached Screening.`}</p>;
      })() : null}
    </Drawer>
  );
}
