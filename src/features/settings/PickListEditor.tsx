import { useState } from "react";
import { addEntry, moveEntry, PICK_LIST_LABELS, referencedPickIds, removeEntry, slugId, updateEntry } from "../../domain/pickLists";
import type { ColorToken, PickEntry, PickListName, StatusEntry } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const COLORS: ColorToken[] = ["gray", "blue", "purple", "green", "red", "amber"];
const NAMES = Object.keys(PICK_LIST_LABELS) as PickListName[];

export function PickListEditor() {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const [name, setName] = useState<PickListName>("statuses");
  const [label, setLabel] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const list = settings.pickLists[name] as PickEntry[];
  const used = referencedPickIds(state, name);
  const isStatus = name === "statuses";

  const commit = (next: PickEntry[]) => run(() => repo.saveSettings({ ...settings, pickLists: { ...settings.pickLists, [name]: next } }));
  const editStatus = (id: string, patch: Partial<Omit<StatusEntry, "id">>) => commit(updateEntry(list as StatusEntry[], id, patch));

  const add = () => {
    const text = label.trim();
    if (!text) {
      setAddError("Enter a label for the new entry.");
      return;
    }
    setAddError(null);
    const id = slugId(text, list);
    const entry = isStatus
      ? { id, label: text, color: "gray" as const, group: "open" as const, stageRank: Math.max(0, ...(list as StatusEntry[]).filter((s) => s.group === "open").map((s) => s.stageRank)) + 1 }
      : { id, label: text, color: "gray" as const };
    void commit(addEntry(list, entry as PickEntry));
    setLabel("");
  };

  return (
    <div>
      <div className="toolbar">
        <label className="field">
          <span className="field-label">List</span>
          <select value={name} onChange={(e) => setName(e.target.value as PickListName)}>
            {NAMES.map((n) => <option key={n} value={n}>{PICK_LIST_LABELS[n]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">New entry</span>
          <input value={label} placeholder="Label" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        </label>
        <button type="button" className="btn primary" onClick={add} disabled={repo.readOnly}>Add</button>
        <SaveIndicator status={status} />
      </div>
      {addError ? <p className="field-hint danger-text" role="alert" aria-label="New entry label problem">{addError}</p> : null}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Label</th><th>Color</th>
              {isStatus ? <><th>Group</th><th>Rank</th></> : null}
              <th>Archived</th><th>Order</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => {
              const s = e as StatusEntry;
              const inUse = used.has(e.id);
              return (
                <tr key={`${name}:${e.id}`}>
                  <td>
                    <input key={`${name}:${e.id}:${e.label}`} aria-label={`Label ${e.id}`} defaultValue={e.label}
                      onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.label) void commit(updateEntry(list, e.id, { label: v })); }} />
                  </td>
                  <td>
                    <select aria-label={`Color ${e.id}`} value={e.color ?? "gray"} onChange={(ev) => void commit(updateEntry(list, e.id, { color: ev.target.value as ColorToken }))}>
                      {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  {isStatus ? (
                    <>
                      <td>
                        <select aria-label={`Group ${e.id}`} value={s.group} onChange={(ev) => void editStatus(e.id, { group: ev.target.value as StatusEntry["group"] })}>
                          <option value="open">open</option><option value="won">won</option><option value="lost">lost</option>
                        </select>
                      </td>
                      <td>
                        <input key={`${name}:${e.id}:${s.stageRank}`} aria-label={`Rank ${e.id}`} type="number" style={{ width: 70 }} defaultValue={s.stageRank}
                          onBlur={(ev) => { const n = Number(ev.target.value); if (Number.isFinite(n) && n !== s.stageRank) void editStatus(e.id, { stageRank: n }); }} />
                      </td>
                    </>
                  ) : null}
                  <td><input type="checkbox" aria-label={`Archive ${e.id}`} checked={!!e.archived} onChange={(ev) => void commit(updateEntry(list, e.id, { archived: ev.target.checked }))} /></td>
                  <td>
                    <button type="button" className="btn ghost" aria-label={`Move up ${e.id}`} disabled={i === 0} onClick={() => void commit(moveEntry(list, i, -1))}>↑</button>
                    <button type="button" className="btn ghost" aria-label={`Move down ${e.id}`} disabled={i === list.length - 1} onClick={() => void commit(moveEntry(list, i, 1))}>↓</button>
                  </td>
                  <td>
                    <button type="button" className="btn ghost" aria-label={`Delete ${e.id}`} disabled={inUse || repo.readOnly}
                      title={inUse ? "In use by existing records; archive it instead" : "Delete"}
                      onClick={() => void commit(removeEntry(list, e.id))}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
