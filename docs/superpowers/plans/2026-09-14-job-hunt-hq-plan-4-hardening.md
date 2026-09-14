# Job Hunt HQ — Plan 4: Hardening and Backlog (v0.3.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the parked findings from the Plan 1–3 review ledgers: safer CSV and backup handling, a sync layer that never hangs silently, AI panels that respect prompt limits and never lose edits without asking, and a handful of accessibility and read-only gaps; publish v0.3.1.

**Architecture:** No new screens. Pure-rule changes under `src/domain/`, store changes under `src/store/`, small edits to existing features and tests. Every change is test-first; deterministic tests replace the remaining wall-clock timers.

**Tech Stack:** Node 25, npm, React 18, TypeScript 5 strict, esbuild, Luxon, Vitest + jsdom + @testing-library/react 16 (`globals: true`).

**Spec:** `docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md` — §4 (CSV, backup validation), §6 (AI policy), §8 (restore reporting), §9 (degraded modes: the banner must show when storage never becomes definitive).

**Source of the backlog:** `.superpowers/sdd/2026-09-14-job-hunt-hq-plan-3-insights/progress.md` (parked minors of the final review and the re-review), plus the Plan 1–2 ledgers' items still open (ActivityTab indicator, CompanyEditor read-only controls).

**Deliberately not built:** stable per-row ids in RowsEditor (blur commits before any removal click, so the feared draft bleed cannot occur); dev-server `/_blob` serving (esbuild's server cannot intercept paths); rendering hidden tab panels for `aria-controls` (single-panel swap is an accepted pattern); Timeline row wrap polish (no reproducible case on record).

## Global Constraints

- From the repository root, branch `plan-4-hardening` (from `master` at the Plan 3 merge, 9135de2). Run every command from the root.
- React `^18.3.1`; TypeScript `strict: true`; `npm run typecheck` exits 0 after every task.
- Every write goes through `Repository`; the standing ruling on nested patches (function-form `patch`/`modify`, `modifySettings`/`modifyProfile`, updater-style array controls) stays in force.
- Colors via CSS tokens; the single `@media (max-width: 720px)` block in `src/styles/app.css` stays last and unique (test-guarded).
- Accessible names stay unique per page (tests query by label). Existing names to keep: "Discard" (DraftPanel button) — the confirm's button becomes "Discard draft".
- New tests must not depend on wall-clock timing: use gated promises, injected `wait`/timer functions, or `vi.useFakeTimers()` with `advanceTimersByTimeAsync`.
- TDD: failing test first, run it, implement, run green; RED and GREEN captured to files and pasted unedited in the report; zero React `act(...)` warnings.
- Commits: end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Existing interfaces this plan touches (exact, as of 9135de2)

- `src/domain/csv.ts`: `CSV_BOM`, `toCsv(rows, columns?)`, `collectionCsv(docs)`; private `cell(value)` and `quote(s)`.
- `src/domain/backup.ts`: `validateBackup(raw, currentVersion?)` (problems list; `PICK_LIST_NAMES`, `PROFILE_ARRAY_FIELDS`, `PROFILE_OBJECT_FIELDS`, `PICK_REFS`, `isObject`), `planRestore(backup, current, mode, opts?)` (normalizes settings via `defaultSettings` + `defaultPickLists`, profile via `defaultProfile`, docs via factories; `unionPickLists`), `RESTORE_ORDER`, `Backup`, `RestoreStep`.
- `src/store/restore.ts`: `runRestore(repo, steps, {onProgress?, wait?}) → {written, deleted, total, stopped?: "quota_exceeded"}`; retries `resource_exhausted` (max 5), rethrows other errors.
- `src/features/settings/BackupSection.tsx`: `restore()` computes `writes = steps.filter((s) => s.kind !== "delete").length` and toasts.
- `src/domain/agenda.ts`: `dueThisWeek`, `overdue`, `followUpFlags`, `upcomingInterviews(interviews, homeTz, now?, limit?)`; interviews of deleted applications currently appear as "(deleted application)".
- `src/features/dashboard/DashboardPage.tsx`: computes agenda lists on every render with `DateTime.utc()`.
- `src/store/sync.ts`: `startSync(db, store, {homeTz, now?, onError?, migrations?})`; `fail(e)` flips read-only and seeds in-memory defaults; settings/profile subscriptions skip seeding on `snap.metadata.fromCache`; `migrateWithLease(...).catch(fail)`.
- `src/features/ai/useSample.ts`: module-level policy `{hidden, disabledUntil}` via `useSyncExternalStore`; `useSample(sample) → {available, phase, text, setText, error, truncated, disabledUntil, run, runJson, stop, reset}`; `useSamplePolicy()`, `resetSamplePolicy()`.
- `src/features/ai/DraftPanel.tsx`: props `{app?, answer?, sample, onClose, onDirtyChange?}`; `dirty = busy || text.trim()`; Escape stops propagation while dirty; Draft button disabled when `!question.trim() || busy || rateLimited`.
- `src/features/ai/RequirementsPanel.tsx`: `append()` writes `${cur.notes.trimEnd()}\n\n## Requirements\n${markdown()}\n`.
- `src/features/applications/AnswersTab.tsx`: props `{app, patch, onDraftDirty?}`; "Manage the bank" is a plain `<a href="#/answers">`; trigger button gated on `sampleCap && !samplePolicy.hidden`.
- `src/features/applications/ApplicationDetail.tsx` and `src/features/answers/AnswerEditor.tsx`: Drawer `closeGuard` → `confirm({ title: "Discard the draft?", …, confirmLabel: "Discard" })`.
- `src/features/applications/KanbanBoard.tsx`: `move(appId, statusId)` via `run(() => repo.changeStatus(...))`; cards are `<article tabIndex={0}>`; the select is `aria-label={`Move ${label(a)} to`}`; columns are `<section aria-label={s.label}>`.
- `src/features/applications/ApplicationsPage.tsx`: `useState("deadline")` for `sortKey`; `chooseColumns` falls back to "company" when the sorted column is hidden.
- `src/features/settings/PickListEditor.tsx`: `add()` (label required; slug computed inside the updater), rename on blur via `updateEntry`; alert `aria-label="New entry label problem"`.
- `src/features/applications/ActivityTab.tsx`: own `useSaver` with no visible indicator.
- `src/features/companies/CompanyEditor.tsx`: only the Delete button honours `repo.readOnly`.
- `tests/setup.ts`: installs `MemoryStorage` when `localStorage.clear` is not a function.
- Tests with real timers to replace: `tests/store/repository.test.ts` (delayed `set`/`delete` with `setTimeout(…, 20)` and a 50 ms sleep: the two singleton echo tests, "serializes concurrent updates…", the two `modifyProfile`/`modifySettings` un-awaited tests, "remove is serialized…"), `tests/store/sync.test.ts` ("writes a settings migration once…" has a 20 ms sleep).

## File map

```
src/domain/csv.ts                     formula-prefix escaping for string cells
src/domain/backup.ts                  doc-id grammar, settings scalar validation + normalization, precise "missing" wording, no derivative reference problems
src/store/restore.ts                  non-quota failures stop with counts instead of throwing
src/features/settings/BackupSection.tsx   toast for stopped-with-error
src/domain/agenda.ts                  interviews of deleted applications excluded
src/features/dashboard/DashboardPage.tsx  memoized agenda lists, mount-time `now`
src/store/sync.ts                     cache-only-miss fallback (banner), migration failure is non-fatal, injectable timer
src/features/ai/useSample.ts          `maxPromptBytes`, `rateLimited` that re-renders when the window ends
src/features/ai/DraftPanel.tsx        prompt byte pre-check, "Replace your edits?" guard
src/features/ai/RequirementsPanel.tsx replaces an existing "## Requirements" block
src/features/applications/AnswersTab.tsx  "Manage the bank" honours the dirty draft
src/features/applications/ApplicationDetail.tsx, src/features/answers/AnswerEditor.tsx  confirm label "Discard draft"
src/features/applications/KanbanBoard.tsx refocus after a select move; unique region names for duplicate labels
src/features/applications/ApplicationsPage.tsx  initial sortKey honours hidden columns
src/features/settings/PickListEditor.tsx  label uniqueness on add and rename
src/features/assets/AssetEditor.tsx   single openStages call
src/features/applications/ActivityTab.tsx  SaveIndicator
src/features/companies/CompanyEditor.tsx  read-only gating for sponsorship and sources
tests/setup.ts                        sturdier storage probe
tests/store/repository.test.ts, tests/store/sync.test.ts  deterministic gates instead of timers
package.json 0.3.1, README.md
```

---

### Task 1: Domain hardening — CSV escaping, backup validation, restore reporting, agenda scope

**Files:**
- Modify: `src/domain/csv.ts`, `src/domain/backup.ts`, `src/store/restore.ts`, `src/features/settings/BackupSection.tsx`, `src/domain/agenda.ts`, `src/features/dashboard/DashboardPage.tsx`
- Test: `tests/domain/csv.test.ts` (append), `tests/domain/backup.test.ts` (append), `tests/store/restore.test.ts` (append), `tests/features/settings.test.tsx` (append), `tests/domain/agenda.test.ts` (append)

**Interfaces:**
- Produces: string cells (and array cells) that start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` in CSV output (numbers and booleans untouched); `validateBackup` reports `settings is missing.`, `settings.pickLists is missing.` (and then skips per-list and reference checks), invalid document ids (`<name>[<i>] has an invalid id "<id>" (letters, digits, _ - . ~ : @ + only).`), and mistyped settings scalars (`settings.<field> is missing or has the wrong type.` for `homeTz`, `displayCurrency`, `followUpCadenceDays`, `fxRates`, `priorityWeights`); `planRestore` keeps only well-typed scalar settings from the backup (others fall back to defaults); `RestoreResult.stopped?: "quota_exceeded" | "error"` with `error?: string`; `dueThisWeek` and the dashboard's upcoming list skip interviews whose application is gone; the dashboard computes its lists once per mount.

- [ ] **Step 1: Write the failing tests**

Append to `tests/domain/csv.test.ts`:
```ts
  it("neutralizes spreadsheet formulas in text cells but leaves numbers alone", () => {
    const row = toCsv([{ a: "=SUM(A1)", b: -5, c: "-note", d: ["+x", "y"], e: "@handle", f: "\tlead" }]).slice(CSV_BOM.length).split("\r\n")[1];
    expect(row).toBe("'=SUM(A1),-5,'-note,'+x; y,'@handle,'\tlead");
  });
```

Append to `tests/domain/backup.test.ts` (inside its `describe`; reuse `state`, `empty`, `NOW`):
```ts
  it("names a missing settings object precisely and skips derivative problems", () => {
    const b = buildBackup(state(), NOW) as unknown as Record<string, unknown>;
    const noSettings = validateBackup({ ...b, settings: undefined });
    expect(noSettings.ok).toBe(false);
    if (noSettings.ok) return;
    expect(noSettings.problems).toContain("settings is missing.");
    expect(noSettings.problems.some((p) => p.includes("references"))).toBe(false);
    const noLists = validateBackup({ ...b, settings: { homeTz: "UTC" } });
    if (noLists.ok) return;
    expect(noLists.problems).toContain("settings.pickLists is missing.");
    expect(noLists.problems.some((p) => p.includes("is missing or not a list"))).toBe(false);
  });

  it("rejects document ids outside the store's path grammar", () => {
    const b = buildBackup(state(), NOW);
    const bad = { ...b, companies: [{ ...b.companies[0], id: "co/evil" }, { ...b.companies[0], id: ".." }] };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toEqual(expect.arrayContaining([expect.stringMatching(/companies\[0\] has an invalid id "co\/evil"/), expect.stringMatching(/companies\[1\] has an invalid id "\.\."/)]));
  });

  it("rejects mistyped settings scalars and normalizes them away when planning", () => {
    const b = buildBackup(state(), NOW);
    const bad = { ...b, settings: { ...b.settings, priorityWeights: null, followUpCadenceDays: "7", fxRates: "x" } };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toEqual(expect.arrayContaining([
      "settings.priorityWeights is missing or has the wrong type.",
      "settings.followUpCadenceDays is missing or has the wrong type.",
      "settings.fxRates is missing or has the wrong type.",
    ]));
    const step = planRestore(bad as unknown as typeof b, empty(), "replace")[0];
    expect(step.kind).toBe("settings");
    if (step.kind !== "settings") return;
    expect(step.settings.priorityWeights).toEqual({ desire: 0.4, fit: 0.35, likelihood: 0.25 });
    expect(step.settings.followUpCadenceDays).toBe(7);
    expect(step.settings.fxRates).toEqual({});
  });
```

Append to `tests/store/restore.test.ts` (reuse `boot`, `backup`):
```ts
  it("stops with counts and a message on a non-retryable error instead of throwing", async () => {
    const { repo } = await boot((real) => ({
      ...real,
      doc: (path: string) => {
        const ref = real.doc(path);
        return { ...ref, set: async (body: Record<string, unknown>) => { if (path.startsWith("applications/")) throw { code: "invalid_argument", message: "bad" }; return ref.set(body); } };
      },
    }) as unknown as DB);
    const r = await runRestore(repo, planRestore(backup(), { applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, "merge"), { wait: async () => {} });
    expect(r).toMatchObject({ written: 3, stopped: "error", total: 4 });
    expect(r.error).toMatch(/invalid/i);
  });
```

Append to `tests/features/settings.test.tsx` (reuse `open`, `NOW`, the backup builders already imported there):
```tsx
  it("reports a restore that stopped on an error with the counts so far", async () => {
    const db = await open("#/settings");
    const realDoc = db.doc.bind(db);
    db.doc = ((path: string) => {
      const ref = realDoc(path);
      return path.startsWith("applications/") ? { ...ref, set: async () => { throw { code: "invalid_argument", message: "bad" }; } } : ref;
    }) as typeof db.doc;
    const backup = buildBackup({ settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW), applications: { app_1: buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW) }, companies: { co_1: buildCompany({ name: "Imported Co" }, "co_1", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, NOW);
    fireEvent.change(screen.getByLabelText("Restore from backup"), { target: { files: [new File([JSON.stringify(backup)], "good.json", { type: "application/json" })] } });
    await screen.findByText(/good\.json/);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect((await screen.findByText(/Restore stopped after 3 of 4 documents/)).textContent).toMatch(/invalid/i);
  });
```
(If the settings test file already patches `db.doc` differently for the quota test, follow that file's pattern; `buildApplication`/`buildCompany` imports may need adding.)

Append to `tests/domain/agenda.test.ts` (reuse `base`, `app`, `now`, `settings`):
```ts
  it("ignores interviews whose application no longer exists", () => {
    const records = base();
    records.applications = { a: app("a") };
    records.interviews = {
      keep: buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at: "2026-09-16T14:00:00.000Z", tz: "America/Toronto" } }, "keep", NOW),
      orphan: buildInterview({ applicationId: "gone", roundTypeId: "coding", scheduledAt: { at: "2026-09-16T15:00:00.000Z", tz: "America/Toronto" } }, "orphan", NOW),
    };
    expect(dueThisWeek(records, settings, now).map((i) => i.interviewId)).toEqual(["keep"]);
    expect(upcomingInterviews(Object.values(records.interviews), "America/Toronto", now, 5, records.applications).map((i) => i.id)).toEqual(["keep"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/csv.test.ts tests/domain/backup.test.ts tests/store/restore.test.ts tests/features/settings.test.tsx tests/domain/agenda.test.ts`
Expected: csv row lacks the `'` prefixes; backup problems missing/wrong wording and no id/scalar problems; restore rejects instead of resolving; settings toast absent; the orphan interview is listed / `upcomingInterviews` ignores the 5th argument.

- [ ] **Step 3: Implement**

`src/domain/csv.ts` — replace `cell` with:
```ts
/** A leading =, +, -, @, tab or CR makes spreadsheets evaluate the cell; a quote prefix keeps it text. Numbers are never prefixed. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
function cell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = Array.isArray(value)
    ? value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join("; ")
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}
```

`src/domain/backup.ts`:
- Add `const DOC_ID = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/;` and a settings scalar table:
```ts
const SETTINGS_SCALARS: [field: keyof Settings, check: (v: unknown) => boolean][] = [
  ["homeTz", (v) => typeof v === "string" && v.length > 0],
  ["displayCurrency", (v) => typeof v === "string" && v.length > 0],
  ["followUpCadenceDays", (v) => typeof v === "number" && Number.isFinite(v)],
  ["fxRates", (v) => isObject(v) && Object.values(v).every((n) => typeof n === "number")],
  ["priorityWeights", (v) => isObject(v) && ["desire", "fit", "likelihood"].every((k) => typeof v[k] === "number")],
];
```
- In `validateBackup`, replace the settings block with:
```ts
  const settings = raw.settings;
  let listsPresent = false;
  if (!isObject(settings)) {
    problems.push("settings is missing.");
  } else {
    for (const [field, ok] of SETTINGS_SCALARS) if (!ok(settings[field])) problems.push(`settings.${field} is missing or has the wrong type.`);
    if (!isObject(settings.pickLists)) {
      problems.push("settings.pickLists is missing.");
    } else {
      listsPresent = true;
      /* existing per-list loop unchanged */
    }
  }
```
  and in the document loop: after the id check add `if (!DOC_ID.test(doc.id)) { problems.push(`${name}[${i}] has an invalid id "${doc.id}" (letters, digits, _ - . ~ : @ + only).`); return; }`; run the `PICK_REFS` reference check only `if (listsPresent)`.
- In `planRestore`, build `normalizedBackupSettings` field by field: start from `defaultSettings(homeTz, now)`, then copy each `SETTINGS_SCALARS` field from `backup.settings` only when its check passes, set `schemaVersion`, and merge `pickLists` as today.

`src/store/restore.ts`: `RestoreResult` gains `stopped?: "quota_exceeded" | "error"; error?: string;`; in the catch, after the retry branch, replace `throw e;` with:
```ts
        result.stopped = "error";
        result.error = e instanceof Error ? e.message : String(e);
        return result;
```
`src/features/settings/BackupSection.tsx`: after the quota toast add `else if (r.stopped === "error") toast.show(`Restore stopped after ${r.written} of ${writes} documents: ${r.error}`, "error");` and keep the success toast in the final `else`; the `catch` stays for unexpected throws.

`src/domain/agenda.ts`: in `dueThisWeek`'s interview loop, look the application up first and `continue` when it is missing (drop the "(deleted application)" fallback); `upcomingInterviews(interviews, homeTz, now = DateTime.utc(), limit = 5, applications?: Record<string, Application>)` skips interviews whose `applicationId` is not in `applications` when the map is given.

`src/features/dashboard/DashboardPage.tsx`: `const [now] = useState(() => DateTime.utc());` and wrap the four lists in one `useMemo(() => ({ due: …, late: …, flags: …, upcoming: upcomingInterviews(Object.values(state.interviews), settings.homeTz, now, 5, state.applications) }), [state.applications, state.companies, state.contacts, state.interviews, settings, now])`.

- [ ] **Step 4: Run the tests to verify they pass**

Run the five files, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/csv.ts src/domain/backup.ts src/store/restore.ts src/features/settings/BackupSection.tsx src/domain/agenda.ts src/features/dashboard/DashboardPage.tsx tests/domain/csv.test.ts tests/domain/backup.test.ts tests/store/restore.test.ts tests/features/settings.test.tsx tests/domain/agenda.test.ts
git commit -m "fix(domain): CSV formula escaping, stricter backup validation, restore stops with counts, agenda skips orphan interviews

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Sync robustness and deterministic store tests

**Files:**
- Modify: `src/store/sync.ts`
- Test: `tests/store/sync.test.ts` (append + de-flake), `tests/store/repository.test.ts` (de-flake)

**Interfaces:**
- Produces: `SyncOptions.definitiveTimeoutMs?: number` (default 15000) and `SyncOptions.timer?: (fn: () => void, ms: number) => () => void` (default `setTimeout`/`clearTimeout`); when a singleton subscription has delivered only cache-only misses for that long, sync calls `fail({ code: "unavailable", message: "Storage never became definitive." })` so the §9 banner shows; the timer is cancelled by the first definitive snapshot (hit or miss) and by `stop()`; a `migrateWithLease` rejection reports through `onError` without flipping read-only; a shared test helper `gatedDb(db)` replaces the timer-based delayed-set wrappers.

- [ ] **Step 1: Write the failing tests**

Append to `tests/store/sync.test.ts` (reuse `createFakeDb`, `defaultSettings`, `createStore`, `startSync`, `NOW`):
```ts
  it("shows the banner when storage only ever delivers cache-only misses", async () => {
    const db = createFakeDb();
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return { ...real, onSnapshot: (next: (s: DocumentSnapshot) => void) => { next(cacheMiss); return () => {}; } };
      },
    } as unknown as DB;
    const fired: (() => void)[] = [];
    const store = createStore();
    const errors: string[] = [];
    const handle = startSync(wrapped, store, { homeTz: "America/Toronto", now: () => NOW, onError: (e) => errors.push(e.code), timer: (fn) => { fired.push(fn); return () => { fired.splice(fired.indexOf(fn), 1); }; } });
    expect(store.getState().ready).toBe(false);
    fired[0]?.();
    await handle.ready;
    expect(store.getState()).toMatchObject({ ready: true, readOnly: true });
    expect(store.getState().settings?.schemaVersion).toBeTypeOf("number");
    expect(errors).toEqual(["unavailable"]);
    handle.stop();
  });

  it("cancels the definitive-snapshot timer once a real snapshot arrives", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    // the settings listener first sees a cache-only miss (arms the timer), then the definitive hit (clears it)
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return { ...real, onSnapshot: (next: (s: DocumentSnapshot) => void, error?: (e: DbError) => void) => { next(cacheMiss); return real.onSnapshot(next, error); } };
      },
    } as unknown as DB;
    let cancelled = 0;
    const store = createStore();
    const handle = startSync(wrapped, store, { homeTz: "America/Toronto", now: () => NOW, timer: () => () => { cancelled++; } });
    await handle.ready;
    expect(cancelled).toBe(1);
    expect(store.getState().readOnly).toBe(false);
    handle.stop();
  });

  it("keeps the page writable when a migration write fails", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set({ ...defaultSettings("America/Toronto", NOW), schemaVersion: 0 } as unknown as Record<string, unknown>);
    const broken = { ...db, doc: (path: string) => { const real = db.doc(path); return path === "settings/main" ? { ...real, acquire: async () => { throw { code: "unavailable", message: "lease down" }; } } : real; } } as unknown as DB;
    const errors: string[] = [];
    const store = createStore();
    const handle = startSync(broken, store, { homeTz: "America/Toronto", now: () => NOW, onError: (e) => errors.push(e.code), migrations: [{ to: 1, apply: (s: Settings) => s }] });
    await handle.ready;
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(store.getState().readOnly).toBe(false);
    expect(store.getState().settings?.schemaVersion).toBe(1);
    expect(errors).toEqual(["unavailable"]);
    handle.stop();
  });
```

De-flake (same files, no wall-clock timers): add `tests/store/gatedDb.ts` exporting
```ts
/** Wraps a fake db so `set`/`delete` resolve at once while the real write waits for `flush()` -- the
 * platform confirms a write before its subscription echoes it, without any timer. */
export function gatedDb(db: DB): { db: DB; flush: () => Promise<void> } {
  const queued: (() => Promise<void>)[] = [];
  const wrapped = {
    ...db,
    doc: (path: string) => {
      const real = db.doc(path);
      return {
        ...real,
        set: (body: Record<string, unknown>) => { queued.push(() => real.set(body)); return Promise.resolve(); },
        delete: () => { queued.push(() => real.delete()); return Promise.resolve(); },
      };
    },
  } as unknown as DB;
  return { db: wrapped, flush: async () => { while (queued.length) await (queued.shift() as () => Promise<void>)(); } };
}
```
and rewrite the six timer-based tests in `tests/store/repository.test.ts` (the two singleton echo tests, "serializes concurrent updates…", the `modifyProfile`/`modifySettings` un-awaited tests, "remove is serialized…") to use `const { db: slow, flush } = gatedDb(db); const slowRepo = new Repository(slow, store, () => NOW); … await flush();` instead of `setTimeout(…, 20)` and the 50 ms sleep; the assertions stay. In `tests/store/sync.test.ts` "writes a settings migration once…", replace the 20 ms sleep with `await vi.waitFor(async () => expect(((await db.doc("settings/main").get()).data() as unknown as Settings).schemaVersion).toBe(1));` (import `vi`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/store/sync.test.ts tests/store/repository.test.ts` — the three new sync tests fail (`timer` ignored: ready never resolves → use `--testTimeout 3000`; read-only flipped after the migration failure); the rewritten repository tests must pass before AND after (they are a refactor — say so).

- [ ] **Step 3: Implement**

`src/store/sync.ts`:
- `SyncOptions` gains `definitiveTimeoutMs?: number` and `timer?: (fn: () => void, ms: number) => () => void`.
- In `startSync`: `const timer = opts.timer ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); }); const timeoutMs = opts.definitiveTimeoutMs ?? 15000;` and a small helper:
```ts
  /** Spec §9: a cache-only miss should be followed by a definitive snapshot; if none arrives, show the banner instead of "Connecting…" forever. */
  const definitive = new Map<string, () => void>();
  const armDefinitive = (key: string) => {
    if (definitive.has(key)) return;
    definitive.set(key, timer(() => { definitive.delete(key); fail({ code: "unavailable", message: "Storage never became definitive." }); }, timeoutMs));
  };
  const settleDefinitive = (key: string) => { definitive.get(key)?.(); definitive.delete(key); };
```
  In both singleton subscriptions: a cache-only MISS arms the watchdog and returns (no seeding); a cache-only HIT is processed like any hit (`store.setState`, `markReady`) but never writes — the migration write runs only when `!snap.metadata.fromCache`; `settleDefinitive(key)` is called only by a definitive snapshot (hit or miss). `stop()` clears every armed timer. `fail` also clears them.
- The migration write: replace `.catch(fail)` with `.catch((e) => opts.onError?.(e as DbError))` — the store already holds the migrated settings; the next page load retries.

- [ ] **Step 4: Run the tests to verify they pass**

Run the two files, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/store/sync.ts tests/store/sync.test.ts tests/store/repository.test.ts tests/store/gatedDb.ts
git commit -m "fix(sync): banner when storage never becomes definitive, non-fatal migration failures, timer-free store tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: AI polish — prompt budget, rate-limit re-render, edit guards, requirements block, dirty link

**Files:**
- Modify: `src/features/ai/useSample.ts`, `src/features/ai/DraftPanel.tsx`, `src/features/ai/RequirementsPanel.tsx`, `src/features/applications/AnswersTab.tsx`, `src/features/applications/ApplicationDetail.tsx`, `src/features/answers/AnswerEditor.tsx`, `src/capabilities/fakeSample.ts` (`limits` option)
- Test: `tests/features/useSample.test.tsx` (append), `tests/features/ai.test.tsx` (append + label update), `tests/capabilities/fakeSample.test.ts` (append)

**Interfaces:**
- Produces: `createFakeSample({ …, maxPromptBytes?: number })` (default 65536) reported by `limits()`; `useSample` returns `maxPromptBytes: number | null` (fetched once per capability via `sample.limits()`, null on failure) and `rateLimited: boolean` that flips back to false when the window ends (a timer-driven re-render); `DraftPanel` shows "Prompt is N KB over the limit — untick sources or shorten the job description." (`role="status"`) and disables Draft when `promptBytes > maxPromptBytes`; a second Draft click while the textarea differs from the last generated text asks "Replace your edits?" (button "Replace"); `RequirementsPanel.append` replaces an existing "## Requirements" section instead of appending a second; the confirm on drawer close uses `confirmLabel: "Discard draft"`; "Manage the bank" asks the same question when a draft is dirty and navigates only on confirm.

- [ ] **Step 1: Write the failing tests**

Append to `tests/capabilities/fakeSample.test.ts`:
```ts
  it("reports a configurable prompt budget", async () => {
    expect((await createFakeSample({ maxPromptBytes: 1000 }).limits()).maxPromptBytes).toBe(1000);
    expect((await createFakeSample().limits()).maxPromptBytes).toBe(65536);
  });
```

Append to `tests/features/useSample.test.tsx` (the file already imports `act`, `renderHook`, `waitFor`, `createFakeSample`, `useSample`, and resets the policy in `beforeEach`):
```tsx
  it("exposes the prompt budget once the capability resolves", async () => {
    const sample = createFakeSample({ maxPromptBytes: 2048 });
    const { result } = renderHook(() => useSample(sample));
    await waitFor(() => expect(result.current.maxPromptBytes).toBe(2048));
  });

  it("lifts the rate limit on its own when the window ends", async () => {
    vi.useFakeTimers();
    try {
      const limited = createFakeSample({ error: { code: "rate_limited", message: "" } });
      const { result } = renderHook(() => useSample(limited));
      await act(async () => { await result.current.run("q"); });
      expect(result.current.rateLimited).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS + 10); });
      expect(result.current.rateLimited).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
```
(import `vi` from vitest and `RATE_LIMIT_MS` from `../../src/capabilities/ai`; the ai.test budget case imports `buildDraftPrompt`/`profileSummary` from `../../src/capabilities/ai` and `defaultProfile` from `../../src/domain/defaults`; the fake streams on `setTimeout(0)` ticks, so with fake timers the `run` call needs `await vi.runAllTimersAsync()` inside the same `act` if it does not settle — try the simple form first and adapt, saying so.)

Append to `tests/features/ai.test.tsx` (reuse `open`, `openTab`, `createFakeSample`):
```tsx
  it("disables Draft and explains when the prompt exceeds the budget", async () => {
    // A budget strictly between the smallest prompt (everything unticked) and the fullest one (JD, background, one source).
    const base = { question: "Why Shopify?", company: "Shopify", role: "Backend Engineer", language: "en" as const, length: "medium" as const };
    const min = new TextEncoder().encode(buildDraftPrompt({ ...base, sources: [] })).length;
    const max = new TextEncoder().encode(buildDraftPrompt({ ...base, jobDescription: "We need Go and gRPC experience.", sources: [{ title: "STAR: outage", body: "Situation: the checkout went down." }], profileSummary: profileSummary({ ...defaultProfile(NOW), employment: [{ company: "Kakao", title: "Backend Engineer", start: "2021", end: "2024", summary: "Payments." }] }) })).length;
    expect(max).toBeGreaterThan(min);
    const sample = createFakeSample({ reply: () => "x", maxPromptBytes: Math.floor((min + max) / 2) });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Why Shopify?" } });
    expect((await within(panel).findByRole("status")).textContent).toMatch(/over the limit/);
    expect((within(panel).getByRole("button", { name: "Draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Include job description" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Include background summary" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Use STAR: outage" }));
    await waitFor(() => expect((within(panel).getByRole("button", { name: "Draft" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("asks before a second draft replaces edited text", async () => {
    const sample = createFakeSample({ reply: () => "First draft." });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Q" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("First draft."));
    fireEvent.change(within(panel).getByRole("textbox", { name: "Draft" }), { target: { value: "First draft, edited." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Replace your edits\?/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("First draft, edited.");
    expect(sample.calls).toHaveLength(1);
  });

  it("replaces an existing requirements block in the notes instead of appending another", async () => {
    const sample = createFakeSample({ json: () => ({ must: ["Go"], nice: [] }) });
    const db = await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    fireEvent.click(await screen.findByRole("button", { name: "Extract requirements" }));
    await screen.findByRole("checkbox", { name: "Go" });
    fireEvent.click(screen.getByRole("button", { name: "Append to notes" }));
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("## Requirements"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Append to notes" }));
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("- [x] Go"));
    const notes = String((await db.doc("applications/app_1").get()).data()?.notes);
    expect(notes.split("## Requirements")).toHaveLength(2);
  });

  it("asks before leaving through Manage the bank while a draft is in progress", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sample = createFakeSample({ reply: () => "slow", chunks: 2, pace: () => gate });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Q" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Stop" })).toBeTruthy());
    fireEvent.click(screen.getByRole("link", { name: "Manage the bank" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Discard the draft\?/);
    expect(within(dialog).getByRole("button", { name: "Discard draft" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(window.location.hash).toBe("#/applications/app_1");
    release();
  });
```
Also update the existing "asks before closing the drawer while a draft is in progress" test to query the confirm's button as "Discard draft".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/capabilities/fakeSample.test.ts tests/features/useSample.test.tsx tests/features/ai.test.tsx` — `limits()` ignores the option; `maxPromptBytes`/`rateLimited` undefined; no status region; no "Replace your edits?" dialog; two "## Requirements" blocks; the link navigates without asking; the old "Discard" name no longer matches after the label update.

- [ ] **Step 3: Implement**

`src/capabilities/fakeSample.ts`: `FakeSampleOptions.maxPromptBytes?: number`; `limits: async () => ({ maxPromptBytes: opts.maxPromptBytes ?? 65536 })`.

`src/features/ai/useSample.ts`:
- `const [maxPromptBytes, setMaxPromptBytes] = useState<number | null>(null);` + `useEffect(() => { let live = true; setMaxPromptBytes(null); if (!sample) return; sample.limits().then((l) => { if (live) setMaxPromptBytes(l.maxPromptBytes); }, () => { if (live) setMaxPromptBytes(null); }); return () => { live = false; }; }, [sample]);`
- Rate-limit re-render: `const [, retick] = useState(0); useEffect(() => { const ms = disabledUntil - Date.now(); if (ms <= 0) return; const t = setTimeout(() => retick((n) => n + 1), ms + 1); return () => clearTimeout(t); }, [disabledUntil]);` and return `rateLimited: disabledUntil > Date.now()` plus `maxPromptBytes`.

`src/features/ai/DraftPanel.tsx`:
- Build the prompt in render: `const prompt = buildDraftPrompt({...same inputs...})` (extract the input object into `const draftInput = …` used by both the pre-check and `draft()`); `const promptBytes = new TextEncoder().encode(prompt).length; const overBy = sample.maxPromptBytes != null ? promptBytes - sample.maxPromptBytes : 0;`
- Render `{overBy > 0 ? <p className="field-hint danger-text" role="status">{`Prompt is ${Math.ceil(overBy / 1024)} KB over the limit — untick sources or shorten the job description.`}</p> : null}`; Draft `disabled={!question.trim() || busy || sample.rateLimited || overBy > 0}` (replace the local `rateLimited`).
- Edit guard: `const [generated, setGenerated] = useState("")` updated in an effect when `sample.phase === "done"` (`setGenerated(sample.text)`); `const edited = sample.phase === "done" && sample.text !== generated;` `draft` becomes `async () => { if (edited && !(await confirm({ title: "Replace your edits?", message: "Drafting again discards the changes you made to this text.", confirmLabel: "Replace" }))) return; void sample.run(prompt, { cache: false }); }` (`useConfirm` from `../../ui/Confirm`).

`src/features/ai/RequirementsPanel.tsx`: `append` becomes
```ts
  const REQ_BLOCK = /(?:^|\n)## Requirements\n[\s\S]*?(?=\n## |\s*$)/;
  const append = () => void patch((cur) => {
    const block = `## Requirements\n${markdown()}\n`;
    const notes = REQ_BLOCK.test(cur.notes) ? cur.notes.replace(REQ_BLOCK, `\n${block}`).trimStart() : `${cur.notes.trimEnd()}\n\n${block}`.trimStart();
    return { notes };
  });
```

`src/features/applications/AnswersTab.tsx`: keep a local `const [dirty, setDirty] = useState(false)`; pass `onDirtyChange={(d) => { setDirty(d); onDraftDirty?.(d); }}`; the link becomes `<a href="#/answers" className="muted" onClick={(e) => { if (!dirty) return; e.preventDefault(); void confirm({ title: "Discard the draft?", message: "The draft written so far will be lost.", confirmLabel: "Discard draft" }).then((ok) => { if (ok) navigate("/answers"); }); }}>Manage the bank</a>` (`useConfirm`, `navigate` imports).

`ApplicationDetail.tsx` / `AnswerEditor.tsx`: `confirmLabel: "Discard draft"`.

- [ ] **Step 4: Run the tests to verify they pass**

Run the three files, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/capabilities/fakeSample.ts src/features/ai/useSample.ts src/features/ai/DraftPanel.tsx src/features/ai/RequirementsPanel.tsx src/features/applications/AnswersTab.tsx src/features/applications/ApplicationDetail.tsx src/features/answers/AnswerEditor.tsx tests/capabilities/fakeSample.test.ts tests/features/useSample.test.tsx tests/features/ai.test.tsx
git commit -m "fix(ai): prompt budget check, self-lifting rate limit, edit and navigation guards, single requirements block

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Applications and settings polish — kanban focus and names, initial sort, pick-list label uniqueness, tidy-ups

**Files:**
- Modify: `src/features/applications/KanbanBoard.tsx`, `src/features/applications/ApplicationsPage.tsx`, `src/features/settings/PickListEditor.tsx`, `src/features/assets/AssetEditor.tsx`, `tests/setup.ts`
- Test: `tests/features/applications.test.tsx` (append), `tests/features/settings.test.tsx` (append), `tests/domain/kanban.test.ts` (no change), `tests/features/assets.test.tsx` (no change — the screen-rate test still passes)

**Interfaces:**
- Produces: after a "Move … to" select move, focus lands on the moved card (cards carry `id={`kanban-card-${a.id}`}`); when two statuses share a label, the later column's region name is `"<label> (<id>)"`; `sortKey` is initialised from the persisted column prefs (`"deadline"` only if visible, else `"company"`); PickListEditor refuses an add or rename whose label matches another entry in the same list case-insensitively (`An entry labelled "<label>" already exists in this list.` — add: the existing alert; rename: the input reverts and a toast shows); AssetEditor computes `openStages(settings)` once; `tests/setup.ts` probes `setItem`/`removeItem`/`clear` inside the try.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/applications.test.tsx` (reuse `open` with seed, `buildApplication`, `buildCompany`, `within`, `loadColumnPrefs`/`saveColumnPrefs`):
```tsx
  it("keeps focus on a card moved with the select", async () => {
    await open("#/applications?view=board", async (d) => {
      await d.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await d.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "Backend", countryId: "CA", channelId: "linkedin", statusId: "saved", maxStageRank: 1 }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("region", { name: "Saved" });
    fireEvent.change(screen.getByLabelText("Move Shopify · Backend to"), { target: { value: "applied" } });
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Applied" })).getByText("Backend")).toBeTruthy());
    await waitFor(() => expect(document.activeElement?.id).toBe("kanban-card-app_1"));
  });

  it("names duplicate-label columns with the status id", async () => {
    const db = createFakeDb();
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.statuses = s.pickLists.statuses.map((st) => (st.id === "preparing" ? { ...st, label: "Saved" } : st));
    await db.doc("settings/main").set(s as unknown as Record<string, unknown>);
    window.location.hash = "#/applications?view=board";
    render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
    expect(await screen.findByRole("region", { name: "Saved" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Saved (preparing)" })).toBeTruthy();
  });

  it("starts sorted by company when the deadline column is hidden by a saved preference", async () => {
    localStorage.clear();
    saveColumnPrefs(["company", "title", "status"]);
    await open("#/applications");
    expect(screen.getByRole("columnheader", { name: /Company/ }).getAttribute("aria-sort")).toBe("ascending");
    localStorage.clear();
  });
```

Append to `tests/features/settings.test.tsx` (reuse `open`):
```tsx
  it("refuses a pick-list label that already exists in the list", async () => {
    const db = await open("#/settings");
    fireEvent.change(screen.getByLabelText("New entry"), { target: { value: "  applied " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert", { name: "New entry label problem" })).textContent).toMatch(/already exists/);
    const before = ((await db.doc("settings/main").get()).data() as unknown as Settings).pickLists.statuses.length;
    expect(before).toBe(defaultSettings("America/Toronto", NOW).pickLists.statuses.length);
    const rename = screen.getByLabelText("Label saved") as HTMLInputElement;
    fireEvent.change(rename, { target: { value: "Applied" } });
    fireEvent.blur(rename);
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    await waitFor(() => expect(rename.value).toBe("Saved"));
    expect(((await db.doc("settings/main").get()).data() as unknown as Settings).pickLists.statuses.find((x) => x.id === "saved")?.label).toBe("Saved");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/features/applications.test.tsx tests/features/settings.test.tsx` — focus stays on `body`; no "Saved (preparing)" region; Company header unsorted; duplicate label accepted.

- [ ] **Step 3: Implement**

`src/features/applications/KanbanBoard.tsx`:
- Cards get `id={`kanban-card-${a.id}`}`; `move` becomes `(appId, statusId) => void run(() => repo.changeStatus(appId, statusId)).then(() => { document.getElementById(`kanban-card-${appId}`)?.focus(); })` (the card re-mounts in the new column after the echo; focusing after `run` resolves lands on the new element — use `requestAnimationFrame` if the first attempt finds no element in tests: `const el = document.getElementById(...); if (el) el.focus(); else requestAnimationFrame(() => document.getElementById(...)?.focus());`).
- Region names: compute `const labelCounts = new Map<string, number>()` over the columns; when a label occurs more than once, every occurrence after the first uses `${s.label} (${s.id})` as the section's `aria-label` (the heading text stays the label).

`src/features/applications/ApplicationsPage.tsx`: `const [sortKey, setSortKey] = useState(() => (loadColumnPrefs().includes("deadline") ? "deadline" : "company"));`.

`src/features/settings/PickListEditor.tsx`:
- Helper `const clash = (curList: PickEntry[], text: string, exceptId?: string) => curList.some((e) => e.id !== exceptId && e.label.trim().toLowerCase() === text.toLowerCase());`
- `add()`: after the empty check, `if (clash(list, text)) { setAddError(`An entry labelled "${text}" already exists in this list.`); return; }` (checked against the rendered list for the message; the updater keeps its slug logic).
- Rename `onBlur`: `if (clash(list, v, e.id)) { toast.show(`An entry labelled "${v}" already exists in this list.`, "error"); ev.target.value = e.label; return; }` (`useToast` import).

`src/features/assets/AssetEditor.tsx`: `const stages = openStages(settings);` once above the screen-rate block; use it in both places.

`tests/setup.ts`: the probe becomes
```ts
const stubbed = (() => {
  try {
    if (typeof localStorage === "undefined") return true;
    localStorage.setItem("__probe__", "1");
    localStorage.removeItem("__probe__");
    return typeof localStorage.clear !== "function";
  } catch {
    return true;
  }
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the two files plus `tests/features/assets.test.tsx tests/features/columnPrefs.test.ts`, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/KanbanBoard.tsx src/features/applications/ApplicationsPage.tsx src/features/settings/PickListEditor.tsx src/features/assets/AssetEditor.tsx tests/setup.ts tests/features/applications.test.tsx tests/features/settings.test.tsx
git commit -m "fix(ui): kanban keeps focus after a select move, unique column names, initial sort honours hidden columns, pick-list labels stay unique

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Editors — activity save indicator, company editor read-only gating

**Files:**
- Modify: `src/features/applications/ActivityTab.tsx`, `src/features/companies/CompanyEditor.tsx`
- Test: `tests/features/applicationDetail.test.tsx` (append), `tests/features/companies.test.tsx` (append)

**Interfaces:**
- Produces: ActivityTab shows a `SaveIndicator` next to "Add note"; in read-only mode CompanyEditor disables every sponsorship select and note field, the "Add source" controls and each "Remove source" button (the TextFields already accept `disabled`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/applicationDetail.test.tsx` (reuse `open()`):
```tsx
  it("shows the save indicator after logging a note", async () => {
    await open();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "Emailed recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
  });
```
(If the detail header already renders a "Saved" indicator that could match, scope the query with `within(screen.getByRole("tabpanel"))`.)

Append to `tests/features/companies.test.tsx` (the store becomes read-only the way `tests/app/degraded.test.tsx` triggers it: one collection's listener errors terminally twice, so `retryOnce` gives up and `fail()` sets `readOnly` while every other subscription, including the seeded company, loads normally):
```tsx
  it("disables sponsorship and source controls in read-only mode", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
    await db.doc("companies/co_1").set(buildCompany({ name: "Shopify", sources: [{ label: "Blind", url: "https://teamblind.com/x" }] }, "co_1", NOW) as unknown as Record<string, unknown>);
    const dieImmediately = (_next: unknown, error?: (e: DbError) => void) => { error?.({ code: "revoked", message: "gone" }); return () => {}; };
    const broken = { ...db, collection: (path: string) => (path === "prep" ? ({ ...db.collection(path), onSnapshot: dieImmediately } as unknown as CollectionReference) : db.collection(path)) } as unknown as DB;
    window.location.hash = "#/companies/co_1";
    render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(broken) }} />);
    await screen.findByRole("alert"); // the read-only banner
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Canada sponsorship") as HTMLSelectElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText("Canada note") as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText("Source label") as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Add source" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Remove source Blind" }) as HTMLButtonElement).disabled).toBe(true);
  });
```
(`within` from RTL; `DbError`/`CollectionReference`/`DB` are ambient types from `src/types/claude/db.d.ts`. Check the exact "Canada sponsorship"/"Canada note" labels against `CompanyEditor.tsx` — they are built from the country label — and say what you found.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/features/applicationDetail.test.tsx tests/features/companies.test.tsx` — no "Saved" text in the panel; controls enabled.

- [ ] **Step 3: Implement**

`ActivityTab.tsx`: import `SaveIndicator`; render `<SaveIndicator status={status} />` in the note row after the button.
`CompanyEditor.tsx`: `const ro = repo.readOnly;` and `disabled={ro}` on the sponsorship `<select>`, the note `TextField`s, the source label/url inputs, the "Add source" button and each "Remove source" button.

- [ ] **Step 4: Run the tests to verify they pass**

Run the two files, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/ActivityTab.tsx src/features/companies/CompanyEditor.tsx tests/features/applicationDetail.test.tsx tests/features/companies.test.tsx
git commit -m "fix(editors): activity save indicator, company sponsorship and sources honour read-only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Version 0.3.1, verification, publish (orchestrating session)

**Files:**
- Modify: `package.json` + `package-lock.json` (`0.3.1`), `README.md` (heading "Features" without a version; Settings bullet mentions that a restore reports how far it got)

- [ ] **Step 1: Version and README (implementer)**

Bump to `0.3.1` (`npm install --package-lock-only`); README: rename "## Features (v0.3.0)" to "## Features", extend the Settings line with "restores report how far they got if storage refuses a document", and add to the AI drafting paragraph: "Draft is disabled when the prompt would exceed Claude's input limit, and drafting again asks before replacing text you edited." Run `npm test && npm run typecheck && npm run build`; commit `chore: v0.3.1 and README` with the trailer.

- [ ] **Step 2: Walkthrough (controller)**

Dev build: board move keeps focus; pick-list duplicate label refused; Settings restore of a backup with a bad id shows the problem; Draft with a tiny fake budget is not testable in dev (the dev fake reports 64 KiB) — verify the status line does not appear normally; 375 px unchanged.

- [ ] **Step 3: Publish (controller)**

`npm run build`; Artifact tool with the same three files, label `v0.3.1 hardening`; tag `v0.3.1`; push the tag.

---

## Self-review notes

- Backlog coverage: CSV escaping, doc-id grammar, settings scalar validation/normalization, precise missing-settings wording and no derivative reference noise (T1); restore stop-with-counts and its toast (T1); deleted-application interviews out of the agenda, dashboard memo (T1); cache-only-miss banner with an injectable timer, non-fatal migration failure, timer-free store tests (T2); prompt byte budget via `limits()`, rate-limit self-lift, "Replace your edits?", single requirements block, "Manage the bank" guard, "Discard draft" name (T3); kanban focus + duplicate region names, initial sort, pick-list label uniqueness, AssetEditor tidy-up, setup probe (T4); ActivityTab indicator, CompanyEditor read-only (T5).
- Type consistency: `RestoreResult.stopped` widens to a union consumed only by `BackupSection` (T1); `SyncOptions` gains two optional fields consumed by tests (T2); `useSample` adds `maxPromptBytes`/`rateLimited` consumed by `DraftPanel` (T3) — `RequirementsPanel` keeps using `disabledUntil`; `upcomingInterviews` gains an optional fifth parameter used by the dashboard (T1).
