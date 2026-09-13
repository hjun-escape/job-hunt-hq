# Job Hunt HQ — Plan 3 of 3: Dashboard, Kanban, Search, Backup, AI Assist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tracker into a job-getting tool: a dashboard that says what is due and what converts, a kanban view, global search, backup/restore and CSV export, Claude-powered drafting from the answer bank, and the parked store/UI backlog from Plans 1–2; publish v0.3.0.

**Architecture:** Same layered app (React 18 + TypeScript, esbuild, Vitest). New pure rules under `src/domain/` (funnel, agenda, csv, backup, search, kanban), every write still through `Repository`, new pages/panels under `src/features/`, capabilities (`downloads`, `sample`) wrapped in `src/capabilities/` with in-memory fakes for dev and tests. Each task ends with a working screen or rule and its own tests.

**Tech Stack:** Node 25, npm, React 18, TypeScript 5 strict, esbuild, Luxon, Vitest + jsdom + @testing-library/react 16 (`globals: true`).

**Spec:** `docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md` — this plan implements §4 (priority/funnel/due/overdue/CSV/backup rules), §5 (Dashboard; Applications column chooser, sponsorship/tag filters, kanban; global search; Assets screen-rate; Answers "Tailor with AI"; Settings backup/restore/CSV), §6 (AI draft assist), §8 (export and import), the §2 lease-guarded migration and cache-aware seeding items, and the Plan 3 rows of the Plan 1 and Plan 2 review ledgers.

**Out of scope (spec §11):** email/calendar sync, push reminders, automatic FX rates, multi-user, Word uploads, offline editing.

## Global Constraints

- From the repository root, branch `plan-3-insights` (from `master` at the Plan 2 merge, 410f94b). Run every command from the root.
- React `^18.3.1`; TypeScript `strict: true`; `npm run typecheck` exits 0 after every task.
- Every write goes through `Repository`; components never call `db`, `assets`, `downloads` or `sample` directly except through the helpers this plan adds (`src/capabilities/downloads.ts`, `src/capabilities/ai.ts`, `src/store/restore.ts`, `src/features/ai/useSample.ts`).
- Standing ruling: no editor writes a nested object or array spread from render props. Records use `repo.modify(collection, id, fn)` or the function form of `patch`; singletons use `repo.modifySettings(fn)` / `repo.modifyProfile(fn)`; controls that edit arrays emit updaters `(current) => next`.
- Pick-list values are referenced by `id`, never by label. Records that other records point at cannot be deleted while referenced.
- Every editor autosaves with a visible Saving / Saved / Failed indicator; destructive actions go through `useConfirm` (replace-all restore uses `typed: "REPLACE"`).
- Accessible names are unique on a page (tests query by label). Existing names to avoid colliding with: "Application status", "Application tier", "Filter by country/status/tier/channel", "Search" (applications toolbar), "New company", "Attach answer", "Round type to add".
- Degraded modes (spec §9): `downloads` null hides export buttons; `sample` null or a hide-class error hides AI buttons; `db` null keeps everything read-only.
- All colors via CSS tokens; wide content scrolls inside `.table-wrap`; the single `@media (max-width: 720px)` block in `src/styles/app.css` stays LAST and unique (`tests/styles/mobileCascade.test.ts` guards it) — add new mobile rules INSIDE that block and new desktop rules ABOVE it.
- Sample (spec §6): every call on an explicit click; one `AbortController` per call; never retry from code; `not_granted`/`sampling_disabled`/`not_declared`/`capability_disabled`/`capability_removed` hide the feature for the page load; `rate_limited` disables the button for 30 s; keep `e.text` on failure. Prompts never include contact details or the sensitive note.
- Downloads (spec §8): `downloads.save({filename, data})`; `declined` is silent; other codes toast.
- TDD: failing test first, run it, implement, run green; RED and GREEN vitest output captured to files and pasted unedited in the report; zero React `act(...)` warnings (wrap out-of-band `db.doc().set()` calls made after render in `await act(async () => …)`).
- Commits: end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Existing interfaces this plan builds on (exact, from Plans 1–2)

- `Repository` (`src/store/repository.ts`): `get`, `create(collection, doc)` (full document write + store echo), `update`, `modify(collection, id, fn)`, `remove(collection, id)`, `saveSettings`, `modifySettings(fn)`, `saveProfile`, `modifyProfile(fn)`, `createCompany/Application/Contact/Asset/Answer/Interview/Prep`, `changeStatus(appId, statusId, note?)`, `logActivity`, getter `readOnly`; `RepoError {code, message}`; `stripUndefined`. Private helpers: `serialize(path, fn)`, `write`, `guard`, `requireDb`, `requireSettings`.
- Store (`src/store/store.ts`): `StoreState extends RecordSets { ready, readOnly, settings, profile }`, `createStore(initial?)`. Context (`src/store/context.tsx`): `useApp() → {store, repo, caps}`, `useAppState()`, `useSettings()`, `useProfile()`; `useCapability(promise)` (`src/store/useCapability.ts`) → `undefined` pending, `null` absent.
- Sync (`src/store/sync.ts`): `startSync(db, store, {homeTz, now?, onError?})`, `retryOnce`, `SETTINGS_PATH`, `PROFILE_PATH`; seeds defaults when a singleton is missing; migrates settings with `migrateSettings` (`src/domain/migrate.ts`: `MIGRATIONS: Migration[]`, `migrateSettings(settings, migrations?, target?)`, `Migration {to, apply}`), `SCHEMA_VERSION` in `src/domain/defaults.ts`.
- Domain: `types.ts` (`Application`, `Company`, `Contact`, `AssetDoc`, `Answer`, `Interview`, `PrepItem`, `Profile`, `Settings`, `StatusEntry {group, stageRank}`, `PickEntry`, `RecordSets`, `EntityMap`, `COLLECTIONS`, `ZonedInstant`, `Deadline`, `Comp`), `dates.ts` (`todayIso(homeTz, now?)`, `daysUntil`, `isPastDate(isoDate, homeTz, now?)`, `formatForHome(z, homeTz)`, `formatInstant`, `urgency`), `status.ts` (`findStatus`, `applyStatusChange`, `appendActivity`), `scoring.ts` (`priorityScore`, `suggestedTier`), `money.ts` (`normalizeAmount`, `formatMoney`, `formatCompRange`), `contacts.ts` (`followUpDue(contact, apps, statuses, cadenceDays, today) → {due, daysSince, reason}`), `interviews.ts` (`bucketFor`, `groupInterviews`, `roundsFor`, `formatSlot`, `BUCKET_ORDER`, `BUCKET_LABELS`), `assets.ts` (`assetUsage`, `isAssetReferenced`, `formatBytes`), `answers.ts` (`answerUsage`, `filterAnswers`), `applicationFilters.ts` (`AppFilter {text, countryId, statusId, tier, channelId, includeClosed}`, `emptyFilter`, `filterApplications(apps, f, {companies, settings})`), `pickLists.ts` (`referencedPickIds(records, name)`), `factories.ts` (`buildX(input, id, now)`), `ids.ts` (`newId(prefix)`, `nowIso()`, `ID_PREFIX`), `defaults.ts` (`defaultSettings(homeTz, now)`, `defaultProfile(now)`, `defaultPickLists()`; status ids `saved, preparing, applied, screening, oa, interviewing, final, offer, negotiating` (open), `accepted` (won), `rejected, withdrawn, ghosted` (lost)).
- UI kit (`src/ui/`): `Field`, `TextField`, `TextArea`, `NumberField`, `SelectField`, `DateField`, `RatingField`, `TagInput({label, value, onChange: (update: (cur: string[]) => string[]) => void})`, `TriStateField`, `Chip`, `PickChip`, `Table({rows, columns, sortKey?, sortDir?, onSort?, onRowClick?, emptyText?, selectedId?})` + `Column<T>` (`src/ui/sortRows.ts`), `Drawer({open, title, onClose, children, footer?, wide?})`, `useConfirm()({title, message, confirmLabel?, danger?, typed?})`, `useSaver() → {status, run}`, `SaveIndicator`, `useToast().show(msg, kind?)`, `Markdown({text})`, `copyText(text): Promise<boolean>`, `useSort(initialKey, dir?)`, `MultiPick`, `ChecklistEditor({items, onChange, disabled?})`.
- App (`src/app/`): `routes.tsx` (`NAV`, `PAGES`, `PageProps {parts, query: URLSearchParams}`), `router.ts` (`navigate(to)`, `parseHash`, `useRoute`), `Shell.tsx` (nav + banner + page), `DashboardPage.tsx` (pipeline cards only — replaced in Task 2), `ErrorBoundary`.
- Applications (`src/features/applications/`): `ApplicationsPage.tsx` (toolbar filters, `Table`, `QuickAdd`, `ApplicationDetail`), `ApplicationDetail.tsx` (exports `AppPatch`; header selects "Application status" / "Application tier"; tabs), `OverviewTab.tsx` (sections Role / Where and how / Documents and people / Timeline / Priority / Compensation / Work authorization / Closed / Tags and job description — `TextArea label="Job description"`), `AnswersTab.tsx` (`{app, patch}`; "Attach answer" select, "Attach" button, per-answer "Copy <title>" / "Detach <title>"), `NotesTab.tsx`, `ActivityTab.tsx`, `InterviewsTab.tsx`, `QuickAdd.tsx`, `DeadlineField.tsx`.
- Capabilities (`src/capabilities/`): `types.ts` (`Capabilities {db, assets, downloads, sample}`, `DownloadsLike = typeof Claude.downloads` — `save({filename, data}) → Promise<{status}>`, `SampleLike = typeof Claude.sample` — callable `(input, options?) → Promise<{text, truncated, modelTierApplied}>` with `.json<T>(input, options?)` and `.limits()`; options `{onText?({text, delta}), signal?, modelTier?, cache?}`; errors `{code, message, text?}`), `absentCapabilities()`, `resolve.ts` (`createCapabilities()`; dev branch returns fake db/assets/anchor downloads and `sample: null`), `fakeDb.ts` (`createFakeDb({persistKey?})` with `_load`, `_reset`; snapshots carry `metadata {fromCache: false, hasPendingWrites: false}`; `acquire({holder, ttlMs, data?})` honours an unexpired lease held by another holder), `fakeAssets.ts`, `fakeDownloads.ts` (`createAnchorDownloads()`), `files.ts`, `errors.ts` (`errorCode`, `describeDbError`, `isTransient`).
- Test pattern (from `tests/features/companies.test.tsx`): an `open(hash, seed?)` helper that creates a fake db, writes `settings/main` (`defaultSettings("America/Toronto", NOW)`), runs `seed(db)`, sets `window.location.hash`, renders `<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />`, and awaits the page heading. `tests/app/App.test.tsx` expects the dashboard to render the text "Total" and the status label "Interviewing"; keep both.

## File map

```
src/domain/funnel.ts               openStages, funnel, funnelBy, groupKey, screenRate
src/domain/agenda.ts               dueThisWeek, overdue, followUpFlags, upcomingInterviews, AgendaItem
src/features/dashboard/DashboardPage.tsx, FunnelChart.tsx, AgendaList.tsx   (replaces src/app/DashboardPage.tsx)
src/features/assets/AssetEditor.tsx        + screen-rate line in "Used by"
src/domain/csv.ts                  toCsv, collectionCsv, CSV_BOM
src/domain/backup.ts               buildBackup, validateBackup, planRestore, RestoreStep, RESTORE_ORDER
src/domain/search.ts               searchAll, SearchHit
src/capabilities/downloads.ts      saveText, describeDownloadsError, createFakeDownloads
src/store/restore.ts               runRestore(repo, steps, opts)
src/features/settings/BackupSection.tsx    Backup / CSV / Restore UI (+ SettingsPage section)
src/domain/applicationFilters.ts   + sponsorship, tag filters; allTags
src/domain/kanban.ts               kanbanColumns
src/features/applications/columnPrefs.ts   ALL_COLUMN_KEYS, loadColumnPrefs, saveColumnPrefs
src/features/applications/ColumnChooser.tsx, KanbanBoard.tsx (+ ApplicationsPage view toggle, filters, chooser)
src/features/search/SearchPage.tsx (+ Shell search form, routes "search")
src/capabilities/fakeSample.ts     createFakeSample
src/capabilities/ai.ts             buildDraftPrompt, buildRequirementsPrompt, profileSummary, classifySampleError, describeSampleError, parseRequirements, sampleErrorOf
src/features/ai/useSample.ts       useSample(sample)
src/features/ai/DraftPanel.tsx, RequirementsPanel.tsx (+ AnswersTab "Draft with Claude", AnswerEditor "Tailor with Claude", OverviewTab "Extract requirements"; resolve.ts dev fake sample)
src/store/sync.ts                  lease-guarded migration write; no seeding from a cache-only miss; migrations option
src/domain/migrate.ts              ordering guard
src/store/repository.ts            remove serialized + echoed; requireDb honours store.readOnly
src/domain/pickLists.ts            referencedPickIds covers the profile
src/features/applications/types.ts AppPatch (moved out of ApplicationDetail)
src/ui/fields.tsx                  UrlField; TagInput fast path removed
src/features/assets/AssetEditor.tsx        Open file always visible + status chip; record delete order
src/features/contacts/ContactEditor.tsx    deleted-application labels
src/features/interviews/ChecklistEditor.tsx unique Remove labels
src/features/applications/ApplicationDetail.tsx tabs with aria-controls + arrow keys
src/domain/money.ts                formatCompRange partial ranges
README.md, package.json 0.3.0
tests/**                           mirrors the above
```

---

### Task 1: Domain — funnel, agenda (due / overdue / follow-ups / upcoming), status regression test

**Files:**
- Create: `src/domain/funnel.ts`, `src/domain/agenda.ts`
- Test: `tests/domain/funnel.test.ts`, `tests/domain/agenda.test.ts`, `tests/domain/status.test.ts` (append)

**Interfaces:**
- Consumes: `StatusEntry`, `Application`, `Interview`, `Contact`, `Company`, `Settings` (`src/domain/types.ts`); `followUpDue` (`src/domain/contacts.ts`); `bucketFor` (`src/domain/interviews.ts`); `todayIso` (`src/domain/dates.ts`); factories.
- Produces: `openStages(settings): StatusEntry[]`; `funnel(apps, stages): FunnelStage[]` where `FunnelStage = {id, label, stageRank, reached, conversion: number | null}`; `funnelBy(apps, stages, grouping): Map<string, FunnelStage[]>`; `groupKey(app, grouping)`; `FunnelGrouping = "channel" | "resume"`; `screenRate(apps, stages): number | null`; `dueThisWeek(records, settings, now?)`, `overdue(records, settings, now?)` → `AgendaItem[]` with `AgendaItem = {kind: "deadline" | "nextAction" | "interview", at: ISO UTC, dateOnly, tz?, applicationId, interviewId?, company, title, detail}`; `followUpFlags(records, settings, now?) → {contact, followUp}[]`; `upcomingInterviews(interviews, homeTz, now?, limit?) → Interview[]`; `AgendaRecords = Pick<RecordSets, "applications" | "companies" | "contacts" | "interviews">`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/funnel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import { funnel, funnelBy, openStages, screenRate } from "../../src/domain/funnel";

const NOW = "2026-09-14T00:00:00.000Z";
const settings = defaultSettings("America/Toronto", NOW);
const app = (id: string, statusId: string, maxStageRank: number, extra: Partial<Parameters<typeof buildApplication>[0]> = {}) =>
  buildApplication({ companyId: "co_1", title: id, countryId: "CA", channelId: "linkedin", statusId, maxStageRank, ...extra }, id, NOW);

describe("funnel", () => {
  it("lists open stages in rank order and never won or lost ones", () => {
    const stages = openStages(settings);
    expect(stages.map((s) => s.id)).toEqual(["saved", "preparing", "applied", "screening", "oa", "interviewing", "final", "offer", "negotiating"]);
  });

  it("counts every application that reached a stage, including ones lost later, with stage-to-stage conversion", () => {
    const apps = [app("a", "applied", 3), app("b", "screening", 4), app("c", "rejected", 4), app("d", "saved", 1)];
    const f = funnel(apps, openStages(settings));
    const by = Object.fromEntries(f.map((s) => [s.id, s]));
    expect(by.saved.reached).toBe(4);
    expect(by.applied.reached).toBe(3);
    expect(by.screening.reached).toBe(2);
    expect(by.oa.reached).toBe(0);
    expect(by.saved.conversion).toBeNull();
    expect(by.applied.conversion).toBeCloseTo(3 / 3);
    expect(by.screening.conversion).toBeCloseTo(2 / 3);
    expect(by.oa.conversion).toBeCloseTo(0);
    expect(by.interviewing.conversion).toBeNull(); // nothing reached the previous stage
  });

  it("groups by channel or by resume version", () => {
    const apps = [app("a", "screening", 4), app("b", "applied", 3, { channelId: "referral", resumeAssetId: "as_1" }), app("c", "screening", 4, { resumeAssetId: "as_1" })];
    const byChannel = funnelBy(apps, openStages(settings), "channel");
    expect([...byChannel.keys()].sort()).toEqual(["linkedin", "referral"]);
    expect(byChannel.get("linkedin")!.find((s) => s.id === "screening")!.reached).toBe(2);
    const byResume = funnelBy(apps, openStages(settings), "resume");
    expect([...byResume.keys()].sort()).toEqual(["", "as_1"]);
    expect(byResume.get("as_1")!.find((s) => s.id === "applied")!.reached).toBe(2);
  });

  it("computes the screen-rate as the share that reached Screening, or null without a screening stage or applications", () => {
    const stages = openStages(settings);
    expect(screenRate([app("a", "screening", 4), app("b", "applied", 3)], stages)).toBeCloseTo(0.5);
    expect(screenRate([], stages)).toBeNull();
    expect(screenRate([app("a", "screening", 4)], stages.filter((s) => s.id !== "screening"))).toBeNull();
  });
});
```

`tests/domain/agenda.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { dueThisWeek, followUpFlags, overdue, upcomingInterviews } from "../../src/domain/agenda";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";

const NOW = "2026-09-14T00:00:00.000Z";
// Monday 2026-09-14 09:00 in Toronto
const now = DateTime.fromISO("2026-09-14T13:00:00.000Z", { zone: "utc" });
const settings = defaultSettings("America/Toronto", NOW);
const app = (id: string, extra: Partial<Parameters<typeof buildApplication>[0]> = {}) =>
  buildApplication({ companyId: "co_1", title: `Role ${id}`, countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3, ...extra }, id, NOW);
const base = () => ({ applications: {}, companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW) }, contacts: {}, interviews: {} });

describe("agenda", () => {
  it("merges deadlines, next actions and interviews inside the next seven home-zone days, sorted by time", () => {
    const records = base();
    records.applications = {
      a: app("a", { deadline: { at: "2026-09-16T03:59:59.000Z", tz: "America/Toronto", dateOnly: true } }), // Tue 15 (date-only)
      b: app("b", { nextAction: "Ping recruiter", nextActionDue: "2026-09-14" }),                             // today
      c: app("c", { deadline: { at: "2026-09-22T03:59:59.000Z", tz: "America/Toronto", dateOnly: true } }), // Mon 21: outside
      d: app("d", { statusId: "rejected", nextActionDue: "2026-09-15" }),                                    // closed: ignored
    };
    records.interviews = {
      iv1: buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at: "2026-09-18T14:00:00.000Z", tz: "Asia/Seoul" } }, "iv1", NOW),
      iv2: buildInterview({ applicationId: "a", roundTypeId: "final", scheduledAt: { at: "2026-09-18T15:00:00.000Z", tz: "Asia/Seoul" }, outcome: "cancelled" }, "iv2", NOW),
    };
    const items = dueThisWeek(records, settings, now);
    expect(items.map((i) => `${i.kind}:${i.applicationId}`)).toEqual(["nextAction:b", "deadline:a", "interview:a"]);
    expect(items[0]).toMatchObject({ company: "Shopify", title: "Role b", detail: "Next action: Ping recruiter", dateOnly: true });
    expect(items[2]).toMatchObject({ interviewId: "iv1", detail: "Coding interview", dateOnly: false, tz: "Asia/Seoul" });
    expect(items[1]).toMatchObject({ tz: "America/Toronto", dateOnly: true });
  });

  it("lists overdue next actions and passed deadlines that were never applied to, for open applications only", () => {
    const records = base();
    records.applications = {
      a: app("a", { nextAction: "Send thank-you", nextActionDue: "2026-09-10" }),
      b: app("b", { deadline: { at: "2026-09-12T03:59:59.000Z", tz: "America/Toronto", dateOnly: true } }),
      c: app("c", { deadline: { at: "2026-09-12T03:59:59.000Z", tz: "America/Toronto", dateOnly: true }, appliedAt: "2026-09-11" }),
      d: app("d", { statusId: "ghosted", nextActionDue: "2026-09-01" }),
      e: app("e", { nextActionDue: "2026-09-14" }), // today is not overdue
    };
    const items = overdue(records, settings, now);
    expect(items.map((i) => `${i.kind}:${i.applicationId}`)).toEqual(["nextAction:a", "deadline:b"]);
    expect(items[1].detail).toBe("Deadline passed, not applied");
  });

  it("flags contacts that are due for a follow-up, never-contacted first", () => {
    const records = base();
    records.applications = { a: app("a", { recruiterContactId: "ct_1", referrerContactId: "ct_2" }) };
    records.contacts = {
      ct_1: buildContact({ name: "Dana", relationshipId: "recruiter", lastContactedAt: "2026-08-01" }, "ct_1", NOW),
      ct_2: buildContact({ name: "Min", relationshipId: "referrer" }, "ct_2", NOW),
      ct_3: buildContact({ name: "Unlinked", relationshipId: "peer" }, "ct_3", NOW),
    };
    const flags = followUpFlags(records, settings, now);
    expect(flags.map((f) => f.contact.name)).toEqual(["Min", "Dana"]);
    expect(flags[1].followUp.daysSince).toBe(44);
  });

  it("returns the next pending interviews in time order, capped", () => {
    const mk = (id: string, at: string, outcome: "pending" | "passed" = "pending") =>
      buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at, tz: "America/Toronto" }, outcome }, id, NOW);
    const list = [mk("late", "2026-10-01T14:00:00.000Z"), mk("soon", "2026-09-15T14:00:00.000Z"), mk("past", "2026-09-01T14:00:00.000Z"), mk("done", "2026-09-16T14:00:00.000Z", "passed"),
      buildInterview({ applicationId: "a", roundTypeId: "coding" }, "unscheduled", NOW)];
    expect(upcomingInterviews(list, "America/Toronto", now).map((i) => i.id)).toEqual(["soon", "late"]);
    expect(upcomingInterviews(list, "America/Toronto", now, 1).map((i) => i.id)).toEqual(["soon"]);
  });
});
```

Append inside `describe` in `tests/domain/status.test.ts` (read the file first; reuse its existing helpers/imports — it already imports `applyStatusChange`, `defaultSettings`/status lookup and a NOW constant; adapt names to what is there):
```ts
  it("moving between two closed statuses re-stamps closedAt and keeps the reason", () => {
    const rejected = findStatus(settings, "rejected")!;
    const withdrawn = findStatus(settings, "withdrawn")!;
    const closed = { ...applyStatusChange(app, rejected, "2026-09-01T00:00:00.000Z"), closedReasonId: "no-response" };
    const next = applyStatusChange(closed, withdrawn, "2026-09-02T00:00:00.000Z");
    expect(next.closedAt).toBe("2026-09-02T00:00:00.000Z");
    expect(next.closedReasonId).toBe("no-response");
    expect(next.statusId).toBe("withdrawn");
  });
```
(`no-response` is the default first closed reason id — check `src/domain/defaults.ts`; if the id differs, use the actual first `closedReasons` id.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/funnel.test.ts tests/domain/agenda.test.ts tests/domain/status.test.ts`
Expected: funnel and agenda files fail to import (`Cannot find module`); the status test passes already if `applyStatusChange` already re-stamps (it does — say so in the report; it is a regression guard the Plan 1 review asked for).

- [ ] **Step 3: Implement**

`src/domain/funnel.ts`:
```ts
import type { Application, Settings, StatusEntry } from "./types";

export interface FunnelStage {
  id: string;
  label: string;
  stageRank: number;
  reached: number;
  /** reached / previous stage's reached; null for the first stage or when nothing reached the previous one. */
  conversion: number | null;
}
export type FunnelGrouping = "channel" | "resume";

/** Open statuses in funnel order. Archived ones stay: applications that reached them still count. */
export function openStages(settings: Pick<Settings, "pickLists">): StatusEntry[] {
  return settings.pickLists.statuses.filter((s) => s.group === "open").sort((a, b) => a.stageRank - b.stageRank);
}

/** Spec §4: an application "reached" a stage when maxStageRank ≥ stageRank, whatever happened afterwards. */
export function funnel(apps: Application[], stages: StatusEntry[]): FunnelStage[] {
  let previous: number | null = null;
  return stages.map((s) => {
    const reached = apps.filter((a) => a.maxStageRank >= s.stageRank).length;
    const conversion = previous == null || previous === 0 ? null : reached / previous;
    previous = reached;
    return { id: s.id, label: s.label, stageRank: s.stageRank, reached, conversion };
  });
}

export function groupKey(app: Application, grouping: FunnelGrouping): string {
  return grouping === "channel" ? app.channelId : (app.resumeAssetId ?? "");
}

export function funnelBy(apps: Application[], stages: StatusEntry[], grouping: FunnelGrouping): Map<string, FunnelStage[]> {
  const groups = new Map<string, Application[]>();
  for (const a of apps) {
    const k = groupKey(a, grouping);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return new Map([...groups].map(([k, list]) => [k, funnel(list, stages)] as const));
}

/** Spec §5 Assets: share of the given applications that reached the "screening" stage. */
export function screenRate(apps: Application[], stages: StatusEntry[]): number | null {
  const stage = stages.find((s) => s.id === "screening");
  if (!stage || apps.length === 0) return null;
  return apps.filter((a) => a.maxStageRank >= stage.stageRank).length / apps.length;
}
```

`src/domain/agenda.ts`:
```ts
import { DateTime } from "luxon";
import { followUpDue, type FollowUp } from "./contacts";
import { todayIso } from "./dates";
import { bucketFor } from "./interviews";
import type { Application, Contact, Interview, RecordSets, Settings } from "./types";

export type AgendaKind = "deadline" | "nextAction" | "interview";
export interface AgendaItem {
  kind: AgendaKind;
  /** ISO UTC instant used for ordering and display. */
  at: string;
  dateOnly: boolean;
  /** Source zone of a deadline or interview slot; absent for next-action dates (home zone). */
  tz?: string;
  applicationId: string;
  interviewId?: string;
  company: string;
  title: string;
  detail: string;
}
export type AgendaRecords = Pick<RecordSets, "applications" | "companies" | "contacts" | "interviews">;
export interface FollowUpFlag {
  contact: Contact;
  followUp: FollowUp;
}

function openStatusIds(settings: Settings): Set<string> {
  return new Set(settings.pickLists.statuses.filter((s) => s.group === "open").map((s) => s.id));
}
function companyName(records: AgendaRecords, app: Application | undefined): string {
  return app ? (records.companies[app.companyId]?.name ?? "?") : "?";
}
function roundLabel(settings: Settings, id: string): string {
  return settings.pickLists.roundTypes.find((r) => r.id === id)?.label ?? id;
}
const byTime = (a: AgendaItem, b: AgendaItem) => a.at.localeCompare(b.at);

/** Spec §4: items dated inside [startOfToday, startOfToday + 7 days) in the home zone, one sorted list. */
export function dueThisWeek(records: AgendaRecords, settings: Settings, now: DateTime = DateTime.utc()): AgendaItem[] {
  const tz = settings.homeTz;
  const start = now.setZone(tz).startOf("day");
  const end = start.plus({ days: 7 });
  const inWindow = (t: DateTime) => t.isValid && t >= start && t < end;
  const open = openStatusIds(settings);
  const items: AgendaItem[] = [];
  for (const a of Object.values(records.applications)) {
    if (!open.has(a.statusId)) continue;
    const company = companyName(records, a);
    if (a.deadline && inWindow(DateTime.fromISO(a.deadline.at, { zone: "utc" }).setZone(tz))) {
      items.push({ kind: "deadline", at: a.deadline.at, dateOnly: a.deadline.dateOnly, tz: a.deadline.tz, applicationId: a.id, company, title: a.title, detail: "Deadline" });
    }
    if (a.nextActionDue) {
      const t = DateTime.fromISO(a.nextActionDue, { zone: tz }).startOf("day");
      if (inWindow(t)) items.push({ kind: "nextAction", at: t.toUTC().toISO() as string, dateOnly: true, applicationId: a.id, company, title: a.title, detail: `Next action: ${a.nextAction ?? "—"}` });
    }
  }
  for (const i of Object.values(records.interviews)) {
    if (!i.scheduledAt || i.outcome !== "pending") continue;
    if (!inWindow(DateTime.fromISO(i.scheduledAt.at, { zone: "utc" }).setZone(tz))) continue;
    const a = records.applications[i.applicationId];
    items.push({ kind: "interview", at: i.scheduledAt.at, dateOnly: false, tz: i.scheduledAt.tz, applicationId: i.applicationId, interviewId: i.id, company: companyName(records, a), title: a?.title ?? "(deleted application)", detail: roundLabel(settings, i.roundTypeId) });
  }
  return items.sort(byTime);
}

/** Spec §4: open applications with a next action due before today, or a passed deadline with no appliedAt. */
export function overdue(records: AgendaRecords, settings: Settings, now: DateTime = DateTime.utc()): AgendaItem[] {
  const tz = settings.homeTz;
  const today = todayIso(tz, now);
  const open = openStatusIds(settings);
  const items: AgendaItem[] = [];
  for (const a of Object.values(records.applications)) {
    if (!open.has(a.statusId)) continue;
    const company = companyName(records, a);
    if (a.nextActionDue && a.nextActionDue < today) {
      const t = DateTime.fromISO(a.nextActionDue, { zone: tz }).startOf("day");
      items.push({ kind: "nextAction", at: t.toUTC().toISO() as string, dateOnly: true, applicationId: a.id, company, title: a.title, detail: `Next action: ${a.nextAction ?? "—"}` });
    }
    if (a.deadline && !a.appliedAt && DateTime.fromISO(a.deadline.at, { zone: "utc" }) < now) {
      items.push({ kind: "deadline", at: a.deadline.at, dateOnly: a.deadline.dateOnly, tz: a.deadline.tz, applicationId: a.id, company, title: a.title, detail: "Deadline passed, not applied" });
    }
  }
  return items.sort(byTime);
}

/** Contacts due for a follow-up (spec §4), never-contacted first, then the longest-waiting. */
export function followUpFlags(records: AgendaRecords, settings: Settings, now: DateTime = DateTime.utc()): FollowUpFlag[] {
  const apps = Object.values(records.applications);
  const today = todayIso(settings.homeTz, now);
  const rank = (f: FollowUp) => f.daysSince ?? Number.MAX_SAFE_INTEGER;
  return Object.values(records.contacts)
    .map((contact) => ({ contact, followUp: followUpDue(contact, apps, settings.pickLists.statuses, settings.followUpCadenceDays, today) }))
    .filter((f) => f.followUp.due)
    .sort((a, b) => rank(b.followUp) - rank(a.followUp));
}

/** Pending, scheduled, not yet past — soonest first. */
export function upcomingInterviews(interviews: Interview[], homeTz: string, now: DateTime = DateTime.utc(), limit = 5): Interview[] {
  return interviews
    .filter((i): i is Interview & { scheduledAt: NonNullable<Interview["scheduledAt"]> } => !!i.scheduledAt && i.outcome === "pending" && bucketFor(i.scheduledAt, homeTz, now) !== "past")
    .sort((a, b) => a.scheduledAt.at.localeCompare(b.scheduledAt.at))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/funnel.test.ts tests/domain/agenda.test.ts tests/domain/status.test.ts` — all pass. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/funnel.ts src/domain/agenda.ts tests/domain/funnel.test.ts tests/domain/agenda.test.ts tests/domain/status.test.ts
git commit -m "feat(domain): funnel, screen-rate, due-this-week, overdue, follow-up flags, upcoming interviews

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Dashboard page and asset screen-rate

**Files:**
- Create: `src/features/dashboard/DashboardPage.tsx`, `src/features/dashboard/AgendaList.tsx`, `src/features/dashboard/FunnelChart.tsx`
- Delete: `src/app/DashboardPage.tsx` (the placeholder)
- Modify: `src/app/routes.tsx` (import path), `src/features/assets/AssetEditor.tsx` (screen-rate line under "Used by"), `src/styles/app.css` (agenda + funnel rules, ABOVE the final mobile block)
- Test: `tests/features/dashboard.test.tsx`, `tests/features/assets.test.tsx` (append)

**Interfaces:**
- Consumes: Task 1 (`dueThisWeek`, `overdue`, `followUpFlags`, `upcomingInterviews`, `openStages`, `funnel`, `funnelBy`, `screenRate`), `formatForHome`, `formatSlot`, `assetUsage`.
- Produces: `DashboardPage` (route `""`), `AgendaList({title, items, homeTz, emptyText, tone?})`, `FunnelChart({apps, settings, assets})` with a grouping radio group labelled "Funnel grouping" (options "All", "By channel", "By resume version"). The pipeline cards keep their markup (`.cards` / `.card` with a "Total" card) so `tests/app/App.test.tsx` and `tests/app/degraded.test.tsx` keep passing.

- [ ] **Step 1: Write the failing tests**

`tests/features/dashboard.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DateTime } from "luxon";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildAsset, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";
const TZ = "America/Toronto";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);
const today = DateTime.utc().setZone(TZ).startOf("day");
const dateOnly = (d: DateTime) => ({ at: d.endOf("day").toUTC().toISO() as string, tz: TZ, dateOnly: true });

async function open(seed: (db: ReturnType<typeof createFakeDb>) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings(TZ, NOW));
  await seed(db);
  window.location.hash = "#/";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Dashboard" });
  return db;
}
const app = (id: string, extra: Partial<Parameters<typeof buildApplication>[0]> = {}) =>
  buildApplication({ companyId: "co_1", title: `Role ${id}`, countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3, ...extra }, id, NOW);

describe("Dashboard", () => {
  it("lists what is due this week and what is overdue, linking to the application", async () => {
    await open(async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "applications/due", app("due", { deadline: dateOnly(today.plus({ days: 2 })) }));
      await put(db, "applications/late", app("late", { nextAction: "Send thank-you", nextActionDue: today.minus({ days: 3 }).toISODate() as string }));
    });
    const due = screen.getByRole("region", { name: "Due this week" });
    expect(within(due).getByText("Shopify · Role due")).toBeTruthy();
    expect(within(due).getByRole("link", { name: /Role due/ }).getAttribute("href")).toBe("#/applications/due");
    const late = screen.getByRole("region", { name: "Overdue" });
    expect(within(late).getByText("Next action: Send thank-you")).toBeTruthy();
  });

  it("shows upcoming interviews in the home zone and follow-up flags", async () => {
    await open(async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "applications/a", app("a", { recruiterContactId: "ct_1" }));
      await put(db, "contacts/ct_1", buildContact({ name: "Dana Park", relationshipId: "recruiter" }, "ct_1", NOW));
      await put(db, "interviews/iv1", buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at: today.plus({ days: 1 }).set({ hour: 14 }).toUTC().toISO() as string, tz: TZ } }, "iv1", NOW));
    });
    const upcoming = screen.getByRole("region", { name: "Upcoming interviews" });
    expect(within(upcoming).getByRole("link", { name: /Shopify · Role a/ }).getAttribute("href")).toBe("#/interviews/iv1");
    expect(within(upcoming).getByText(/14:00/)).toBeTruthy();
    const flags = screen.getByRole("region", { name: "Follow-ups" });
    expect(within(flags).getByRole("link", { name: "Dana Park" }).getAttribute("href")).toBe("#/contacts/ct_1");
    expect(within(flags).getByText("Never contacted")).toBeTruthy();
  });

  it("draws the funnel with reached counts and regroups by channel or resume version", async () => {
    await open(async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
      await put(db, "applications/a", app("a", { maxStageRank: 4, statusId: "screening", resumeAssetId: "as_1" }));
      await put(db, "applications/b", app("b", { maxStageRank: 3, channelId: "referral" }));
      await put(db, "applications/c", app("c", { maxStageRank: 4, statusId: "rejected" }));
    });
    const funnel = screen.getByRole("region", { name: "Funnel" });
    expect(within(funnel).getByText("Saved: 3 reached")).toBeTruthy();
    expect(within(funnel).getByText("Applied: 3 reached · 100%")).toBeTruthy();
    expect(within(funnel).getByText("Screening: 2 reached · 67%")).toBeTruthy();
    fireEvent.click(within(funnel).getByRole("radio", { name: "By channel" }));
    expect(within(funnel).getByRole("heading", { name: "LinkedIn" })).toBeTruthy();
    expect(within(funnel).getByRole("heading", { name: "Referral" })).toBeTruthy();
    fireEvent.click(within(funnel).getByRole("radio", { name: "By resume version" }));
    expect(within(funnel).getByRole("heading", { name: "Backend resume" })).toBeTruthy();
    expect(within(funnel).getByRole("heading", { name: "No resume linked" })).toBeTruthy();
  });

  it("keeps the pipeline cards and shows empty states", async () => {
    await open(async () => {});
    expect(screen.getByText("Total")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Due this week" })).getByText("Nothing due in the next seven days.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Funnel" })).getByText("No applications yet.")).toBeTruthy();
  });
});
```

Append to `tests/features/assets.test.tsx` (inside its `describe`; reuse `open`/`put`/`NOW`):
```tsx
  it("shows the screen-rate of applications that use the asset as their resume", async () => {
    await open("#/assets/as_1", async (db) => {
      await db.doc("assets/as_1").set(buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW) as unknown as Record<string, unknown>);
      await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", createdAt: NOW, updatedAt: NOW });
      await db.doc("applications/a").set(buildApplication({ companyId: "co_1", title: "A", countryId: "CA", channelId: "linkedin", statusId: "screening", maxStageRank: 4, resumeAssetId: "as_1" }, "a", NOW) as unknown as Record<string, unknown>);
      await db.doc("applications/b").set(buildApplication({ companyId: "co_1", title: "B", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3, resumeAssetId: "as_1" }, "b", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    expect(screen.getByText("Screen-rate 50%: 1 of 2 applications using this resume reached Screening.")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/features/dashboard.test.tsx tests/features/assets.test.tsx`
Expected: dashboard — no region "Due this week" (`Unable to find an accessible element with the role "region"`); assets — screen-rate text missing.

- [ ] **Step 3: Implement**

`src/features/dashboard/AgendaList.tsx`:
```tsx
import type { AgendaItem } from "../../domain/agenda";
import { formatForHome } from "../../domain/dates";
import { Chip } from "../../ui/Chip";

interface Props {
  title: string;
  items: AgendaItem[];
  homeTz: string;
  emptyText: string;
  tone?: "red" | "amber" | "blue";
}

export function AgendaList({ title, items, homeTz, emptyText, tone = "blue" }: Props) {
  const id = `agenda-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {items.length === 0 ? <p className="muted">{emptyText}</p> : (
        <ul className="agenda">
          {items.map((it) => {
            const f = formatForHome({ at: it.at, tz: it.tz ?? homeTz, dateOnly: it.dateOnly }, homeTz);
            const href = it.kind === "interview" && it.interviewId ? `#/interviews/${it.interviewId}` : `#/applications/${it.applicationId}`;
            return (
              <li key={`${it.kind}-${it.applicationId}-${it.interviewId ?? ""}-${it.at}`} className="agenda-item">
                <Chip color={tone} title={f.source ?? undefined}>{f.home}</Chip>
                <a href={href}>{it.company} · {it.title}</a>
                <span className="muted">{it.detail}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

`src/features/dashboard/FunnelChart.tsx`:
```tsx
import { useState } from "react";
import { funnel, funnelBy, openStages, type FunnelGrouping, type FunnelStage } from "../../domain/funnel";
import type { Application, AssetDoc, Settings } from "../../domain/types";

type Grouping = "all" | FunnelGrouping;
const OPTIONS: { id: Grouping; label: string }[] = [
  { id: "all", label: "All" },
  { id: "channel", label: "By channel" },
  { id: "resume", label: "By resume version" },
];

function Bars({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.reached));
  return (
    <ul className="funnel">
      {stages.map((s) => (
        <li key={s.id} className="funnel-row">
          <span className="funnel-label">{s.label}</span>
          <span className="funnel-track"><span className="funnel-bar" style={{ width: `${Math.round((s.reached / max) * 100)}%` }} /></span>
          <span className="funnel-count">{`${s.label}: ${s.reached} reached${s.conversion == null ? "" : ` · ${Math.round(s.conversion * 100)}%`}`}</span>
        </li>
      ))}
    </ul>
  );
}

export function FunnelChart({ apps, settings, assets }: { apps: Application[]; settings: Settings; assets: Record<string, AssetDoc> }) {
  const [grouping, setGrouping] = useState<Grouping>("all");
  const stages = openStages(settings);
  const groupLabel = (key: string) => grouping === "channel"
    ? (settings.pickLists.channels.find((c) => c.id === key)?.label ?? key)
    : (key ? (assets[key]?.name ?? "Deleted resume") : "No resume linked");
  return (
    <section className="section" aria-labelledby="funnel-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="funnel-title">Funnel</h2>
        <div className="row" role="radiogroup" aria-label="Funnel grouping">
          {OPTIONS.map((o) => (
            <label key={o.id} className="row"><input type="radio" name="funnel-grouping" value={o.id} checked={grouping === o.id} onChange={() => setGrouping(o.id)} /> {o.label}</label>
          ))}
        </div>
      </div>
      <p className="muted">How many applications reached each stage (lost ones still count for the stages they reached) and the conversion from the previous stage.</p>
      {apps.length === 0 ? <p className="muted">No applications yet.</p>
        : grouping === "all" ? <Bars stages={funnel(apps, stages)} />
        : [...funnelBy(apps, stages, grouping)].sort((a, b) => groupLabel(a[0]).localeCompare(groupLabel(b[0]))).map(([key, rows]) => (
          <div key={key || "none"} className="funnel-group">
            <h3>{groupLabel(key)}</h3>
            <Bars stages={rows} />
          </div>
        ))}
    </section>
  );
}
```

`src/features/dashboard/DashboardPage.tsx`:
```tsx
import { useMemo } from "react";
import { DateTime } from "luxon";
import { dueThisWeek, followUpFlags, overdue, upcomingInterviews } from "../../domain/agenda";
import { formatSlot } from "../../domain/interviews";
import { useAppState, useSettings } from "../../store/context";
import { PickChip } from "../../ui/Chip";
import { AgendaList } from "./AgendaList";
import { FunnelChart } from "./FunnelChart";

export function DashboardPage() {
  const state = useAppState();
  const settings = useSettings();
  const now = DateTime.utc();
  const records = { applications: state.applications, companies: state.companies, contacts: state.contacts, interviews: state.interviews };
  const apps = useMemo(() => Object.values(state.applications), [state.applications]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of apps) m.set(a.statusId, (m.get(a.statusId) ?? 0) + 1);
    return m;
  }, [apps]);
  const open = settings.pickLists.statuses.filter((s) => s.group === "open" && !s.archived);
  const due = dueThisWeek(records, settings, now);
  const late = overdue(records, settings, now);
  const flags = followUpFlags(records, settings, now);
  const upcoming = upcomingInterviews(Object.values(state.interviews), settings.homeTz, now, 5);
  const label = (applicationId: string) => {
    const a = state.applications[applicationId];
    return a ? `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}` : "(deleted application)";
  };
  return (
    <section>
      <h1>Dashboard</h1>
      <div className="cards">
        {open.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-label">{s.label}</div>
            <div className="card-value">{counts.get(s.id) ?? 0}</div>
          </div>
        ))}
        <div className="card">
          <div className="card-label">Total</div>
          <div className="card-value">{apps.length}</div>
        </div>
      </div>
      <div className="grid-2 dashboard-grid">
        <AgendaList title="Overdue" items={late} homeTz={settings.homeTz} tone="red" emptyText="Nothing overdue. Nice." />
        <AgendaList title="Due this week" items={due} homeTz={settings.homeTz} tone="amber" emptyText="Nothing due in the next seven days." />
        <section className="section" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title">Upcoming interviews</h2>
          {upcoming.length === 0 ? <p className="muted">No interviews scheduled.</p> : (
            <ul className="agenda">
              {upcoming.map((iv) => (
                <li key={iv.id} className="agenda-item">
                  <PickChip list={settings.pickLists.roundTypes} id={iv.roundTypeId} />
                  <a href={`#/interviews/${iv.id}`}>{label(iv.applicationId)}</a>
                  <span className="muted">{formatSlot(iv.scheduledAt, settings.homeTz)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="section" aria-labelledby="followups-title">
          <h2 id="followups-title">Follow-ups</h2>
          {flags.length === 0 ? <p className="muted">No one is waiting on you.</p> : (
            <ul className="agenda">
              {flags.map(({ contact, followUp }) => (
                <li key={contact.id} className="agenda-item">
                  <PickChip list={settings.pickLists.contactRelationships} id={contact.relationshipId} />
                  <a href={`#/contacts/${contact.id}`}>{contact.name}</a>
                  <span className="muted">{followUp.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <FunnelChart apps={apps} settings={settings} assets={state.assets} />
    </section>
  );
}
```

`src/app/routes.tsx`: replace `import { DashboardPage } from "./DashboardPage";` with `import { DashboardPage } from "../features/dashboard/DashboardPage";` and delete `src/app/DashboardPage.tsx` (`git rm`).

`src/features/assets/AssetEditor.tsx`: import `screenRate`, `openStages` from `../../domain/funnel` and `useSettings` if not already imported; after the "Used by" list (the `<ul>` rendered when usage is non-empty), when `usage.asResume.length > 0` add:
```tsx
      {usage.asResume.length > 0 ? (() => {
        const rate = screenRate(usage.asResume, openStages(settings));
        const reached = usage.asResume.filter((a) => a.maxStageRank >= (openStages(settings).find((s) => s.id === "screening")?.stageRank ?? Infinity)).length;
        return rate == null ? null : <p className="muted">{`Screen-rate ${Math.round(rate * 100)}%: ${reached} of ${usage.asResume.length} applications using this resume reached Screening.`}</p>;
      })() : null}
```

`src/styles/app.css` (above the final mobile block):
```css
/* dashboard */
.dashboard-grid { gap: 14px; align-items: start; }
.agenda { list-style: none; padding: 0; margin: 0; }
.agenda-item { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.agenda-item:last-child { border-bottom: 0; }
.funnel { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.funnel-row { display: grid; grid-template-columns: 140px 1fr auto; gap: 10px; align-items: center; }
.funnel-label { font-size: 13px; }
.funnel-track { display: block; height: 14px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
.funnel-bar { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
.funnel-count { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.funnel-group h3 { margin: 12px 0 6px; }
```
Inside the final mobile block add: `.funnel-row { grid-template-columns: 1fr; gap: 2px; }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/features/dashboard.test.tsx tests/features/assets.test.tsx tests/app tests/styles` then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A src/features/dashboard src/app/routes.tsx src/app/DashboardPage.tsx src/features/assets/AssetEditor.tsx src/styles/app.css tests/features/dashboard.test.tsx tests/features/assets.test.tsx
git commit -m "feat(dashboard): due, overdue, upcoming interviews, follow-ups, funnel with grouping; asset screen-rate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Domain — CSV, backup validation and restore planning, global search

**Files:**
- Create: `src/domain/csv.ts`, `src/domain/backup.ts`, `src/domain/search.ts`
- Test: `tests/domain/csv.test.ts`, `tests/domain/backup.test.ts`, `tests/domain/search.test.ts`

**Interfaces:**
- Consumes: `RecordSets`, `Settings`, `Profile`, `COLLECTIONS`, `EntityMap`, `SCHEMA_VERSION`, `migrateSettings`, factories.
- Produces: `CSV_BOM`, `toCsv(rows: Record<string, unknown>[], columns?: string[]): string`, `collectionCsv(docs: object[]): string`; `Backup` type, `buildBackup(state, now): Backup`, `validateBackup(raw: unknown, currentVersion?): {ok: true; backup: Backup} | {ok: false; problems: string[]}`, `RestoreMode = "merge" | "replace"`, `RestoreStep = {kind: "settings", settings} | {kind: "profile", profile} | {kind: "delete", collection, id} | {kind: "write", collection, doc}`, `planRestore(backup, current: RecordSets, mode, migrations?): RestoreStep[]`, `RESTORE_ORDER`; `SearchHit = {kind: "application" | "company" | "contact" | "answer", id, title, subtitle, href}`, `searchAll(records, query, limit?): SearchHit[]`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/csv.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CSV_BOM, collectionCsv, toCsv } from "../../src/domain/csv";

describe("csv", () => {
  it("writes a BOM, a header from the union of keys, CRLF rows, and RFC 4180 quoting", () => {
    const csv = toCsv([{ a: "plain", b: 'say "hi", ok' }, { a: "second", c: "line\nbreak" }]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).split("\r\n");
    expect(lines[0]).toBe("a,b,c");
    expect(lines[1]).toBe('plain,"say ""hi"", ok",');
    expect(lines[2]).toBe('second,,"line\nbreak"');
    expect(lines[3]).toBe("");
  });

  it("joins arrays with '; ', serializes nested objects as JSON, and keeps Korean text intact", () => {
    const csv = toCsv([{ tags: ["백엔드", "remote"], comp: { min: 1, currency: "KRW" }, n: 3, ok: true, nothing: null }]);
    const row = csv.slice(CSV_BOM.length).split("\r\n")[1];
    expect(row).toBe('백엔드; remote,"{""min"":1,""currency"":""KRW""}",3,true,');
  });

  it("uses explicit columns when given and an empty body for no rows", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b"]).slice(CSV_BOM.length)).toBe("b\r\n2\r\n");
    expect(collectionCsv([])).toBe(`${CSV_BOM}\r\n`);
  });
});
```

`tests/domain/backup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildBackup, planRestore, validateBackup } from "../../src/domain/backup";
import { SCHEMA_VERSION, defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { RecordSets } from "../../src/domain/types";

const NOW = "2026-09-14T00:00:00.000Z";
const empty = (): RecordSets => ({ applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} });
const state = () => ({
  settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW),
  ...empty(),
  companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW) },
  applications: { app_1: buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) },
});

describe("backup", () => {
  it("builds a backup envelope with every collection and no file bytes", () => {
    const b = buildBackup(state(), NOW);
    expect(b).toMatchObject({ app: "job-hunt-hq", schemaVersion: SCHEMA_VERSION, exportedAt: NOW });
    expect(b.applications.map((a) => a.id)).toEqual(["app_1"]);
    expect(b.companies).toHaveLength(1);
    expect(b.prep).toEqual([]);
    expect(JSON.stringify(b)).not.toContain("_blobs");
  });

  it("round-trips through validation", () => {
    const b = buildBackup(state(), NOW);
    const v = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(v.ok).toBe(true);
  });

  it("rejects a newer schema, malformed collections, and unknown pick-list ids with readable problems", () => {
    const b = buildBackup(state(), NOW) as unknown as Record<string, unknown>;
    const bad = { ...b, schemaVersion: SCHEMA_VERSION + 1, contacts: "nope", applications: [{ ...(b.applications as object[])[0], statusId: "ghost-status" }, { title: "no id" }] };
    const v = validateBackup(bad);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/schemaVersion 2 is newer/),
      expect.stringMatching(/contacts must be an array/),
      expect.stringMatching(/applications\[0\].*statusId "ghost-status"/),
      expect.stringMatching(/applications\[1\].*id/),
    ]));
    expect(validateBackup("not an object")).toMatchObject({ ok: false });
    expect(validateBackup({ ...b, app: "other" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/job-hunt-hq/)] });
  });

  it("plans a merge as settings, profile, then upserts in dependency order", () => {
    const b = buildBackup(state(), NOW);
    const steps = planRestore(b, empty(), "merge");
    expect(steps.map((s) => s.kind)).toEqual(["settings", "profile", "write", "write"]);
    expect(steps.slice(2).map((s) => (s.kind === "write" ? `${s.collection}/${s.doc.id}` : ""))).toEqual(["companies/co_1", "applications/app_1"]);
  });

  it("plans a replace as deletes of every current document the backup lacks, before the writes", () => {
    const b = buildBackup(state(), NOW);
    const current = { ...empty(), companies: { co_9: buildCompany({ name: "Gone" }, "co_9", NOW), co_1: buildCompany({ name: "Kept" }, "co_1", NOW) } };
    const steps = planRestore(b, current, "replace");
    expect(steps.map((s) => (s.kind === "delete" ? `delete ${s.collection}/${s.id}` : s.kind))).toEqual(["settings", "profile", "delete companies/co_9", "write", "write"]);
  });

  it("migrates an older backup's settings forward while planning", () => {
    const b = buildBackup(state(), NOW);
    const older = { ...b, schemaVersion: 0, settings: { ...b.settings, schemaVersion: 0 } };
    const bump = [{ to: SCHEMA_VERSION, apply: (s: typeof b.settings) => ({ ...s, followUpCadenceDays: 9 }) }];
    const steps = planRestore(older as typeof b, empty(), "merge", bump);
    expect(steps[0]).toMatchObject({ kind: "settings", settings: { schemaVersion: SCHEMA_VERSION, followUpCadenceDays: 9 } });
    expect(planRestore(b, empty(), "merge")[0]).toMatchObject({ kind: "settings", settings: { followUpCadenceDays: 7 } });
  });
});
```

`tests/domain/search.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildAnswer, buildApplication, buildCompany, buildContact } from "../../src/domain/factories";
import { searchAll } from "../../src/domain/search";
import type { RecordSets } from "../../src/domain/types";

const NOW = "2026-09-14T00:00:00.000Z";
const records: RecordSets = {
  applications: { app_1: buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW) },
  companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW), co_2: buildCompany({ name: "Shopping Cart Inc" }, "co_2", NOW) },
  contacts: { ct_1: buildContact({ name: "Dana Shop", relationshipId: "recruiter", companyId: "co_1" }, "ct_1", NOW) },
  assets: {}, answers: { an_1: buildAnswer({ kindId: "answer", title: "Why Shopify" }, "an_1", NOW) }, interviews: {}, prep: {},
};

describe("searchAll", () => {
  it("matches applications by title or company, companies, contacts and answers, prefix matches first", () => {
    const hits = searchAll(records, "shop");
    expect(hits.map((h) => `${h.kind}:${h.id}`)).toEqual(["company:co_1", "company:co_2", "application:app_1", "contact:ct_1", "answer:an_1"]);
    expect(hits[2]).toMatchObject({ title: "Backend Engineer", subtitle: "Shopify", href: "#/applications/app_1" });
    expect(hits[3].href).toBe("#/contacts/ct_1");
  });

  it("is case-insensitive, trims, returns nothing for a blank query, and caps results", () => {
    expect(searchAll(records, "  BACKEND ")).toHaveLength(1);
    expect(searchAll(records, "   ")).toEqual([]);
    expect(searchAll(records, "o", 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/csv.test.ts tests/domain/backup.test.ts tests/domain/search.test.ts` — all three fail with `Cannot find module`.

- [ ] **Step 3: Implement**

`src/domain/csv.ts`:
```ts
/** Spec §4 CSV rules: scalar columns, arrays joined with "; ", nested objects as JSON, RFC 4180 quoting, UTF-8 BOM, CRLF. */
export const CSV_BOM = "\uFEFF";

function cell(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(quote).join(",")];
  for (const r of rows) lines.push(cols.map((c) => quote(cell(r[c]))).join(","));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

export function collectionCsv(docs: object[]): string {
  return toCsv(docs as Record<string, unknown>[]);
}
```

`src/domain/backup.ts`:
```ts
import { SCHEMA_VERSION } from "./defaults";
import { MIGRATIONS, migrateSettings, type Migration } from "./migrate";
import type { Answer, Application, AssetDoc, CollectionName, Company, Contact, EntityMap, Interview, PrepItem, Profile, RecordSets, Settings } from "./types";

export interface Backup {
  app: "job-hunt-hq";
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  profile: Profile;
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  assets: AssetDoc[];
  answers: Answer[];
  interviews: Interview[];
  prep: PrepItem[];
}
export type RestoreMode = "merge" | "replace";
export type RestoreStep =
  | { kind: "settings"; settings: Settings }
  | { kind: "profile"; profile: Profile }
  | { kind: "delete"; collection: CollectionName; id: string }
  | { kind: "write"; collection: CollectionName; doc: EntityMap[CollectionName] };

/** Parents before children so references resolve while restoring. */
export const RESTORE_ORDER: CollectionName[] = ["companies", "contacts", "assets", "answers", "applications", "interviews", "prep"];

export function buildBackup(state: RecordSets & { settings: Settings; profile: Profile }, now: string): Backup {
  return {
    app: "job-hunt-hq",
    schemaVersion: state.settings.schemaVersion,
    exportedAt: now,
    settings: state.settings,
    profile: state.profile,
    applications: Object.values(state.applications),
    companies: Object.values(state.companies),
    contacts: Object.values(state.contacts),
    assets: Object.values(state.assets),
    answers: Object.values(state.answers),
    interviews: Object.values(state.interviews),
    prep: Object.values(state.prep),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Which pick list each foreign key on a record must resolve against. */
const PICK_REFS: Partial<Record<CollectionName, [field: string, list: string][]>> = {
  applications: [["statusId", "statuses"], ["channelId", "channels"], ["countryId", "countries"]],
  contacts: [["relationshipId", "contactRelationships"]],
  assets: [["kindId", "assetKinds"]],
  answers: [["kindId", "answerKinds"]],
  interviews: [["roundTypeId", "roundTypes"]],
  prep: [["kindId", "prepKinds"]],
};

/** Spec §4: accepted when schemaVersion ≤ current, every collection is an array of objects with string ids,
 * and referenced pick-list ids exist in the backup's own settings; otherwise readable problems and no writes. */
export function validateBackup(raw: unknown, currentVersion: number = SCHEMA_VERSION): { ok: true; backup: Backup } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(raw)) return { ok: false, problems: ["The file is not a JSON object."] };
  if (raw.app !== "job-hunt-hq") problems.push('This is not a Job Hunt HQ backup (missing app: "job-hunt-hq").');
  if (typeof raw.schemaVersion !== "number") problems.push("schemaVersion is missing.");
  else if (raw.schemaVersion > currentVersion) problems.push(`schemaVersion ${raw.schemaVersion} is newer than this app understands (${currentVersion}). Update the app first.`);
  const settings = raw.settings;
  if (!isObject(settings) || !isObject(settings.pickLists)) problems.push("settings.pickLists is missing.");
  if (!isObject(raw.profile)) problems.push("profile is missing.");
  const lists = isObject(settings) && isObject(settings.pickLists) ? (settings.pickLists as Record<string, unknown>) : {};
  const idsOf = (list: string): Set<string> => new Set(Array.isArray(lists[list]) ? (lists[list] as { id?: unknown }[]).map((e) => String(e.id)) : []);
  for (const name of RESTORE_ORDER) {
    const arr = raw[name];
    if (!Array.isArray(arr)) { problems.push(`${name} must be an array.`); continue; }
    arr.forEach((doc, i) => {
      if (!isObject(doc) || typeof doc.id !== "string" || !doc.id) { problems.push(`${name}[${i}] has no string id.`); return; }
      for (const [field, list] of PICK_REFS[name] ?? []) {
        const v = doc[field];
        if (typeof v === "string" && v && !idsOf(list).has(v)) problems.push(`${name}[${i}] (${doc.id}) references ${field} "${v}" which is not in the backup's ${list}.`);
      }
    });
  }
  return problems.length ? { ok: false, problems } : { ok: true, backup: raw as unknown as Backup };
}

/** Merge upserts every document; replace also deletes current documents the backup does not carry. Settings/profile first. */
export function planRestore(backup: Backup, current: RecordSets, mode: RestoreMode, migrations: Migration[] = MIGRATIONS): RestoreStep[] {
  const steps: RestoreStep[] = [
    { kind: "settings", settings: migrateSettings({ ...backup.settings, schemaVersion: backup.settings.schemaVersion ?? backup.schemaVersion }, migrations) },
    { kind: "profile", profile: backup.profile },
  ];
  if (mode === "replace") {
    for (const name of RESTORE_ORDER) {
      const keep = new Set((backup[name] as { id: string }[]).map((d) => d.id));
      for (const id of Object.keys(current[name])) if (!keep.has(id)) steps.push({ kind: "delete", collection: name, id });
    }
  }
  for (const name of RESTORE_ORDER) for (const doc of backup[name] as EntityMap[CollectionName][]) steps.push({ kind: "write", collection: name, doc });
  return steps;
}
```

`src/domain/search.ts`:
```ts
import type { RecordSets } from "./types";

export type SearchKind = "application" | "company" | "contact" | "answer";
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
const KIND_ORDER: SearchKind[] = ["company", "application", "contact", "answer"];

/** Spec §5: matches company name, application title (or its company), contact name, answer title. Prefix matches rank first. */
export function searchAll(records: Pick<RecordSets, "applications" | "companies" | "contacts" | "answers">, query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { hit: SearchHit; prefix: boolean }[] = [];
  const consider = (hit: SearchHit, ...fields: string[]) => {
    const lower = fields.map((f) => f.toLowerCase());
    if (!lower.some((f) => f.includes(q))) return;
    hits.push({ hit, prefix: lower.some((f) => f.startsWith(q)) });
  };
  for (const c of Object.values(records.companies)) consider({ kind: "company", id: c.id, title: c.name, subtitle: c.hq ?? c.industry ?? "", href: `#/companies/${c.id}` }, c.name);
  for (const a of Object.values(records.applications)) {
    const company = records.companies[a.companyId]?.name ?? "";
    consider({ kind: "application", id: a.id, title: a.title, subtitle: company, href: `#/applications/${a.id}` }, a.title, company);
  }
  for (const c of Object.values(records.contacts)) consider({ kind: "contact", id: c.id, title: c.name, subtitle: records.companies[c.companyId ?? ""]?.name ?? c.title ?? "", href: `#/contacts/${c.id}` }, c.name);
  for (const a of Object.values(records.answers)) consider({ kind: "answer", id: a.id, title: a.title, subtitle: a.question ?? "", href: `#/answers/${a.id}` }, a.title);
  return hits
    .sort((x, y) => Number(y.prefix) - Number(x.prefix) || KIND_ORDER.indexOf(x.hit.kind) - KIND_ORDER.indexOf(y.hit.kind) || x.hit.title.localeCompare(y.hit.title))
    .slice(0, limit)
    .map((h) => h.hit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/csv.test.ts tests/domain/backup.test.ts tests/domain/search.test.ts`; then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/csv.ts src/domain/backup.ts src/domain/search.ts tests/domain/csv.test.ts tests/domain/backup.test.ts tests/domain/search.test.ts
git commit -m "feat(domain): CSV flattening, backup validation and restore planning, global search

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Backup, CSV export and restore (Settings)

**Files:**
- Create: `src/capabilities/downloads.ts`, `src/store/restore.ts`, `src/features/settings/BackupSection.tsx`
- Modify: `src/features/settings/SettingsPage.tsx` (new section), `src/styles/app.css` (`.problems` list)
- Test: `tests/capabilities/downloads.test.ts`, `tests/store/restore.test.ts`, `tests/features/settings.test.tsx` (append)

**Interfaces:**
- Consumes: Task 3 (`buildBackup`, `validateBackup`, `planRestore`, `collectionCsv`), `Repository`, `useCapability`, `useConfirm`, `useToast`, `DownloadsLike`.
- Produces: `describeDownloadsError(e): string | null` (null = declined, nothing to report), `saveText(downloads, filename, text): Promise<boolean>`, `createFakeDownloads({fail?}) → DownloadsLike & {saved: {filename, data}[]}`; `runRestore(repo, steps, {onProgress?, wait?}) → Promise<{written, deleted, total, stopped?: "quota_exceeded"}>`; `BackupSection` with buttons "Download backup (JSON)", "Export CSV" (+ select "Collection to export"), file input "Restore from backup", radios "Merge into current data" / "Replace everything", button "Restore".

- [ ] **Step 1: Write the failing tests**

`tests/capabilities/downloads.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeDownloads, describeDownloadsError, saveText } from "../../src/capabilities/downloads";

describe("downloads helper", () => {
  it("saves text through the capability and reports success", async () => {
    const fake = createFakeDownloads();
    expect(await saveText(fake, "a.csv", "x,y")).toBe(true);
    expect(fake.saved).toEqual([{ filename: "a.csv", data: "x,y" }]);
  });

  it("treats a decline as a quiet false and maps other codes to viewer copy", async () => {
    expect(await saveText(createFakeDownloads({ fail: { code: "declined", message: "" } }), "a.json", "{}")).toBe(false);
    await expect(saveText(createFakeDownloads({ fail: { code: "rejected_extension", message: "" } }), "a.exe", "")).rejects.toThrow(/cannot be saved/);
    expect(describeDownloadsError({ code: "rate_limited", message: "" })).toMatch(/already open/);
    expect(describeDownloadsError({ code: "declined", message: "" })).toBeNull();
    expect(describeDownloadsError({ code: "weird", message: "" })).toMatch(/Could not save/);
  });
});
```

`tests/store/restore.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { buildBackup, planRestore } from "../../src/domain/backup";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { Repository } from "../../src/store/repository";
import { runRestore } from "../../src/store/restore";
import { createStore } from "../../src/store/store";
import { startSync } from "../../src/store/sync";

const NOW = "2026-09-14T00:00:00.000Z";
async function boot(wrap?: (db: DB) => DB) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  const store = createStore();
  const handle = startSync(db, store, { homeTz: "America/Toronto", now: () => NOW });
  await handle.ready;
  return { db, store, repo: new Repository(wrap ? wrap(db) : db, store, () => NOW) };
}
const backup = () => buildBackup({
  settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW),
  applications: { app_1: buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) },
  companies: { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {},
}, NOW);

describe("runRestore", () => {
  it("applies every step in order and reports progress", async () => {
    const { db, store, repo } = await boot();
    const steps = planRestore(backup(), store.getState(), "merge");
    const progress: number[] = [];
    const r = await runRestore(repo, steps, { onProgress: (p) => progress.push(p.done) });
    expect(r).toEqual({ written: 4, deleted: 0, total: 4 });
    expect(progress).toEqual([1, 2, 3, 4]);
    expect((await db.doc("applications/app_1").get()).exists).toBe(true);
    expect(store.getState().companies.co_1?.name).toBe("Shopify");
  });

  it("backs off on resource_exhausted and continues", async () => {
    let failures = 2;
    const { repo, db } = await boot((real) => ({
      ...real,
      doc: (path: string) => {
        const ref = real.doc(path);
        return { ...ref, set: async (body: Record<string, unknown>) => { if (path.startsWith("companies/") && failures-- > 0) throw { code: "resource_exhausted", message: "slow down" }; return ref.set(body); } };
      },
    }) as unknown as DB);
    const wait = vi.fn(async () => {});
    const r = await runRestore(repo, planRestore(backup(), { applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, "merge"), { wait });
    expect(r.written).toBe(4);
    expect(wait).toHaveBeenCalledTimes(2);
    expect((await db.doc("companies/co_1").get()).exists).toBe(true);
  });

  it("stops on quota_exceeded and reports how far it got", async () => {
    const { repo } = await boot((real) => ({
      ...real,
      doc: (path: string) => {
        const ref = real.doc(path);
        return { ...ref, set: async (body: Record<string, unknown>) => { if (path.startsWith("applications/")) throw { code: "quota_exceeded", message: "full" }; return ref.set(body); } };
      },
    }) as unknown as DB);
    const r = await runRestore(repo, planRestore(backup(), { applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, "merge"), { wait: async () => {} });
    expect(r).toMatchObject({ written: 3, stopped: "quota_exceeded", total: 4 });
  });

  it("deletes what a replace plan says to delete", async () => {
    const { repo, db, store } = await boot();
    await repo.createCompany({ name: "Old" });
    const oldId = Object.keys(store.getState().companies)[0];
    const r = await runRestore(repo, planRestore(backup(), store.getState(), "replace"), { wait: async () => {} });
    expect(r.deleted).toBe(1);
    expect((await db.doc(`companies/${oldId}`).get()).exists).toBe(false);
  });
});
```

Append to `tests/features/settings.test.tsx`. First change its `open` helper signature to `async function open(hash: string, seed?: (db: …) => Promise<void>, extra: Partial<Capabilities> = {})` and render with `{ ...absentCapabilities(), db: Promise.resolve(db), ...extra }` (import `type Capabilities` from `../../src/capabilities/types`, `createFakeDownloads` from `../../src/capabilities/downloads`, `buildBackup` from `../../src/domain/backup`, `defaultProfile` from defaults, `buildCompany` from factories, `within` from RTL). Then:
```tsx
  it("downloads a backup and a CSV through the downloads capability", async () => {
    const downloads = createFakeDownloads();
    await open("#/settings", async (db) => { await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>); }, { downloads: Promise.resolve(downloads) });
    fireEvent.click(await screen.findByRole("button", { name: "Download backup (JSON)" }));
    await waitFor(() => expect(downloads.saved).toHaveLength(1));
    expect(downloads.saved[0].filename).toMatch(/^job-hunt-hq-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(downloads.saved[0].data)).toMatchObject({ app: "job-hunt-hq", companies: [{ name: "Shopify" }] });
    fireEvent.change(screen.getByLabelText("Collection to export"), { target: { value: "companies" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(downloads.saved).toHaveLength(2));
    expect(downloads.saved[1].filename).toMatch(/^job-hunt-hq-companies-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloads.saved[1].data).toContain("Shopify");
  });

  it("hides the export buttons when downloads are unavailable", async () => {
    await open("#/settings");
    await screen.findByRole("heading", { name: "Backup and restore" });
    expect(screen.queryByRole("button", { name: "Download backup (JSON)" })).toBeNull();
    expect(screen.getByText(/Downloads are not available in this view/)).toBeTruthy();
  });

  it("validates a restore file, shows problems, and merges a valid one", async () => {
    const db = await open("#/settings");
    const input = screen.getByLabelText("Restore from backup") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([JSON.stringify({ app: "other" })], "bad.json", { type: "application/json" })] } });
    expect((await screen.findByRole("alert", { name: "Backup problems" })).textContent).toMatch(/not a Job Hunt HQ backup/);
    const backup = buildBackup({ settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW), applications: {}, companies: { co_imp: buildCompany({ name: "Imported Co" }, "co_imp", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, NOW);
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], "good.json", { type: "application/json" })] } });
    expect(await screen.findByText(/good\.json: 0 applications, 1 companies/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(async () => expect((await db.doc("companies/co_imp").get()).data()?.name).toBe("Imported Co"));
  });

  it("replace mode deletes current records after a typed confirmation", async () => {
    const db = await open("#/settings", async (d) => { await d.doc("companies/co_old").set(buildCompany({ name: "Old" }, "co_old", NOW) as unknown as Record<string, unknown>); });
    const backup = buildBackup({ settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW), applications: {}, companies: { co_imp: buildCompany({ name: "Imported Co" }, "co_imp", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, NOW);
    fireEvent.change(screen.getByLabelText("Restore from backup"), { target: { files: [new File([JSON.stringify(backup)], "good.json", { type: "application/json" })] } });
    await screen.findByText(/good\.json/);
    fireEvent.click(screen.getByRole("radio", { name: "Replace everything" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "REPLACE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(async () => expect((await db.doc("companies/co_old").get()).exists).toBe(false));
    expect((await db.doc("companies/co_imp").get()).exists).toBe(true);
  });
```
(Read `src/ui/Confirm.tsx` to confirm the dialog's role is `alertdialog` and its confirm button uses `confirmLabel`; adjust the query if the role differs, and say so.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/capabilities/downloads.test.ts tests/store/restore.test.ts tests/features/settings.test.tsx` — the first two fail to import; the settings tests fail on the missing "Backup and restore" heading / buttons.

- [ ] **Step 3: Implement**

`src/capabilities/downloads.ts`:
```ts
import { errorCode } from "./errors";
import type { DownloadsLike } from "./types";

/** Viewer copy for a downloads failure; null means the viewer declined and nothing should be shown. */
export function describeDownloadsError(e: unknown): string | null {
  switch (errorCode(e)) {
    case "declined": return null;
    case "rate_limited": return "A download prompt is already open. Answer it, then try again.";
    case "rejected_extension":
    case "extension_not_enabled": return "This file type cannot be saved from this view.";
    case "too_large": return "The file is too large for the destination you chose.";
    case "unavailable":
    case "not_granted":
    case "capability_disabled":
    case "capability_removed": return "Downloads are not available in this view.";
    default: return "Could not save the file. Try again.";
  }
}

/** Offers a text file. True when saved, false when declined; throws an Error carrying viewer copy otherwise. */
export async function saveText(downloads: DownloadsLike, filename: string, text: string): Promise<boolean> {
  try {
    await downloads.save({ filename, data: text });
    return true;
  } catch (e) {
    const message = describeDownloadsError(e);
    if (message === null) return false;
    throw new Error(message);
  }
}

export interface FakeDownloads extends DownloadsLike {
  saved: { filename: string; data: string }[];
}

/** Records saves instead of prompting (tests). */
export function createFakeDownloads(opts: { fail?: { code: string; message: string } } = {}): FakeDownloads {
  const saved: { filename: string; data: string }[] = [];
  const fake = {
    saved,
    async save({ filename, data }: { filename: string; data: unknown }) {
      if (opts.fail) throw opts.fail;
      saved.push({ filename, data: typeof data === "string" ? data : String(data) });
      return { status: "saved" as const };
    },
  };
  return fake as unknown as FakeDownloads;
}
```

`src/store/restore.ts`:
```ts
import type { RestoreStep } from "../domain/backup";
import { RepoError, type Repository } from "./repository";

export interface RestoreProgress { done: number; total: number }
export interface RestoreOptions {
  onProgress?: (p: RestoreProgress) => void;
  /** Injectable for tests; defaults to a real timer. */
  wait?: (ms: number) => Promise<void>;
}
export interface RestoreResult {
  written: number;
  deleted: number;
  total: number;
  stopped?: "quota_exceeded";
}

const MAX_RETRIES = 5;
const realWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function applyStep(repo: Repository, step: RestoreStep): Promise<unknown> {
  switch (step.kind) {
    case "settings": return repo.saveSettings(step.settings);
    case "profile": return repo.saveProfile(step.profile);
    case "delete": return repo.remove(step.collection, step.id);
    case "write": return repo.create(step.collection, step.doc);
  }
}

/** Spec §8: sequential writes with progress; resource_exhausted backs off and continues; quota_exceeded stops and reports. */
export async function runRestore(repo: Repository, steps: RestoreStep[], opts: RestoreOptions = {}): Promise<RestoreResult> {
  const wait = opts.wait ?? realWait;
  const result: RestoreResult = { written: 0, deleted: 0, total: steps.length };
  let done = 0;
  for (const step of steps) {
    for (let attempt = 0; ; attempt++) {
      try {
        await applyStep(repo, step);
        break;
      } catch (e) {
        const code = e instanceof RepoError ? e.code : "";
        if (code === "quota_exceeded") {
          result.stopped = "quota_exceeded";
          return result;
        }
        if (code === "resource_exhausted" && attempt < MAX_RETRIES) {
          await wait(Math.min(8000, 500 * 2 ** attempt));
          continue;
        }
        throw e;
      }
    }
    if (step.kind === "delete") result.deleted++;
    else result.written++;
    done++;
    opts.onProgress?.({ done, total: steps.length });
  }
  return result;
}
```

`src/features/settings/BackupSection.tsx`:
```tsx
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
    const writes = steps.filter((s) => s.kind === "write").length;
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
          <p>{pending.fileName}: {summary(pending.backup)}. Exported {pending.backup.exportedAt.slice(0, 10)}.</p>
          <div className="row" role="radiogroup" aria-label="Restore mode">
            <label className="row"><input type="radio" name="restore-mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge into current data</label>
            <label className="row"><input type="radio" name="restore-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace everything</label>
          </div>
          <p className="muted">Merge writes every record in the file over any current record with the same id. Replace also deletes current records the file does not contain.</p>
          <button type="button" className={mode === "replace" ? "btn danger" : "btn primary"} onClick={() => void restore()} disabled={busy || repo.readOnly}>Restore</button>
          {progress ? <p aria-live="polite">{progress.done} of {progress.total} steps done</p> : null}
        </div>
      ) : null}
    </div>
  );
}
```

`src/features/settings/SettingsPage.tsx`: import `BackupSection` and add, after the Files section:
```tsx
      <div className="section">
        <h2>Backup and restore</h2>
        <BackupSection />
      </div>
```

`src/styles/app.css` (above the mobile block): `.problems { margin: 8px 0; padding-left: 18px; color: var(--danger-text); background: var(--chip-red); border-radius: var(--radius); padding: 8px 8px 8px 26px; }`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/capabilities/downloads.test.ts tests/store/restore.test.ts tests/features/settings.test.tsx`, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/capabilities/downloads.ts src/store/restore.ts src/features/settings/BackupSection.tsx src/features/settings/SettingsPage.tsx src/styles/app.css tests/capabilities/downloads.test.ts tests/store/restore.test.ts tests/features/settings.test.tsx
git commit -m "feat(settings): JSON backup, CSV export, validated merge/replace restore with progress

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Applications — sponsorship and tag filters, column chooser, kanban board

**Files:**
- Modify: `src/domain/applicationFilters.ts`, `src/features/applications/ApplicationsPage.tsx` (rewrite below), `src/styles/app.css`
- Create: `src/domain/kanban.ts`, `src/features/applications/columnPrefs.ts`, `src/features/applications/ColumnChooser.tsx`, `src/features/applications/KanbanBoard.tsx`
- Test: `tests/domain/applicationFilters.test.ts` (append), `tests/domain/kanban.test.ts`, `tests/features/columnPrefs.test.ts`, `tests/features/applications.test.tsx` (append; extend `open` with a `seed` parameter)

**Interfaces:**
- Consumes: `filterApplications`, `priorityScore`, `repo.changeStatus`, `PageProps.query`, `navigate`, `Table`/`Column`, `Chip`/`PickChip`, `useSaver`.
- Produces: `AppFilter` gains `sponsorship: SponsorshipFilter` (`"" | "needs" | "no_need" | "offered" | "not_offered"`) and `tag: string`; `allTags(apps): string[]`; `kanbanColumns(apps, settings, includeClosed): {status, apps}[]`; `COLUMN_LABELS`, `ALL_COLUMN_KEYS`, `LOCKED_COLUMNS`, `loadColumnPrefs()`, `saveColumnPrefs(keys)`; `ColumnChooser({visible, onChange})` (button "Columns", checkboxes "Show <label> column"); `KanbanBoard({apps, includeClosed, selectedId, onOpen})` with one `<section aria-label={status.label}>` per column, draggable cards, and a per-card select "Move <company> · <title> to"; the page's view toggle (buttons "Table view" / "Board view", `?view=board`), and new toolbar selects "Filter by sponsorship" / "Filter by tag".

- [ ] **Step 1: Write the failing tests**

Append to `tests/domain/applicationFilters.test.ts` (reuse its helpers; if it builds apps another way, adapt the builder but keep the assertions):
```ts
  it("filters by sponsorship need/offer and by tag, and lists tags in use", () => {
    const sponsored = [
      buildApplication({ companyId: "co_1", title: "A", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: true, tags: ["remote", "go"] }, "a", NOW),
      buildApplication({ companyId: "co_1", title: "B", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: false, sponsorshipOffered: true, tags: ["go"] }, "b", NOW),
      buildApplication({ companyId: "co_1", title: "C", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "c", NOW),
    ];
    const ctxNone = { companies: {}, settings };
    const ids = (f: Partial<AppFilter>) => filterApplications(sponsored, { ...emptyFilter(), ...f }, ctxNone).map((a) => a.id);
    expect(ids({ sponsorship: "needs" })).toEqual(["a"]);
    expect(ids({ sponsorship: "no_need" })).toEqual(["b"]);
    expect(ids({ sponsorship: "offered" })).toEqual(["b"]);
    expect(ids({ sponsorship: "not_offered" })).toEqual([]);
    expect(ids({ tag: "go" })).toEqual(["a", "b"]);
    expect(allTags(sponsored)).toEqual(["go", "remote"]);
  });
```
(Import `allTags` and `type AppFilter` from `../../src/domain/applicationFilters`; `settings` is `defaultSettings("America/Toronto", NOW)` — reuse the file's constant.)

`tests/domain/kanban.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import { kanbanColumns } from "../../src/domain/kanban";

const NOW = "2026-09-14T00:00:00.000Z";
const settings = defaultSettings("America/Toronto", NOW);
const app = (id: string, statusId: string, extra: Partial<Parameters<typeof buildApplication>[0]> = {}, updatedAt = NOW) =>
  ({ ...buildApplication({ companyId: "co_1", title: id, countryId: "CA", channelId: "linkedin", statusId, ...extra }, id, NOW), updatedAt });

describe("kanbanColumns", () => {
  it("orders open columns by stage, hides closed groups unless asked, and ranks cards by score then recency", () => {
    const apps = [app("low", "saved", { desire: 1, fit: 1, likelihood: 1 }), app("high", "saved", { desire: 5, fit: 5, likelihood: 5 }), app("newer", "saved", {}, "2026-09-15T00:00:00.000Z"), app("older", "saved"), app("won", "accepted"), app("lost", "rejected")];
    const open = kanbanColumns(apps, settings, false);
    expect(open.map((c) => c.status.id)).toEqual(["saved", "preparing", "applied", "screening", "oa", "interviewing", "final", "offer", "negotiating"]);
    expect(open[0].apps.map((a) => a.id)).toEqual(["high", "low", "newer", "older"]);
    const all = kanbanColumns(apps, settings, true);
    expect(all.map((c) => c.status.id).slice(-4)).toEqual(["accepted", "rejected", "withdrawn", "ghosted"]);
    expect(all.find((c) => c.status.id === "rejected")!.apps.map((a) => a.id)).toEqual(["lost"]);
  });

  it("keeps an archived status column only while an application still sits in it", () => {
    const s = { ...settings, pickLists: { ...settings.pickLists, statuses: settings.pickLists.statuses.map((st) => (st.id === "oa" ? { ...st, archived: true } : st)) } };
    expect(kanbanColumns([], s, false).some((c) => c.status.id === "oa")).toBe(false);
    expect(kanbanColumns([app("x", "oa")], s, false).some((c) => c.status.id === "oa")).toBe(true);
  });
});
```

`tests/features/columnPrefs.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ALL_COLUMN_KEYS, loadColumnPrefs, saveColumnPrefs } from "../../src/features/applications/columnPrefs";

describe("column prefs", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to every column, round-trips a choice, and never drops the locked columns", () => {
    expect(loadColumnPrefs()).toEqual(ALL_COLUMN_KEYS);
    saveColumnPrefs(["status", "deadline"]);
    expect(loadColumnPrefs()).toEqual(["company", "title", "status", "deadline"]);
  });
  it("ignores garbage in storage", () => {
    localStorage.setItem("jhq.applications.columns", "{not json");
    expect(loadColumnPrefs()).toEqual(ALL_COLUMN_KEYS);
    localStorage.setItem("jhq.applications.columns", JSON.stringify({ a: 1 }));
    expect(loadColumnPrefs()).toEqual(ALL_COLUMN_KEYS);
  });
});
```

Append to `tests/features/applications.test.tsx`. First extend its `open` helper to `async function open(hash: string, seed?: (db: ReturnType<typeof createFakeDb>) => Promise<void>)` that runs `seed` after writing settings (before render), and import `buildApplication`, `buildCompany` from factories, `within` from RTL, `loadColumnPrefs` from `../../src/features/applications/columnPrefs`. Then:
```tsx
  it("filters by sponsorship and by tag", async () => {
    await open("#/applications", async (db) => {
      await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await db.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "Needs visa", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: true, tags: ["remote"] }, "app_1", NOW) as unknown as Record<string, unknown>);
      await db.doc("applications/app_2").set(buildApplication({ companyId: "co_1", title: "No visa", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: false }, "app_2", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByText("Needs visa");
    fireEvent.change(screen.getByLabelText("Filter by sponsorship"), { target: { value: "needs" } });
    expect(screen.queryByText("No visa")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by sponsorship"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "remote" } });
    expect(screen.getByText("Needs visa")).toBeTruthy();
    expect(screen.queryByText("No visa")).toBeNull();
  });

  it("hides a column from the chooser and remembers the choice", async () => {
    localStorage.clear();
    await open("#/applications");
    expect(screen.getByRole("button", { name: "Channel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Channel column" }));
    expect(screen.queryByRole("button", { name: "Channel" })).toBeNull();
    expect(loadColumnPrefs()).not.toContain("channel");
    expect((screen.getByRole("checkbox", { name: "Show Company column" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("board view groups cards by status and moves them by drop or by the move select", async () => {
    const db = await open("#/applications?view=board", async (d) => {
      await d.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await d.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "Backend", countryId: "CA", channelId: "linkedin", statusId: "saved", maxStageRank: 1 }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    const saved = await screen.findByRole("region", { name: "Saved" });
    expect(within(saved).getByText("Backend")).toBeTruthy();
    fireEvent.drop(screen.getByRole("region", { name: "Applied" }), { dataTransfer: { getData: () => "app_1" } });
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.statusId).toBe("applied"));
    expect(within(screen.getByRole("region", { name: "Applied" })).getByText("Backend")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Move Shopify · Backend to"), { target: { value: "interviewing" } });
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.maxStageRank).toBe(6));
    fireEvent.click(within(screen.getByRole("region", { name: "Interviewing" })).getByText("Backend"));
    expect(window.location.hash).toBe("#/applications/app_1?view=board");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("switches between table and board views from the toolbar", async () => {
    await open("#/applications");
    expect(screen.getByRole("button", { name: "Board view" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Board view" }));
    expect(window.location.hash).toBe("#/applications?view=board");
    expect(await screen.findByRole("region", { name: "Saved" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(window.location.hash).toBe("#/applications");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/applicationFilters.test.ts tests/domain/kanban.test.ts tests/features/columnPrefs.test.ts tests/features/applications.test.tsx` — the domain/prefs files fail to import or on missing fields; the page tests fail on the missing "Filter by sponsorship" label, "Columns" button and regions.

- [ ] **Step 3: Implement**

`src/domain/applicationFilters.ts` — replace the interface, `emptyFilter`, and add the checks and `allTags`:
```ts
export type SponsorshipFilter = "" | "needs" | "no_need" | "offered" | "not_offered";
export interface AppFilter {
  text: string;
  countryId: string;
  statusId: string;
  tier: "" | Tier;
  channelId: string;
  sponsorship: SponsorshipFilter;
  tag: string;
  includeClosed: boolean;
}
export const emptyFilter = (): AppFilter => ({ text: "", countryId: "", statusId: "", tier: "", channelId: "", sponsorship: "", tag: "", includeClosed: false });

function sponsorshipMatches(a: Application, f: SponsorshipFilter): boolean {
  switch (f) {
    case "needs": return a.needsSponsorship === true;
    case "no_need": return a.needsSponsorship === false;
    case "offered": return a.sponsorshipOffered === true;
    case "not_offered": return a.sponsorshipOffered === false;
    default: return true;
  }
}
/** Every tag in use, sorted, for the tag filter. */
export function allTags(apps: Application[]): string[] {
  return [...new Set(apps.flatMap((a) => a.tags))].sort((x, y) => x.localeCompare(y));
}
```
and inside `filterApplications`, after the channel check: `if (!sponsorshipMatches(a, f.sponsorship)) return false; if (f.tag && !a.tags.includes(f.tag)) return false;`.

`src/domain/kanban.ts`:
```ts
import { priorityScore } from "./scoring";
import type { Application, Settings, StatusEntry } from "./types";

export interface KanbanColumn {
  status: StatusEntry;
  apps: Application[];
}
const GROUP_ORDER = { open: 0, won: 1, lost: 2 } as const;

/** One column per status: open statuses by stage (closed groups only when asked), archived ones only while occupied;
 * cards ranked by priority score (unscored last), then most recently updated. */
export function kanbanColumns(apps: Application[], settings: Settings, includeClosed: boolean): KanbanColumn[] {
  const occupied = new Set(apps.map((a) => a.statusId));
  const statuses = settings.pickLists.statuses
    .filter((s) => (s.group === "open" || includeClosed) && (!s.archived || occupied.has(s.id)))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.stageRank - b.stageRank || settings.pickLists.statuses.indexOf(a) - settings.pickLists.statuses.indexOf(b));
  const rank = (a: Application) => priorityScore(a, settings.priorityWeights) ?? -1;
  return statuses.map((status) => ({
    status,
    apps: apps.filter((a) => a.statusId === status.id).sort((x, y) => rank(y) - rank(x) || y.updatedAt.localeCompare(x.updatedAt)),
  }));
}
```

`src/features/applications/columnPrefs.ts`:
```ts
export const COLUMN_LABELS: Record<string, string> = {
  company: "Company", title: "Role", where: "Where", status: "Status", score: "Tier / score", deadline: "Deadline", next: "Next action", channel: "Channel", updated: "Updated",
};
export const ALL_COLUMN_KEYS = Object.keys(COLUMN_LABELS);
export const LOCKED_COLUMNS = ["company", "title"];
const KEY = "jhq.applications.columns";

/** Per-viewer convenience in localStorage; anything unreadable falls back to every column. */
export function loadColumnPrefs(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return ALL_COLUMN_KEYS;
    const chosen: unknown = JSON.parse(raw);
    if (!Array.isArray(chosen)) return ALL_COLUMN_KEYS;
    return ALL_COLUMN_KEYS.filter((k) => LOCKED_COLUMNS.includes(k) || chosen.includes(k));
  } catch {
    return ALL_COLUMN_KEYS;
  }
}
export function saveColumnPrefs(keys: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* private mode or full: the choice just does not persist */
  }
}
```

`src/features/applications/ColumnChooser.tsx`:
```tsx
import { useState } from "react";
import { ALL_COLUMN_KEYS, COLUMN_LABELS, LOCKED_COLUMNS } from "./columnPrefs";

export function ColumnChooser({ visible, onChange }: { visible: string[]; onChange: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (key: string, on: boolean) => onChange(ALL_COLUMN_KEYS.filter((k) => (k === key ? on : visible.includes(k))));
  return (
    <div className="chooser">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Columns</button>
      {open ? (
        <div className="chooser-menu" role="group" aria-label="Visible columns">
          {ALL_COLUMN_KEYS.map((k) => (
            <label key={k} className="row">
              <input type="checkbox" aria-label={`Show ${COLUMN_LABELS[k]} column`} checked={visible.includes(k)} disabled={LOCKED_COLUMNS.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />
              {COLUMN_LABELS[k]}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

`src/features/applications/KanbanBoard.tsx`:
```tsx
import { useState, type DragEvent } from "react";
import { daysUntil, formatForHome, urgency } from "../../domain/dates";
import { kanbanColumns } from "../../domain/kanban";
import type { Application, ColorToken } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip } from "../../ui/Chip";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const URGENCY_COLOR: Record<ReturnType<typeof urgency>, ColorToken> = { overdue: "red", urgent: "red", soon: "amber", later: "gray" };

interface Props {
  apps: Application[];
  includeClosed: boolean;
  selectedId?: string;
  onOpen: (id: string) => void;
}

export function KanbanBoard({ apps, includeClosed, selectedId, onOpen }: Props) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const [over, setOver] = useState<string | null>(null);
  const columns = kanbanColumns(apps, settings, includeClosed);
  const targets = settings.pickLists.statuses.filter((s) => !s.archived);
  const move = (appId: string, statusId: string) => void run(() => repo.changeStatus(appId, statusId));
  const label = (a: Application) => `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}`;
  const onDrop = (e: DragEvent<HTMLElement>, statusId: string) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id && state.applications[id] && state.applications[id].statusId !== statusId) move(id, statusId);
  };
  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end" }}><SaveIndicator status={status} /></div>
      <div className="kanban">
        {columns.map(({ status: s, apps: cards }) => (
          <section key={s.id} className={over === s.id ? "kanban-col over" : "kanban-col"} aria-label={s.label}
            onDragOver={(e) => { e.preventDefault(); if (over !== s.id) setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => onDrop(e, s.id)}>
            <h3 className="kanban-head">{s.label} <span className="muted">{cards.length}</span></h3>
            {cards.map((a) => {
              const deadline = a.deadline ? formatForHome(a.deadline, settings.homeTz) : null;
              return (
                <article key={a.id} className={selectedId === a.id ? "kanban-card selected" : "kanban-card"} draggable={!repo.readOnly} tabIndex={0}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => onOpen(a.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(a.id); }}>
                  <div><strong>{state.companies[a.companyId]?.name ?? "?"}</strong></div>
                  <div>{a.title}</div>
                  <div className="row" style={{ marginTop: 4 }}>
                    {a.tier ? <Chip color="blue">{a.tier}</Chip> : null}
                    {a.deadline && deadline ? <Chip color={URGENCY_COLOR[urgency(daysUntil(a.deadline.at, settings.homeTz))]} title={deadline.source ?? undefined}>{deadline.home}</Chip> : null}
                  </div>
                  <select className="kanban-move" aria-label={`Move ${label(a)} to`} value={a.statusId} disabled={repo.readOnly}
                    onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => move(a.id, e.target.value)}>
                    {targets.concat(targets.some((t) => t.id === a.statusId) ? [] : settings.pickLists.statuses.filter((t) => t.id === a.statusId)).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </article>
              );
            })}
            {cards.length === 0 ? <p className="muted kanban-empty">Drop here</p> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
```

`src/features/applications/ApplicationsPage.tsx` — full replacement:
```tsx
import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { allTags, emptyFilter, filterApplications, type AppFilter, type SponsorshipFilter } from "../../domain/applicationFilters";
import { daysUntil, formatForHome, isPastDate, urgency, type Urgency } from "../../domain/dates";
import { priorityScore } from "../../domain/scoring";
import type { Application, ColorToken } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column, SortDir } from "../../ui/sortRows";
import { ApplicationDetail } from "./ApplicationDetail";
import { ColumnChooser } from "./ColumnChooser";
import { loadColumnPrefs, saveColumnPrefs } from "./columnPrefs";
import { KanbanBoard } from "./KanbanBoard";
import { QuickAdd } from "./QuickAdd";

const URGENCY_COLOR: Record<Urgency, ColorToken> = { overdue: "red", urgent: "red", soon: "amber", later: "gray" };
const SPONSORSHIP_OPTIONS: { value: SponsorshipFilter; label: string }[] = [
  { value: "", label: "Any" }, { value: "needs", label: "Needs sponsorship" }, { value: "no_need", label: "No sponsorship needed" }, { value: "offered", label: "Sponsorship offered" }, { value: "not_offered", label: "Sponsorship not offered" },
];

export function ApplicationsPage({ parts, query }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const [filter, setFilter] = useState<AppFilter>(emptyFilter());
  const [sortKey, setSortKey] = useState("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [adding, setAdding] = useState(false);
  const [visible, setVisible] = useState<string[]>(loadColumnPrefs);
  const pl = settings.pickLists;
  const tz = settings.homeTz;
  const view = query.get("view") === "board" ? "board" : "table";
  const viewQuery = view === "board" ? "?view=board" : "";

  const rows = useMemo(
    () => filterApplications(Object.values(state.applications), filter, { companies: state.companies, settings }),
    [state.applications, state.companies, settings, filter],
  );
  const tags = useMemo(() => allTags(Object.values(state.applications)), [state.applications]);

  const columns: Column<Application>[] = [
    { key: "company", header: "Company", render: (a) => <strong>{state.companies[a.companyId]?.name ?? "?"}</strong>, sortValue: (a) => state.companies[a.companyId]?.name ?? null },
    { key: "title", header: "Role", render: (a) => <>{a.title}{a.reqId ? <span className="muted"> · {a.reqId}</span> : null}</>, sortValue: (a) => a.title },
    {
      key: "where", header: "Where",
      render: (a) => (
        <>
          {pl.countries.find((c) => c.id === a.countryId)?.label ?? a.countryId}
          {a.city ? ` · ${a.city}` : ""}
          {a.workModeId ? <span className="muted"> · {pl.workModes.find((w) => w.id === a.workModeId)?.label}</span> : null}
        </>
      ),
      sortValue: (a) => `${a.countryId} ${a.city ?? ""}`,
    },
    { key: "status", header: "Status", render: (a) => <PickChip list={pl.statuses} id={a.statusId} />, sortValue: (a) => pl.statuses.find((s) => s.id === a.statusId)?.stageRank ?? null },
    {
      key: "score", header: "Tier / score",
      render: (a) => <>{a.tier ?? <span className="muted">—</span>} <span className="muted">{priorityScore(a, settings.priorityWeights) ?? ""}</span></>,
      sortValue: (a) => priorityScore(a, settings.priorityWeights),
    },
    {
      key: "deadline", header: "Deadline",
      render: (a) => {
        if (!a.deadline) return <span className="muted">—</span>;
        const f = formatForHome(a.deadline, tz);
        const u = urgency(daysUntil(a.deadline.at, tz));
        return <Chip color={URGENCY_COLOR[u]} title={f.source ?? undefined}>{f.home}</Chip>;
      },
      sortValue: (a) => a.deadline?.at ?? null,
    },
    {
      key: "next", header: "Next action",
      render: (a) => a.nextAction ? (
        <>{a.nextAction}{a.nextActionDue ? <span className={isPastDate(a.nextActionDue, tz) ? "chip chip-red" : "muted"}> {a.nextActionDue}</span> : null}</>
      ) : <span className="muted">—</span>,
      sortValue: (a) => a.nextActionDue ?? null,
    },
    { key: "channel", header: "Channel", render: (a) => <PickChip list={pl.channels} id={a.channelId} />, sortValue: (a) => a.channelId },
    { key: "updated", header: "Updated", render: (a) => DateTime.fromISO(a.updatedAt).setZone(tz).toFormat("yyyy-MM-dd"), sortValue: (a) => a.updatedAt },
  ];
  const shownColumns = columns.filter((c) => visible.includes(c.key));

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const set = (p: Partial<AppFilter>) => setFilter({ ...filter, ...p });
  const chooseColumns = (keys: string[]) => { setVisible(keys); saveColumnPrefs(keys); };
  const openDetail = (id: string) => navigate(`/applications/${id}${viewQuery}`);

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Applications</h1>
        <div className="row">
          <div className="row" role="group" aria-label="View">
            <button type="button" className={view === "table" ? "btn primary" : "btn"} aria-pressed={view === "table"} onClick={() => navigate("/applications")}>Table view</button>
            <button type="button" className={view === "board" ? "btn primary" : "btn"} aria-pressed={view === "board"} onClick={() => navigate("/applications?view=board")}>Board view</button>
          </div>
          {view === "table" ? <ColumnChooser visible={visible} onChange={chooseColumns} /> : null}
          <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={repo.readOnly}>New application</button>
        </div>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Company, title, city, tag" /></label>
        <label className="field"><span className="field-label">Filter by country</span>
          <select aria-label="Filter by country" value={filter.countryId} onChange={(e) => set({ countryId: e.target.value })}>
            <option value="">All</option>{pl.countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by status</span>
          <select aria-label="Filter by status" value={filter.statusId} onChange={(e) => set({ statusId: e.target.value })}>
            <option value="">All open</option>{pl.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by tier</span>
          <select aria-label="Filter by tier" value={filter.tier} onChange={(e) => set({ tier: e.target.value as AppFilter["tier"] })}>
            <option value="">Any</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by channel</span>
          <select aria-label="Filter by channel" value={filter.channelId} onChange={(e) => set({ channelId: e.target.value })}>
            <option value="">Any</option>{pl.channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by sponsorship</span>
          <select aria-label="Filter by sponsorship" value={filter.sponsorship} onChange={(e) => set({ sponsorship: e.target.value as SponsorshipFilter })}>
            {SPONSORSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Filter by tag</span>
          <select aria-label="Filter by tag" value={filter.tag} onChange={(e) => set({ tag: e.target.value })}>
            <option value="">Any</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={filter.includeClosed} onChange={(e) => set({ includeClosed: e.target.checked })} /> Include closed</label>
        <span className="muted">{rows.length} shown</span>
      </div>
      {view === "board" ? (
        <KanbanBoard apps={rows} includeClosed={filter.includeClosed || !!filter.statusId} selectedId={parts[0]} onOpen={openDetail} />
      ) : (
        <Table rows={rows} columns={shownColumns} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          onRowClick={(a) => openDetail(a.id)} selectedId={parts[0]}
          emptyText='No applications match. Add one with "New application".' />
      )}
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
      {parts[0] ? <ApplicationDetail id={parts[0]} onClose={() => navigate(`/applications${viewQuery}`)} /> : null}
    </section>
  );
}
```

`src/styles/app.css` (above the mobile block):
```css
/* applications: board and column chooser */
.chooser { position: relative; }
.chooser-menu { position: absolute; right: 0; z-index: 20; margin-top: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; box-shadow: var(--shadow); display: grid; gap: 4px; min-width: 200px; }
.kanban { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; align-items: flex-start; }
.kanban-col { flex: 0 0 230px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; min-height: 120px; }
.kanban-col.over { outline: 2px dashed var(--accent); outline-offset: -2px; }
.kanban-head { margin: 0 0 8px; font-size: 14px; }
.kanban-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; margin-bottom: 8px; cursor: grab; }
.kanban-card.selected { border-color: var(--accent); }
.kanban-card:focus-visible { outline: 2px solid var(--accent); }
.kanban-move { margin-top: 6px; font-size: 12px; padding: 4px 6px; }
.kanban-empty { font-size: 12px; text-align: center; margin: 12px 0; }
```
Inside the final mobile block: `.kanban-col { flex-basis: 82vw; }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/applicationFilters.test.ts tests/domain/kanban.test.ts tests/features/columnPrefs.test.ts tests/features/applications.test.tsx tests/features/applicationDetail.test.tsx tests/features/applicationLinks.test.tsx`, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/applicationFilters.ts src/domain/kanban.ts src/features/applications/ApplicationsPage.tsx src/features/applications/columnPrefs.ts src/features/applications/ColumnChooser.tsx src/features/applications/KanbanBoard.tsx src/styles/app.css tests/domain/applicationFilters.test.ts tests/domain/kanban.test.ts tests/features/columnPrefs.test.ts tests/features/applications.test.tsx
git commit -m "feat(applications): sponsorship and tag filters, column chooser, kanban board with drag and keyboard moves

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Global search

**Files:**
- Create: `src/features/search/SearchPage.tsx`
- Modify: `src/app/Shell.tsx` (search form above the page), `src/app/routes.tsx` (`PAGES.search`), `src/styles/app.css` (`.topbar`, `.search-results`)
- Test: `tests/features/search.test.tsx`

**Interfaces:**
- Consumes: Task 3 `searchAll`, `navigate`, `useRoute`, `PageProps.query`.
- Produces: `SearchPage` at `#/search?q=<query>` (heading "Search results", grouped lists with headings "Companies", "Applications", "Contacts", "Answers", empty state "No matches for “<q>”."); Shell gets `<form role="search">` with input "Search everything" that navigates to the search route on submit (Enter). The search form is NOT a nav item (no `aria-current`).

- [ ] **Step 1: Write the failing test**

`tests/features/search.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication, buildCompany, buildContact } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW));
  await put(db, "contacts/ct_1", buildContact({ name: "Dana Shop", relationshipId: "recruiter", companyId: "co_1" }, "ct_1", NOW));
  await put(db, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why Shopify" }, "an_1", NOW));
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  return db;
}

describe("Global search", () => {
  it("submits the search box to the results route and lists grouped hits with links", async () => {
    await open("#/applications");
    await screen.findByRole("heading", { name: "Applications" });
    const box = screen.getByRole("searchbox", { name: "Search everything" });
    fireEvent.change(box, { target: { value: "shop" } });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(window.location.hash).toBe("#/search?q=shop");
    await screen.findByRole("heading", { name: "Search results" });
    expect(within(screen.getByRole("region", { name: "Companies" })).getByRole("link", { name: "Shopify" }).getAttribute("href")).toBe("#/companies/co_1");
    expect(within(screen.getByRole("region", { name: "Applications" })).getByRole("link", { name: /Backend Engineer/ }).getAttribute("href")).toBe("#/applications/app_1");
    expect(within(screen.getByRole("region", { name: "Contacts" })).getByRole("link", { name: "Dana Shop" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Answers" })).getByRole("link", { name: "Why Shopify" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Applications" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows an empty state and keeps the query in the box when nothing matches", async () => {
    await open("#/search?q=zzz");
    await screen.findByRole("heading", { name: "Search results" });
    expect(screen.getByText("No matches for “zzz”.")).toBeTruthy();
    expect((screen.getByRole("searchbox", { name: "Search everything" }) as HTMLInputElement).value).toBe("zzz");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/features/search.test.tsx` — fails: no element with role `searchbox`.

- [ ] **Step 3: Implement**

`src/features/search/SearchPage.tsx`:
```tsx
import type { PageProps } from "../../app/routes";
import { searchAll, type SearchHit, type SearchKind } from "../../domain/search";
import { useAppState } from "../../store/context";

const GROUPS: { kind: SearchKind; label: string }[] = [
  { kind: "company", label: "Companies" }, { kind: "application", label: "Applications" }, { kind: "contact", label: "Contacts" }, { kind: "answer", label: "Answers" },
];

export function SearchPage({ query }: PageProps) {
  const state = useAppState();
  const q = (query.get("q") ?? "").trim();
  const hits = searchAll(state, q);
  const grouped = new Map<SearchKind, SearchHit[]>();
  for (const h of hits) grouped.set(h.kind, [...(grouped.get(h.kind) ?? []), h]);
  return (
    <section>
      <h1>Search results</h1>
      {!q ? <p className="muted">Type in the search box above to find companies, applications, contacts and answers.</p>
        : hits.length === 0 ? <p className="muted">No matches for “{q}”.</p>
        : GROUPS.filter((g) => grouped.has(g.kind)).map((g) => (
          <section key={g.kind} className="section search-results" aria-labelledby={`search-${g.kind}`}>
            <h2 id={`search-${g.kind}`}>{g.label}</h2>
            <ul>
              {grouped.get(g.kind)!.map((h) => (
                <li key={h.id}><a href={h.href}>{h.title}</a>{h.subtitle ? <span className="muted"> · {h.subtitle}</span> : null}</li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  );
}
```

`src/app/routes.tsx`: import `SearchPage` from `../features/search/SearchPage` and add `search: SearchPage` to `PAGES` (NAV unchanged).

`src/app/Shell.tsx`: add a search form at the top of `<main>`. Keep the existing nav; the page key lookup stays `route.parts[0] ?? ""`:
```tsx
import { useEffect, useState } from "react";
import { useAppState } from "../store/context";
import { navigate, useRoute } from "./router";
import { NAV, PAGES } from "./routes";

export function Shell() {
  const state = useAppState();
  const route = useRoute();
  const key = route.parts[0] ?? "";
  const Page = PAGES[key];
  const routeQuery = key === "search" ? (route.query.get("q") ?? "") : "";
  const [q, setQ] = useState(routeQuery);
  useEffect(() => { if (key === "search") setQ(routeQuery); }, [key, routeQuery]);
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">Job Hunt HQ</div>
        {NAV.map((n) => (
          <a key={n.key} href={`#${n.to}`} className={key === n.key ? "nav-item active" : "nav-item"} aria-current={key === n.key ? "page" : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <main className="main">
        <div className="topbar">
          <form role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <input type="search" aria-label="Search everything" placeholder="Search companies, roles, contacts, answers" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>
        {state.readOnly && (
          <div className="banner banner-warn" role="alert">
            Storage is unavailable in this view. You can browse, but changes will not be saved.
          </div>
        )}
        {!state.ready ? (
          <div className="boot">Connecting to storage…</div>
        ) : Page ? (
          <Page parts={route.parts.slice(1)} query={route.query} />
        ) : (
          <div className="empty">
            <h2>Nothing at {route.path}</h2>
            <a href="#/">Go to the dashboard</a>
          </div>
        )}
      </main>
    </div>
  );
}
```

`src/styles/app.css` (above the mobile block): `.topbar { display: flex; justify-content: flex-end; margin-bottom: 8px; } .topbar input { max-width: 340px; } .search-results ul { margin: 0; padding-left: 18px; } .search-results li { padding: 3px 0; }`. Inside the mobile block: `.topbar input { max-width: none; }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/features/search.test.tsx tests/app`, then the full suite and `npm run typecheck`. (`tests/app/App.test.tsx` queries `getByRole("link", { name: "Applications" })` — still unique because the search form contains no links.)

- [ ] **Step 5: Commit**

```bash
git add src/features/search/SearchPage.tsx src/app/Shell.tsx src/app/routes.tsx src/styles/app.css tests/features/search.test.tsx
git commit -m "feat(search): global search box and grouped results page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: AI assist foundation — fake sample, prompt builders, error policy, streaming hook

**Files:**
- Create: `src/capabilities/fakeSample.ts`, `src/capabilities/ai.ts`, `src/features/ai/useSample.ts`
- Modify: `src/capabilities/resolve.ts` (dev branch: fake sample with a canned reply)
- Test: `tests/capabilities/fakeSample.test.ts`, `tests/capabilities/ai.test.ts`, `tests/features/useSample.test.tsx`, `tests/capabilities/resolve.test.ts` (update the dev expectation)

**Interfaces:**
- Consumes: `SampleLike = typeof Claude.sample` (callable + `.json` + `.limits`), `Profile`, `Answer`.
- Produces:
  - `createFakeSample({ reply?: (input) => string, json?: (input) => unknown, error?: {code, message, text?}, chunks?: number }) → SampleLike & { calls: {input, options}[] }` — streams `reply` in `chunks` pieces through `onText` (each with whole `text` + `delta`), resolves `{text, truncated: false, modelTierApplied: "default"}`, honours `signal` (rejects `{code: "cancelled", text}`), rejects with `error` when given (after streaming half the reply when `error.text` is set).
  - `ai.ts`: `DraftInput {question, company, role, jobDescription?, sources: {title, body}[], profileSummary?, language: "en" | "ko", length: "short" | "medium" | "long"}`, `buildDraftPrompt(input): string`, `buildRequirementsPrompt(jobDescription): string`, `profileSummary(profile): string` (employment summaries + links only), `Requirements {must: string[]; nice: string[]}`, `parseRequirements(value: unknown): Requirements | null`, `sampleErrorOf(e): {code: string; message: string; text?: string}`, `classifySampleError(code): "hidden" | "retry_later" | "quiet" | "message"`, `describeSampleError(code): string`, `RATE_LIMIT_MS = 30000`, `MAX_JD_CHARS = 6000`, `MAX_SOURCE_CHARS = 1500`.
  - `useSample(sample: SampleLike | null | undefined) → { available, phase: "idle" | "thinking" | "streaming" | "done" | "error", text, setText, error, truncated, disabledUntil, run(input, options?), runJson<T>(input, options?): Promise<T | null>, stop(), reset() }` — `available` false while pending/null or after a hide-class error; `disabledUntil` a timestamp after `rate_limited`.

- [ ] **Step 1: Write the failing tests**

`tests/capabilities/fakeSample.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeSample } from "../../src/capabilities/fakeSample";

describe("createFakeSample", () => {
  it("streams the reply in growing text updates and resolves with the whole text", async () => {
    const sample = createFakeSample({ reply: () => "one two three four", chunks: 4 });
    const seen: string[] = [];
    const r = await sample("hi", { onText: ({ text, delta }) => { expect(text.endsWith(delta)).toBe(true); seen.push(text); } });
    expect(r).toEqual({ text: "one two three four", truncated: false, modelTierApplied: "default" });
    expect(seen.length).toBe(4);
    expect(seen[seen.length - 1]).toBe("one two three four");
    expect(sample.calls[0].input).toBe("hi");
  });

  it("parses json and rejects with the configured error keeping partial text", async () => {
    const ok = createFakeSample({ json: () => ({ must: ["Go"], nice: [] }) });
    expect(await ok.json("x")).toEqual({ must: ["Go"], nice: [] });
    const failing = createFakeSample({ reply: () => "partial answer here", error: { code: "upstream_error", message: "boom", text: "partial" } });
    await expect(failing("x")).rejects.toMatchObject({ code: "upstream_error", text: "partial" });
  });

  it("cancels through the signal", async () => {
    const sample = createFakeSample({ reply: () => "a b c d e f", chunks: 6 });
    const ctl = new AbortController();
    const p = sample("x", { signal: ctl.signal, onText: ({ text }) => { if (text.length >= 3) ctl.abort(); } });
    await expect(p).rejects.toMatchObject({ code: "cancelled" });
  });
});
```

`tests/capabilities/ai.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDraftPrompt, buildRequirementsPrompt, classifySampleError, describeSampleError, parseRequirements, profileSummary, sampleErrorOf, MAX_JD_CHARS } from "../../src/capabilities/ai";
import { defaultProfile } from "../../src/domain/defaults";

describe("ai prompts", () => {
  it("assembles the draft prompt from question, role, JD, ticked sources, profile summary, language and length", () => {
    const p = buildDraftPrompt({
      question: "Why Shopify?", company: "Shopify", role: "Backend Engineer", jobDescription: "We build commerce.", language: "ko", length: "short",
      sources: [{ title: "STAR: outage", body: "Situation…" }], profileSummary: "Backend at Kakao (2021–2024).",
    });
    expect(p).toContain("Why Shopify?");
    expect(p).toContain("Backend Engineer at Shopify");
    expect(p).toContain("We build commerce.");
    expect(p).toContain("STAR: outage");
    expect(p).toContain("Backend at Kakao");
    expect(p).toMatch(/Korean/);
    expect(p).toMatch(/about 120 words/);
    expect(p.indexOf("Why Shopify?")).toBeGreaterThan(p.indexOf("You are helping"));
  });

  it("truncates a long job description and marks the cut", () => {
    const p = buildDraftPrompt({ question: "q", company: "c", role: "r", jobDescription: "x".repeat(MAX_JD_CHARS + 500), sources: [], language: "en", length: "medium" });
    expect(p).toContain("[truncated]");
    expect(p.length).toBeLessThan(MAX_JD_CHARS + 2000);
  });

  it("asks for strict JSON in the requirements prompt and parses tolerant shapes", () => {
    expect(buildRequirementsPrompt("Need Go and gRPC")).toMatch(/only a JSON object/);
    expect(parseRequirements({ must: ["Go", 3, " gRPC "], nice: "not a list" })).toEqual({ must: ["Go", "gRPC"], nice: [] });
    expect(parseRequirements({ must: [] })).toEqual({ must: [], nice: [] });
    expect(parseRequirements("nope")).toBeNull();
  });

  it("summarizes the profile from employment and links only", () => {
    const profile = { ...defaultProfile("2026-09-14T00:00:00.000Z"), email: "secret@example.com", sensitiveNote: "passport in the drawer",
      employment: [{ company: "Kakao", title: "Backend Engineer", start: "2021-03", end: "2024-06", summary: "Payments platform." }],
      links: [{ label: "GitHub", url: "https://github.com/x" }] };
    const s = profileSummary(profile);
    expect(s).toContain("Backend Engineer at Kakao (2021-03–2024-06): Payments platform.");
    expect(s).toContain("GitHub: https://github.com/x");
    expect(s).not.toContain("secret@example.com");
    expect(s).not.toContain("passport");
  });

  it("classifies error codes per spec §6 and normalizes unknown shapes", () => {
    expect(classifySampleError("not_granted")).toBe("hidden");
    expect(classifySampleError("sampling_disabled")).toBe("hidden");
    expect(classifySampleError("rate_limited")).toBe("retry_later");
    expect(classifySampleError("cancelled")).toBe("quiet");
    expect(classifySampleError("refused")).toBe("message");
    expect(classifySampleError("whatever")).toBe("message");
    expect(describeSampleError("refused")).toMatch(/declined/i);
    expect(describeSampleError("empty_completion")).toMatch(/nothing/i);
    expect(sampleErrorOf({ code: "refused", message: "m" })).toEqual({ code: "refused", message: "m" });
    expect(sampleErrorOf(new Error("x"))).toMatchObject({ code: "upstream_error" });
  });
});
```

`tests/features/useSample.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createFakeSample } from "../../src/capabilities/fakeSample";
import { useSample } from "../../src/features/ai/useSample";

describe("useSample", () => {
  it("is unavailable while pending or absent", () => {
    expect(renderHook(() => useSample(undefined)).result.current.available).toBe(false);
    expect(renderHook(() => useSample(null)).result.current.available).toBe(false);
  });

  it("streams text into state and ends in done", async () => {
    const sample = createFakeSample({ reply: () => "hello world", chunks: 2 });
    const { result } = renderHook(() => useSample(sample));
    expect(result.current.available).toBe(true);
    await act(async () => { await result.current.run("draft"); });
    expect(result.current.phase).toBe("done");
    expect(result.current.text).toBe("hello world");
  });

  it("keeps partial text and shows a message on a failure, hides after a hide-class error, and disables after rate limiting", async () => {
    const failing = createFakeSample({ reply: () => "partial answer", error: { code: "upstream_error", message: "x", text: "partial" } });
    const h1 = renderHook(() => useSample(failing));
    await act(async () => { await h1.result.current.run("q"); });
    expect(h1.result.current.phase).toBe("error");
    expect(h1.result.current.text).toBe("partial");
    expect(h1.result.current.error).toMatch(/interrupted/i);

    const denied = createFakeSample({ error: { code: "not_granted", message: "" } });
    const h2 = renderHook(() => useSample(denied));
    await act(async () => { await h2.result.current.run("q"); });
    expect(h2.result.current.available).toBe(false);

    const limited = createFakeSample({ error: { code: "rate_limited", message: "" } });
    const h3 = renderHook(() => useSample(limited));
    await act(async () => { await h3.result.current.run("q"); });
    expect(h3.result.current.disabledUntil).toBeGreaterThan(Date.now());
    expect(h3.result.current.error).toMatch(/30 seconds/);
  });

  it("stop() cancels quietly and runJson returns parsed data or null", async () => {
    const slow = createFakeSample({ reply: () => "a b c d e f g h", chunks: 8 });
    const { result } = renderHook(() => useSample(slow));
    let p: Promise<unknown> = Promise.resolve();
    act(() => { p = result.current.run("q"); });
    await waitFor(() => expect(result.current.phase).toBe("streaming"));
    act(() => result.current.stop());
    await act(async () => { await p; });
    expect(result.current.phase).toBe("idle");
    expect(result.current.error).toBeNull();

    const json = createFakeSample({ json: () => ({ must: ["Go"], nice: [] }) });
    const j = renderHook(() => useSample(json));
    let data: unknown;
    await act(async () => { data = await j.result.current.runJson("q"); });
    expect(data).toEqual({ must: ["Go"], nice: [] });
    const bad = createFakeSample({ error: { code: "invalid_json", message: "", text: "not json" } });
    const b = renderHook(() => useSample(bad));
    let none: unknown = "unset";
    await act(async () => { none = await b.result.current.runJson("q"); });
    expect(none).toBeNull();
    expect(b.result.current.error).toMatch(/could not read/i);
  });
});
```

Update `tests/capabilities/resolve.test.ts`: the dev-fallback test's `expect(await caps.sample).toBeNull()` becomes `expect(typeof (await caps.sample)).toBe("function")` (the `window.claude` test keeps `toBeNull()` because its stub returns null for non-db names).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/capabilities/fakeSample.test.ts tests/capabilities/ai.test.ts tests/features/useSample.test.tsx tests/capabilities/resolve.test.ts` — the three new files fail to import; the resolve test fails on the dev fallback expectation.

- [ ] **Step 3: Implement**

`src/capabilities/fakeSample.ts`:
```ts
import type { SampleLike } from "./types";

type Input = Claude.sample.SampleInput;
type Options = Claude.sample.SampleOptions;
interface FakeError { code: string; message: string; text?: string }
export interface FakeSampleOptions {
  reply?: (input: Input) => string;
  json?: (input: Input) => unknown;
  error?: FakeError;
  /** How many onText updates a reply is split into (default 3). */
  chunks?: number;
}
export type FakeSample = SampleLike & { calls: { input: Input; options?: Options }[] };

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** In-memory stand-in for the platform `sample` capability: streams a canned reply, honours `signal`, fails on demand. */
export function createFakeSample(opts: FakeSampleOptions = {}): FakeSample {
  const calls: { input: Input; options?: Options }[] = [];
  const reply = opts.reply ?? ((input) => `(fake) ${typeof input === "string" ? input.slice(0, 40) : "chat"}`);
  const chunks = Math.max(1, opts.chunks ?? 3);

  async function stream(input: Input, options?: Options): Promise<string> {
    calls.push({ input, options });
    const full = reply(input);
    const size = Math.max(1, Math.ceil(full.length / chunks));
    const stopAt = opts.error?.text != null ? Math.ceil(full.length / 2) : full.length;
    let text = "";
    while (text.length < stopAt) {
      await tick();
      if (options?.signal?.aborted) throw { code: "cancelled", message: "aborted", ...(text ? { text } : {}) };
      const delta = full.slice(text.length, Math.min(stopAt, text.length + size));
      text += delta;
      options?.onText?.({ text, delta });
    }
    if (opts.error) throw { ...opts.error, ...(opts.error.text != null ? { text: opts.error.text } : {}) };
    return text;
  }

  const fn = async (input: Input, options?: Options) => ({ text: await stream(input, options), truncated: false, modelTierApplied: "default" as const });
  const withMembers = Object.assign(fn, {
    calls,
    json: async <T = unknown>(input: Input, options?: Options): Promise<T> => {
      if (opts.error) { calls.push({ input, options }); throw opts.error; }
      if (opts.json) { calls.push({ input, options }); return opts.json(input) as T; }
      return JSON.parse(await stream(input, options)) as T;
    },
    limits: async () => ({ maxPromptBytes: 65536 }),
  });
  return withMembers as unknown as FakeSample;
}
```

`src/capabilities/ai.ts`:
```ts
import type { Profile } from "../domain/types";
import { errorCode } from "./errors";

export const MAX_JD_CHARS = 6000;
export const MAX_SOURCE_CHARS = 1500;
export const RATE_LIMIT_MS = 30000;

export interface DraftInput {
  question: string;
  company: string;
  role: string;
  jobDescription?: string;
  sources: { title: string; body: string }[];
  profileSummary?: string;
  language: "en" | "ko";
  length: "short" | "medium" | "long";
}
export interface Requirements { must: string[]; nice: string[] }
export interface SampleFailure { code: string; message: string; text?: string }
export type SampleOutcome = "hidden" | "retry_later" | "quiet" | "message";

const WORDS: Record<DraftInput["length"], number> = { short: 120, medium: 250, long: 450 };
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n[truncated]` : s);

/** Spec §6: question, JD, company/role, ticked sources, optional profile summary, language, length. Never contact details. */
export function buildDraftPrompt(i: DraftInput): string {
  const lines: string[] = [
    "You are helping a job seeker write their own answer to an application or interview question. Write in the first person, in their voice, using ONLY the facts in the sources and profile below; never invent employers, dates or numbers. Reply with the answer text only, no preamble.",
    `Language: ${i.language === "ko" ? "Korean (존댓말, natural business tone)" : "English"}. Length: about ${WORDS[i.length]} words.`,
    `Target: ${i.role} at ${i.company}.`,
    `Question: ${i.question.trim()}`,
  ];
  if (i.jobDescription?.trim()) lines.push(`Job description:\n${clip(i.jobDescription.trim(), MAX_JD_CHARS)}`);
  if (i.sources.length) lines.push("Sources from the job seeker's answer bank:", ...i.sources.map((s, n) => `--- Source ${n + 1}: ${s.title}\n${clip(s.body.trim(), MAX_SOURCE_CHARS)}`));
  if (i.profileSummary?.trim()) lines.push(`Background summary:\n${i.profileSummary.trim()}`);
  return lines.join("\n\n");
}

export function buildRequirementsPrompt(jobDescription: string): string {
  return [
    'Extract the hiring requirements from the job description below. Reply with only a JSON object of the shape {"must": string[], "nice": string[]} — "must" holds hard requirements, "nice" holds preferred ones; each entry is one short phrase. Example: {"must": ["5+ years backend", "Go"], "nice": ["gRPC"]}.',
    `Job description:\n${clip(jobDescription.trim(), MAX_JD_CHARS)}`,
  ].join("\n\n");
}

/** Employment summaries and links only — never email, phones, addresses or the sensitive note. */
export function profileSummary(profile: Profile): string {
  const jobs = profile.employment.map((e) => `${e.title} at ${e.company} (${e.start}–${e.end || "present"})${e.summary ? `: ${e.summary}` : ""}`);
  const links = profile.links.filter((l) => /^https?:\/\//i.test(l.url)).map((l) => `${l.label}: ${l.url}`);
  return [...jobs, ...links].join("\n");
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : []);
export function parseRequirements(value: unknown): Requirements | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!("must" in v) && !("nice" in v)) return null;
  return { must: strings(v.must), nice: strings(v.nice) };
}

export function sampleErrorOf(e: unknown): SampleFailure {
  const code = errorCode(e);
  if (code) {
    const o = e as { message?: unknown; text?: unknown };
    return { code, message: typeof o.message === "string" ? o.message : "", ...(typeof o.text === "string" ? { text: o.text } : {}) };
  }
  return { code: "upstream_error", message: e instanceof Error ? e.message : String(e) };
}

export function classifySampleError(code: string): SampleOutcome {
  switch (code) {
    case "not_granted": case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed": return "hidden";
    case "rate_limited": return "retry_later";
    case "cancelled": return "quiet";
    default: return "message";
  }
}

export function describeSampleError(code: string): string {
  switch (code) {
    case "rate_limited": return "Claude is busy or you have hit your usage limit. Try again in 30 seconds.";
    case "refused": return "Claude declined this request. Change the question or the sources and try again.";
    case "empty_completion": return "Claude returned nothing. Simplify the request and try again.";
    case "prompt_too_large": return "Too much text for one request. Shorten the job description or tick fewer sources.";
    case "invalid_json": return "Claude's reply could not be read as a list. Try again.";
    case "session_expired": return "Your Claude session expired. Sign in again, then retry.";
    case "invalid_request": case "transform_error": return "The request was malformed. Reload the page and try again.";
    default: return "The connection to Claude was interrupted. What arrived is kept; try again.";
  }
}
```

`src/features/ai/useSample.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { classifySampleError, describeSampleError, RATE_LIMIT_MS, sampleErrorOf } from "../../capabilities/ai";
import type { SampleLike } from "../../capabilities/types";

export type SamplePhase = "idle" | "thinking" | "streaming" | "done" | "error";
type Options = Omit<Claude.sample.SampleOptions, "onText" | "signal">;

/** One in-flight call at a time, one AbortController per call, spec §6 error policy. */
export function useSample(sample: SampleLike | null | undefined) {
  const [phase, setPhase] = useState<SamplePhase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [disabledUntil, setDisabledUntil] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; ctl.current?.abort(); }, []);

  const fail = useCallback((e: unknown) => {
    const err = sampleErrorOf(e);
    if (!live.current) return;
    if (err.text) setText(err.text);
    switch (classifySampleError(err.code)) {
      case "hidden": setHidden(true); setPhase("idle"); setError(null); break;
      case "quiet": setPhase("idle"); setError(null); break;
      case "retry_later": setDisabledUntil(Date.now() + RATE_LIMIT_MS); setPhase("error"); setError(describeSampleError(err.code)); break;
      default: setPhase("error"); setError(describeSampleError(err.code));
    }
  }, []);

  const start = useCallback(() => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setPhase("thinking");
    setError(null);
    setTruncated(false);
    setText("");
    return c;
  }, []);

  const run = useCallback(async (input: Claude.sample.SampleInput, options: Options = {}): Promise<boolean> => {
    if (!sample) return false;
    const c = start();
    try {
      const r = await sample(input, { ...options, signal: c.signal, onText: ({ text: t }) => { if (live.current && ctl.current === c) { setPhase("streaming"); setText(t); } } });
      if (!live.current || ctl.current !== c) return false;
      setText(r.text);
      setTruncated(r.truncated);
      setPhase("done");
      return true;
    } catch (e) {
      if (ctl.current === c) fail(e);
      return false;
    }
  }, [sample, start, fail]);

  const runJson = useCallback(async <T,>(input: Claude.sample.SampleInput, options: Options = {}): Promise<T | null> => {
    if (!sample) return null;
    const c = start();
    try {
      const data = await sample.json<T>(input, { ...options, signal: c.signal });
      if (!live.current || ctl.current !== c) return null;
      setPhase("done");
      return data;
    } catch (e) {
      if (ctl.current === c) fail(e);
      return null;
    }
  }, [sample, start, fail]);

  const stop = useCallback(() => { ctl.current?.abort(); }, []);
  const reset = useCallback(() => { ctl.current?.abort(); ctl.current = null; setPhase("idle"); setText(""); setError(null); setTruncated(false); }, []);

  return { available: !!sample && !hidden, phase, text, setText, error, truncated, disabledUntil, run, runJson, stop, reset };
}
```

`src/capabilities/resolve.ts` dev branch: `sample: Promise.resolve(createFakeSample({ reply: (input) => \`(dev sample) This is a canned draft. The real page streams Claude's answer here.\n\nPrompt began: ${typeof input === "string" ? input.slice(0, 80) : "…"}\`, json: () => ({ must: ["(dev) 3+ years backend", "(dev) Go"], nice: ["(dev) gRPC"] }) }))` with the import added.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/capabilities tests/features/useSample.test.tsx`, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/capabilities/fakeSample.ts src/capabilities/ai.ts src/features/ai/useSample.ts src/capabilities/resolve.ts tests/capabilities/fakeSample.test.ts tests/capabilities/ai.test.ts tests/features/useSample.test.tsx tests/capabilities/resolve.test.ts
git commit -m "feat(ai): fake sample capability, prompt builders, error policy, streaming hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: AI assist UI — draft panel and requirements extraction

**Files:**
- Create: `src/features/ai/DraftPanel.tsx`, `src/features/ai/RequirementsPanel.tsx`
- Modify: `src/features/applications/AnswersTab.tsx` (button "Draft with Claude" + panel), `src/features/answers/AnswerEditor.tsx` (button "Tailor with Claude" + panel), `src/features/applications/OverviewTab.tsx` (`RequirementsPanel` under the job description), `src/styles/app.css` (`.ai-panel`)
- Test: `tests/features/ai.test.tsx`

**Interfaces:**
- Consumes: Task 7 (`useSample`, `buildDraftPrompt`, `buildRequirementsPrompt`, `profileSummary`, `parseRequirements`, `createFakeSample`), `useCapability`, `repo.createAnswer`, `repo.modify`, `copyText`, `AppPatch`.
- Produces: `DraftPanel({ app?, answer?, onClose })` — an inline `<section aria-label="Draft with Claude">` with textbox "Question to answer", selects "Output language" / "Target length", checkboxes "Include job description" (only when the application has one), "Include background summary", one "Use <answer title>" checkbox per bank answer, buttons "Draft", "Stop", textarea "Draft", footer buttons "Save as new answer", "Attach to application" (only with `app`), "Discard"; `RequirementsPanel({ app, patch })` — button "Extract requirements", lists under headings "Must have" / "Nice to have" with one checkbox per requirement, buttons "Copy as checklist", "Append to notes". Both render nothing while the `sample` capability is pending or absent.

- [ ] **Step 1: Write the failing tests**

`tests/features/ai.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { createFakeSample } from "../../src/capabilities/fakeSample";
import { absentCapabilities, type Capabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication, buildCompany } from "../../src/domain/factories";
import type { Application } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, extra: Partial<Capabilities> = {}, jd = "We need Go and gRPC experience.") {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "profile/main", { ...defaultProfile(NOW), employment: [{ company: "Kakao", title: "Backend Engineer", start: "2021", end: "2024", summary: "Payments." }] });
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", jobDescription: jd, answerIds: ["an_1"] }, "app_1", NOW));
  await put(db, "answers/an_1", buildAnswer({ kindId: "answer", title: "STAR: outage", body: "Situation: the checkout went down." }, "an_1", NOW));
  await put(db, "answers/an_2", buildAnswer({ kindId: "answer", title: "Why Shopify", question: "Why Shopify?", body: "Commerce at scale." }, "an_2", NOW));
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db), ...extra }} />);
  return db;
}
const openTab = async (name: string) => {
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("tab", { name }));
};

describe("AI draft assist", () => {
  it("drafts an answer from the Answers tab, streaming into an editable textarea, and attaches it to the application", async () => {
    const sample = createFakeSample({ reply: () => "I want to join Shopify because…", chunks: 2 });
    const db = await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Why Shopify?" } });
    expect((within(panel).getByRole("checkbox", { name: "Use STAR: outage" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Use Why Shopify" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("I want to join Shopify because…"));
    const prompt = String(sample.calls[0].input);
    expect(prompt).toContain("Why Shopify?");
    expect(prompt).toContain("Backend Engineer at Shopify");
    expect(prompt).toContain("We need Go and gRPC experience.");
    expect(prompt).toContain("the checkout went down");
    expect(prompt).toContain("Commerce at scale.");
    expect(prompt).toContain("Backend Engineer at Kakao");
    expect(prompt).not.toContain("@");
    fireEvent.change(within(panel).getByRole("textbox", { name: "Draft" }), { target: { value: "I want to join Shopify because of commerce." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Attach to application" }));
    await waitFor(async () => expect(((await db.doc("applications/app_1").get()).data() as unknown as Application).answerIds).toHaveLength(2));
    const answers = (await db.collection("answers").get()).docs.map((d) => d.data());
    const created = answers.find((a) => a?.title === "Why Shopify?" && a?.body === "I want to join Shopify because of commerce.");
    expect(created).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Draft with Claude" })).toBeNull();
  });

  it("hides every AI control when the sample capability is absent", async () => {
    await open("#/applications/app_1");
    await openTab("Answers");
    expect(screen.queryByRole("button", { name: "Draft with Claude" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.queryByRole("button", { name: "Extract requirements" })).toBeNull();
  });

  it("keeps partial text and shows the message when the call fails", async () => {
    const sample = createFakeSample({ reply: () => "Half of an answer", error: { code: "upstream_error", message: "x", text: "Half of" } });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Q" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    expect((await within(panel).findByRole("alert")).textContent).toMatch(/interrupted/);
    expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("Half of");
  });

  it("extracts requirements from the job description into a checklist and appends it to the notes", async () => {
    const sample = createFakeSample({ json: () => ({ must: ["Go", "gRPC"], nice: ["Kubernetes"] }) });
    const db = await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await screen.findByRole("dialog");
    fireEvent.click(await screen.findByRole("button", { name: "Extract requirements" }));
    expect(await screen.findByRole("checkbox", { name: "Go" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Kubernetes" })).toBeTruthy();
    expect(String(sample.calls[0].input)).toContain("We need Go and gRPC experience.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Append to notes" }));
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("- [x] Go"));
    expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("- [ ] (nice) Kubernetes");
  });

  it("tailors an existing answer from its editor and saves the result as a new answer", async () => {
    const sample = createFakeSample({ reply: () => "Tailored version." });
    const db = await open("#/answers/an_2", { sample: Promise.resolve(sample) });
    await screen.findByRole("dialog");
    fireEvent.click(await screen.findByRole("button", { name: "Tailor with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    expect((within(panel).getByRole("textbox", { name: "Question to answer" }) as HTMLInputElement).value).toBe("Why Shopify?");
    expect((within(panel).getByRole("checkbox", { name: "Use Why Shopify" }) as HTMLInputElement).checked).toBe(true);
    expect(within(panel).queryByRole("button", { name: "Attach to application" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("Tailored version."));
    fireEvent.click(within(panel).getByRole("button", { name: "Save as new answer" }));
    await waitFor(async () => expect((await db.collection("answers").get()).size).toBe(3));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/features/ai.test.tsx` — the first, third, fourth and fifth tests fail on missing buttons; the second passes already (nothing renders) — say so in the report.

- [ ] **Step 3: Implement**

`src/features/ai/DraftPanel.tsx`:
```tsx
import { useState } from "react";
import { buildDraftPrompt, profileSummary } from "../../capabilities/ai";
import type { Answer, Application } from "../../domain/types";
import { useApp, useAppState, useProfile } from "../../store/context";
import { useCapability } from "../../store/useCapability";
import { Field } from "../../ui/fields";
import { useToast } from "../../ui/Toast";
import { useSaver } from "../../ui/useSaver";
import { useSample } from "./useSample";

interface Props {
  app?: Application;
  answer?: Answer;
  onClose: () => void;
}

/** Spec §6 "Draft answer": explicit click, streamed into an editable textarea, save/attach/discard. Inline so no dialog nests inside a drawer. */
export function DraftPanel({ app, answer, onClose }: Props) {
  const { repo, caps } = useApp();
  const state = useAppState();
  const profile = useProfile();
  const sample = useSample(useCapability(caps.sample));
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
```

`src/features/ai/RequirementsPanel.tsx`:
```tsx
import { useState } from "react";
import { buildRequirementsPrompt, parseRequirements, type Requirements } from "../../capabilities/ai";
import type { Application } from "../../domain/types";
import { useApp } from "../../store/context";
import { useCapability } from "../../store/useCapability";
import { copyText } from "../../ui/copyText";
import { useToast } from "../../ui/Toast";
import type { AppPatch } from "../applications/ApplicationDetail";
import { useSample } from "./useSample";

/** Spec §6 "Extract requirements": sample.json → checklist the user can copy or append to the notes. */
export function RequirementsPanel({ app, patch }: { app: Application; patch: (p: AppPatch) => Promise<boolean> }) {
  const { caps } = useApp();
  const sample = useSample(useCapability(caps.sample));
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
```

Wiring:
- `src/features/applications/AnswersTab.tsx`: add `const sampleCap = useCapability(caps.sample);` (take `caps` from `useApp()`), `const [drafting, setDrafting] = useState(false);` and, in the top row after "Manage the bank": `{sampleCap ? <button type="button" className="btn" onClick={() => setDrafting(true)} disabled={repo.readOnly}>Draft with Claude</button> : null}`; render `{drafting ? <DraftPanel app={app} onClose={() => setDrafting(false)} /> : null}` above the attached list.
- `src/features/answers/AnswerEditor.tsx`: same pattern with `<button … onClick={() => setTailoring(true)}>Tailor with Claude</button>` next to "Copy", and `{tailoring ? <DraftPanel answer={answer} onClose={() => setTailoring(false)} /> : null}` after the body field.
- `src/features/applications/OverviewTab.tsx`: under the "Job description" `TextArea` render `<RequirementsPanel app={app} patch={patch} />`.
- `src/styles/app.css` (above the mobile block): `.ai-panel { margin-top: 10px; } .ai-panel fieldset { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; } .ai-panel legend { padding: 0 4px; } .ai-panel h4 { margin: 10px 0 4px; }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/features/ai.test.tsx tests/features/applicationLinks.test.tsx tests/features/answers.test.tsx tests/features/applicationDetail.test.tsx`, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/DraftPanel.tsx src/features/ai/RequirementsPanel.tsx src/features/applications/AnswersTab.tsx src/features/answers/AnswerEditor.tsx src/features/applications/OverviewTab.tsx src/styles/app.css tests/features/ai.test.tsx
git commit -m "feat(ai): draft answers from the bank with Claude, extract job requirements into a checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: Store backlog — lease-guarded migration, cache-aware seeding, serialized deletes, read-only writes, profile-aware pick-list references, AppPatch module

**Files:**
- Modify: `src/store/sync.ts`, `src/domain/migrate.ts`, `src/store/repository.ts`, `src/domain/pickLists.ts`, `src/features/assets/AssetEditor.tsx`, `src/features/applications/ApplicationDetail.tsx`
- Create: `src/features/applications/types.ts`
- Test: `tests/store/sync.test.ts` (append), `tests/domain/migrate.test.ts` (append), `tests/store/repository.test.ts` (append), `tests/domain/pickLists.test.ts` (append), `tests/features/assets.test.tsx` (append)

**Interfaces:**
- Produces: `SyncOptions.migrations?: Migration[]`; a settings migration is written only by the sync that acquires the `settings/main` lease (`holder: "migrate-<random>"`, `ttlMs: 5000`) and re-reads the document before writing; a singleton snapshot with `metadata.fromCache === true` and no document never triggers seeding; `migrateSettings` throws when the migration list is not strictly ascending by `to`; `Repository.remove` is serialized on the document path and echoes the deletion into the store; `requireDb` rejects with `read_only` while `store.readOnly` is set; `referencedPickIds(records: RecordSets & { profile?: Profile | null }, name)` counts the profile's address countries, salary-expectation keys and work-authorization keys under `countries`; `AppPatch` lives in `src/features/applications/types.ts` (ApplicationDetail re-exports it); AssetEditor deletes the record before the blob and disables "Delete asset" while the assets capability is still pending for an asset that has a file.

- [ ] **Step 1: Write the failing tests**

Append to `tests/store/sync.test.ts` (add `import type { Settings } from "../../src/domain/types";` — the file already imports `createFakeDb`, `defaultSettings`, `createStore`, `startSync`, `NOW`):
```ts
  it("writes a settings migration once even when two syncs start on the same document", async () => {
    const db = createFakeDb();
    const s = defaultSettings("America/Toronto", NOW);
    await db.doc("settings/main").set({ ...s, schemaVersion: 0 } as unknown as Record<string, unknown>);
    const bump = [{ to: 1, apply: (x: Settings) => ({ ...x, followUpCadenceDays: x.followUpCadenceDays + 1 }) }];
    const a = startSync(db, createStore(), { homeTz: "America/Toronto", now: () => NOW, migrations: bump });
    const b = startSync(db, createStore(), { homeTz: "America/Toronto", now: () => NOW, migrations: bump });
    await Promise.all([a.ready, b.ready]);
    await new Promise((r) => setTimeout(r, 20));
    const stored = (await db.doc("settings/main").get()).data() as unknown as Settings;
    expect(stored.schemaVersion).toBe(1);
    expect(stored.followUpCadenceDays).toBe(8);
    a.stop(); b.stop();
  });

  it("does not seed defaults from a cache-only miss, only from a definitive one", async () => {
    const db = createFakeDb();
    let acquires = 0;
    const cacheMiss: DocumentSnapshot = { id: "main", exists: false, data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } };
    const wrapped = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        if (path !== "settings/main") return real;
        return {
          ...real,
          acquire: async (o: AcquireOptions) => { acquires++; return real.acquire(o); },
          onSnapshot: (next: (s: DocumentSnapshot) => void, error?: (e: DbError) => void) => { next(cacheMiss); return real.onSnapshot(next, error); },
        };
      },
    } as unknown as DB;
    const store = createStore();
    const handle = startSync(wrapped, store, { homeTz: "America/Toronto", now: () => NOW });
    await handle.ready;
    expect(acquires).toBe(1); // the definitive miss seeded; the cache-only miss did not
    expect(store.getState().settings?.schemaVersion).toBeTypeOf("number");
    handle.stop();
  });
```

Append to `tests/domain/migrate.test.ts`:
```ts
  it("refuses an unordered migration list", () => {
    const s = defaultSettings("UTC", "2026-09-14T00:00:00.000Z");
    expect(() => migrateSettings({ ...s, schemaVersion: 0 }, [{ to: 2, apply: (x) => x }, { to: 1, apply: (x) => x }], 2)).toThrow(/ascending/);
  });
```

Append to `tests/store/repository.test.ts` (inside `describe("Repository")`, reusing `boot`, `NOW`, the delayed-db pattern):
```ts
  it("remove is serialized on the document path and echoes the deletion into the store", async () => {
    const { repo, db, store } = await boot();
    const co = await repo.createCompany({ name: "Gone soon" });
    const delayed = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        return { ...real, delete: () => new Promise<void>((resolve) => { resolve(); setTimeout(() => void real.delete(), 20); }) };
      },
    } as unknown as DB;
    const slowRepo = new Repository(delayed, store, () => NOW);
    await slowRepo.remove("companies", co.id);
    expect(store.getState().companies[co.id]).toBeUndefined();
    await expect(slowRepo.update("companies", co.id, { name: "x" })).rejects.toMatchObject({ code: "not_found" });
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.doc(`companies/${co.id}`).get()).exists).toBe(false);
  });

  it("rejects writes with read_only once the store is marked read-only", async () => {
    const { repo, store } = await boot();
    store.setState({ readOnly: true });
    await expect(repo.createCompany({ name: "x" })).rejects.toMatchObject({ code: "read_only" });
  });
```

Append to `tests/domain/pickLists.test.ts` (add `import { defaultProfile } from "../../src/domain/defaults";`):
```ts
  it("counts countries the profile points at as referenced", () => {
    const profile = { ...defaultProfile("2026-09-14T00:00:00.000Z"), addresses: [{ countryId: "KR", lines: "Seoul" }], salaryExpectations: { US: { currency: "USD" } }, workAuth: { CA: { status: "PR", needsSponsorship: false, formSentence: "" } } };
    const ids = referencedPickIds({ applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {}, profile }, "countries");
    expect([...ids].sort()).toEqual(["CA", "KR", "US"]);
  });
```

Append to `tests/features/assets.test.tsx` (reuse `open` with its `seedAssets` parameter; read how existing delete tests confirm):
```tsx
  it("deletes the record before the stored file", async () => {
    let recordGoneFirst: boolean | null = null;
    const assets = createFakeAssets();
    const db = await open("#/assets/as_1", async (d) => {
      const up = await assets.upload(new Blob(["%PDF-1.4"], { type: "application/pdf" }), { type: "application/pdf" });
      await d.doc("assets/as_1").set(buildAsset({ kindId: "resume", name: "Doomed", file: { assetId: up.id, fileName: "d.pdf", sizeBytes: 8, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW) as unknown as Record<string, unknown>);
    }, "Assets", undefined, assets);
    const realDelete = assets.delete.bind(assets);
    assets.delete = async (id: string) => { recordGoneFirst = !(await db.doc("assets/as_1").get()).exists; return realDelete(id); };
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(recordGoneFirst).toBe(true));
  });
```
(If `open` in that file does not accept a pre-built fake assets instance, extend it with an optional `assetsInstance` parameter and say so in the report.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/store/sync.test.ts tests/domain/migrate.test.ts tests/store/repository.test.ts tests/domain/pickLists.test.ts tests/features/assets.test.tsx`
Expected: migration written twice (cadence 9) / acquires 2 / no throw / store still holds the company / read_only not thrown / `CA` missing / `recordGoneFirst` false.

- [ ] **Step 3: Implement**

`src/domain/migrate.ts` — at the top of `migrateSettings`:
```ts
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].to <= migrations[i - 1].to) throw new Error("Migrations must be sorted ascending by 'to'.");
  }
```

`src/store/sync.ts`:
- `SyncOptions` gains `migrations?: Migration[]` (import `type Migration` from `../domain/migrate`).
- In the settings subscription replace the `if (!hasSchema(snap)) { … }` block and the migration write with:
```ts
          if (!hasSchema(snap)) {
            // A cache-only miss is not proof the document is absent; the definitive snapshot follows on its own.
            if (snap.metadata.fromCache) return;
            void seed(SETTINGS_PATH, () => defaultSettings(opts.homeTz, now()) as unknown as Record<string, unknown>).catch(fail);
            return;
          }
          const raw = snap.data() as unknown as Settings;
          const migrated = migrateSettings(raw, opts.migrations);
          store.setState({ settings: migrated });
          if (migrated !== raw) void migrateWithLease(migrated.schemaVersion).catch(fail);
          markReady("settings");
```
  with, next to `seed`:
```ts
  /** Spec §2: a migration runs once, guarded by a lease on settings/main; the loser waits for the winner's write to arrive. */
  async function migrateWithLease(targetVersion: number): Promise<void> {
    const ref = db.doc(SETTINGS_PATH);
    const lease = await ref.acquire({ holder: `migrate-${Math.random().toString(36).slice(2)}`, ttlMs: 5000 });
    if (!lease.acquired) return;
    const fresh = await ref.get();
    const data = fresh.data() as unknown as Settings | undefined;
    if (!fresh.exists || !data || typeof data.schemaVersion !== "number" || data.schemaVersion >= targetVersion) return;
    await ref.set(migrateSettings(data, opts.migrations) as unknown as Record<string, unknown>);
  }
```
- The profile subscription gets the same `if (snap.metadata.fromCache) return;` guard before its seed.

`src/store/repository.ts`:
- `requireDb`: `if (!this.db || this.store.getState().readOnly) throw new RepoError("read_only", …)`.
- `remove`:
```ts
  async remove(collection: CollectionName, id: string): Promise<void> {
    const db = this.requireDb();
    await this.serialize(`${collection}/${id}`, async () => {
      await this.guard(() => db.doc(`${collection}/${id}`).delete());
      const current = this.store.getState()[collection] as Record<string, unknown>;
      const { [id]: _gone, ...rest } = current;
      this.store.setState({ [collection]: rest } as unknown as Partial<StoreState>);
    });
  }
```

`src/domain/pickLists.ts`: `referencedPickIds(records: RecordSets & { profile?: Profile | null }, name)`; in `case "countries"` add:
```ts
      if (records.profile) {
        records.profile.addresses.forEach((a) => add(a.countryId));
        add(Object.keys(records.profile.salaryExpectations));
        add(Object.keys(records.profile.workAuth));
      }
```
(import `Profile`). Confirm `PickListEditor` passes the store state (which carries `profile`); if it passes a narrower object, include `profile: state.profile`.

`src/features/applications/types.ts`: move the `AppPatch` type here (with its comment); `ApplicationDetail.tsx` imports it from `./types` and keeps `export type { AppPatch } from "./types";` so `AnswersTab`, `OverviewTab`, `RequirementsPanel` compile unchanged.

`src/features/assets/AssetEditor.tsx` `removeRecord`: delete the record first, then the blob, and gate the button:
```tsx
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
```
and on the Delete button: `disabled={referenced || ro || (!!asset.file && assets === undefined)}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run the five files above, then the full suite and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/store/sync.ts src/domain/migrate.ts src/store/repository.ts src/domain/pickLists.ts src/features/assets/AssetEditor.tsx src/features/applications/ApplicationDetail.tsx src/features/applications/types.ts tests/store/sync.test.ts tests/domain/migrate.test.ts tests/store/repository.test.ts tests/domain/pickLists.test.ts tests/features/assets.test.tsx
git commit -m "fix(store): lease-guarded migrations, cache-aware seeding, serialized deletes, read-only writes, profile-aware pick-list references

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: UI backlog — open-file link, deleted-link labels, unique checklist labels, tab keyboard semantics, clickable URL fields, tag re-add, partial comp ranges

**Files:**
- Modify: `src/features/assets/AssetEditor.tsx`, `src/features/contacts/ContactEditor.tsx`, `src/features/interviews/ChecklistEditor.tsx`, `src/features/applications/ApplicationDetail.tsx`, `src/ui/fields.tsx` (`UrlField`, `TagInput`), `src/features/applications/OverviewTab.tsx` (Posting URL, normalized comp text), `src/features/companies/CompanyEditor.tsx` (Website), `src/features/contacts/ContactEditor.tsx` (LinkedIn), `src/features/interviews/InterviewEditor.tsx` (Meeting link), `src/features/prep/PrepEditor.tsx` (Source URL), `src/domain/money.ts`, `src/styles/app.css`
- Test: `tests/features/assets.test.tsx` (append), `tests/features/contacts.test.tsx` (append), `tests/ui/ChecklistEditor.test.tsx` (update names), `tests/features/applicationDetail.test.tsx` (append), `tests/ui/fields.test.tsx` (append), `tests/domain/money.test.ts` (append)

**Interfaces:**
- Produces: AssetEditor always renders the "Open file" link when a file is recorded, with a "file missing" chip beside it after a HEAD 404; ContactEditor labels a reference use whose application is gone as "(deleted application)"; `ChecklistEditor` remove buttons are named `Remove <text> (item N)`; the application tabs carry `id`/`aria-controls`/`aria-labelledby`, roving `tabIndex`, and ArrowLeft/ArrowRight/Home/End; `UrlField({label, value, onCommit, placeholder?, disabled?})` = `TextField type="url"` plus an "Open <label>" link for http(s) values; `TagInput` no longer skips a re-add while a removal is in flight; `formatCompRange` renders "from X" / "up to X" for one-sided ranges and `formatNormalizedRange(comp, settings): string | null` does the same in the display currency.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/assets.test.tsx`:
```tsx
  it("keeps the Open file link visible and flags a missing file after a HEAD 404", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ status: 404 }) as Response) as unknown as typeof fetch;
    try {
      await open("#/assets/as_1", async (db) => {
        await db.doc("assets/as_1").set(buildAsset({ kindId: "resume", name: "Backend resume", file: { assetId: "a".repeat(32), fileName: "r.pdf", sizeBytes: 10, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW) as unknown as Record<string, unknown>);
      });
      await screen.findByRole("dialog");
      expect(await screen.findByText("file missing")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Open file" }).getAttribute("href")).toBe(`/_blob/${"a".repeat(32)}`);
    } finally {
      globalThis.fetch = original;
    }
  });
```

Append to `tests/features/contacts.test.tsx` (reuse `open`/seed helpers):
```tsx
  it("labels a reference use whose application was deleted", async () => {
    await open("#/contacts/ct_1", async (db) => {
      await db.doc("contacts/ct_1").set(buildContact({ name: "Ref Person", relationshipId: "reference", reference: { usedInApplicationIds: ["app_gone"] } }, "ct_1", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    expect(screen.getByText("(deleted application)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove use for (deleted application)" })).toBeTruthy();
  });
```

`tests/ui/ChecklistEditor.test.tsx`: change the two `name: "Remove Review consistent hashing"` queries to `name: "Remove Review consistent hashing (item 1)"` (adjust the index to the item's position in that test's list) and add:
```tsx
  it("names remove buttons uniquely even for duplicate texts", () => {
    render(<ChecklistEditor items={[{ id: "a", text: "Same", done: false }, { id: "b", text: "Same", done: false }]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove Same (item 1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Same (item 2)" })).toBeTruthy();
  });
```

Append to `tests/features/applicationDetail.test.tsx` (reuse its `open`/seed helpers so an application detail is open):
```tsx
  it("wires tabs to panels and moves between them with arrow keys", async () => {
    await open(); // the file's existing helper: seeds an application and opens its detail on the Overview tab
    const overview = screen.getByRole("tab", { name: "Overview" });
    const panel = screen.getByRole("tabpanel");
    expect(overview.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(overview.id);
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Interviews" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Interviews" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("tabindex")).toBe("-1");
  });
```

Append to `tests/ui/fields.test.tsx`:
```tsx
  it("UrlField offers an Open link only for http(s) values", () => {
    const { rerender } = render(<UrlField label="Website" value="https://shopify.com" onCommit={() => {}} />);
    expect(screen.getByRole("link", { name: "Open Website" }).getAttribute("href")).toBe("https://shopify.com");
    rerender(<UrlField label="Website" value="javascript:alert(1)" onCommit={() => {}} />);
    expect(screen.queryByRole("link", { name: "Open Website" })).toBeNull();
  });

  it("TagInput emits a re-add even when the rendered value still shows the tag", () => {
    const onChange = vi.fn();
    render(<TagInput label="Tags" value={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0]([])).toEqual(["a"]);
    expect(onChange.mock.lastCall![0](["a"])).toEqual(["a"]);
  });
```
(Read how the existing `TagInput` tests reach the input — its accessible name may be the label or a placeholder; match that.)

Append to `tests/domain/money.test.ts` (extend the import to include `formatNormalizedRange`; the file's `settings` constant already has USD/KRW rates — the KRW assertion below uses its own settings object without KRW):
```ts
  it("renders one-sided ranges as from/up to, raw and normalized", () => {
    expect(formatCompRange({ min: 100000, currency: "CAD", period: "year" })).toMatch(/^from CA?\$?100,000 \/ year$/);
    expect(formatCompRange({ max: 90000, currency: "CAD", period: "year" })).toMatch(/^up to CA?\$?90,000 \/ year$/);
    const usdOnly = { displayCurrency: "CAD", fxRates: { USD: 1.36 } };
    expect(formatNormalizedRange({ min: 100000, currency: "USD", period: "year" }, usdOnly)).toMatch(/^from CA?\$?136,000$/);
    expect(formatNormalizedRange({ min: 100000, max: 120000, currency: "USD", period: "year" }, usdOnly)).toMatch(/136,000.*163,200/);
    expect(formatNormalizedRange({ min: 1, currency: "KRW", period: "year" }, usdOnly)).toBeNull();
    expect(formatNormalizedRange({ currency: "USD", period: "year" }, usdOnly)).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/features/assets.test.tsx tests/features/contacts.test.tsx tests/ui/ChecklistEditor.test.tsx tests/features/applicationDetail.test.tsx tests/ui/fields.test.tsx tests/domain/money.test.ts` — each new assertion fails for its own reason (link absent, raw id shown, old names, no aria-controls, `UrlField` missing, onChange not called, "from" missing).

- [ ] **Step 3: Implement**

- `AssetEditor.tsx`: replace the ternary that hides the link with `<a className="btn" href={blobUrl(asset.file.assetId)} target="_blank" rel="noreferrer">Open file</a>{fileStatus === "missing" ? <span className="chip chip-red">file missing</span> : null}`.
- `ContactEditor.tsx`: `appLabel` returns `"(deleted application)"` when the application is missing.
- `ChecklistEditor.tsx`: `items.map((it, i) => …)` and `aria-label={`Remove ${it.text} (item ${i + 1})`}`.
- `ApplicationDetail.tsx` tabs:
```tsx
      <div className="tabs" role="tablist" onKeyDown={(e) => {
        const idx = TABS.findIndex((t) => t.id === tab);
        const go = (n: number) => { const next = TABS[(n + TABS.length) % TABS.length]; setTab(next.id); document.getElementById(`tab-${next.id}`)?.focus(); e.preventDefault(); };
        if (e.key === "ArrowRight") go(idx + 1);
        else if (e.key === "ArrowLeft") go(idx - 1);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(TABS.length - 1);
      }}>
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
```
- `src/ui/fields.tsx`: add
```tsx
const SAFE_URL = /^https?:\/\//i;
/** A url TextField plus an "Open <label>" link, shown only for http(s) values. */
export function UrlField({ label, value, onCommit, placeholder, disabled }: Omit<TextProps, "type">) {
  const safe = SAFE_URL.test(value.trim());
  return (
    <div className="url-field">
      <TextField label={label} value={value} onCommit={onCommit} placeholder={placeholder} type="url" disabled={disabled} />
      {safe ? <a className="btn ghost url-open" href={value.trim()} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}>Open</a> : null}
    </div>
  );
}
```
  and in `TagInput.add` drop the render-time `value.includes(tag)` early return (the updater already dedupes against `current`).
- Swap the five URL `TextField`s for `UrlField` (same labels): OverviewTab "Posting URL", CompanyEditor "Website", ContactEditor "LinkedIn", InterviewEditor "Meeting link", PrepEditor "Source URL".
- `src/domain/money.ts`:
```ts
export function formatCompRange(comp: Comp | undefined): string {
  if (!comp || (comp.min == null && comp.max == null)) return "—";
  const min = comp.min != null ? formatMoney(comp.min, comp.currency) : null;
  const max = comp.max != null ? formatMoney(comp.max, comp.currency) : null;
  const range = min && max ? `${min}–${max}` : min ? `from ${min}` : `up to ${max}`;
  return `${range} / ${comp.period}`;
}

/** The range in the display currency, or null when an amount cannot be converted (no rate) or nothing is set. */
export function formatNormalizedRange(comp: Comp | undefined, settings: Pick<Settings, "displayCurrency" | "fxRates">): string | null {
  if (!comp || (comp.min == null && comp.max == null)) return null;
  const conv = (n: number | undefined) => (n == null ? undefined : normalizeAmount(n, comp.currency, settings));
  const min = conv(comp.min);
  const max = conv(comp.max);
  if ((comp.min != null && min == null) || (comp.max != null && max == null)) return null;
  const f = (n: number) => formatMoney(n, settings.displayCurrency);
  if (min != null && max != null) return `${f(min)}–${f(max)}`;
  return min != null ? `from ${f(min)}` : `up to ${f(max as number)}`;
}
```
  and in `OverviewTab.tsx` compute `const normalized = formatNormalizedRange(comp, settings)` for the "In <currency>" field (replace the previous hand-rolled computation and any "?" placeholder).
- `src/styles/app.css` (above the mobile block): `.url-field { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: end; } .url-open { margin-bottom: 12px; }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run the six files above, then the full suite (other tests that rendered URL fields or checklist buttons must still pass — fix names only where this task changed them) and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/AssetEditor.tsx src/features/contacts/ContactEditor.tsx src/features/interviews/ChecklistEditor.tsx src/features/applications/ApplicationDetail.tsx src/ui/fields.tsx src/features/applications/OverviewTab.tsx src/features/companies/CompanyEditor.tsx src/features/interviews/InterviewEditor.tsx src/features/prep/PrepEditor.tsx src/domain/money.ts src/styles/app.css tests/features/assets.test.tsx tests/features/contacts.test.tsx tests/ui/ChecklistEditor.test.tsx tests/features/applicationDetail.test.tsx tests/ui/fields.test.tsx tests/domain/money.test.ts
git commit -m "fix(ui): open-file link with status chip, deleted-link labels, unique checklist labels, tab keyboard semantics, clickable URL fields, tag re-add, one-sided comp ranges

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: Version 0.3.0, README, verification, publish (orchestrating session)

**Files:**
- Modify: `package.json` + `package-lock.json` (`"version": "0.3.0"`), `README.md` (features list)

- [ ] **Step 1: Version and README (implementer)**

Bump `package.json` to `0.3.0` (and the lockfile's two top-level version fields via `npm install --package-lock-only`). In `README.md` replace the "Features (v0.2.0)" list with "Features (v0.3.0)": one line per page, updated for Dashboard (due, overdue, upcoming interviews, follow-ups, funnel by channel or resume), Applications (table with column chooser and sponsorship/tag filters, board view with drag or "Move to", quick-add, detail tabs with Claude drafting and requirement extraction), Search, Settings (backup JSON, CSV export, merge/replace restore, storage meter), Answers ("Tailor with Claude"), plus a short "AI drafting" paragraph: available only in the claude.ai viewer, every call on a click, spends the viewer's own usage, prompts never include contact details or the sensitive note. Run `npm test && npm run typecheck && npm run build`; commit:
```bash
git add package.json package-lock.json README.md
git commit -m "chore: v0.3.0 and README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: Browser walkthrough (controller)**

`npm run dev` in the background, open `http://localhost:5173/dev.html?v=<n>` (cache-bust) in the browser pane: dashboard shows due/overdue/funnel with the dev data; board view: move a card with the "Move to" select and confirm the activity entry; search "shop" from the top box; Settings › Backup: download JSON and a CSV through the anchor fake, restore the same JSON in merge mode; Application › Answers › Draft with Claude with the dev fake sample (streams the canned text, Save as new answer); Overview › Extract requirements (dev fake JSON); 375 px: board scrolls horizontally, search box full width; stop the server.

- [ ] **Step 3: Publish (controller)**

`npm run build`, then the Artifact tool with `file_path: dist/index.html`, `files: {"app.js": "dist/app.js", "app.css": "dist/app.css"}` (capabilities carry forward: db, assets, downloads, sample), label `v0.3.0 insights`. On the live page in the user's own browser: Settings › Download backup (the platform's save prompt appears), Application › Draft with Claude (the first call shows the platform consent prompt; the viewer pays), then delete the smoke-test records. Tag `v0.3.0` and push the tag.

---

## Self-review notes

- Spec coverage: §4 funnel/due/overdue (T1), CSV/backup rules (T3), §5 Dashboard (T2), Applications column chooser/filters/kanban (T5), global search (T6), Assets screen-rate (T2), Answers "Tailor with AI" (T8), Settings backup/restore/CSV (T4), §6 both AI actions and the error policy (T7–T8), §8 export/import incl. resource_exhausted/quota_exceeded handling (T4), §2 lease-guarded migrations and cache-aware seeding (T9), §9 degraded modes for downloads/sample (T4, T8). Ledger items: Plan 1 closed→closed test (T1), "?" partial ranges (T10), MIGRATIONS ordering (T9), column chooser + sponsorship/tag filters (T5); Plan 2 minors: useFileStatus link (T10), remove serialized/echoed (T9), requireDb read-only (T9), asset delete order (T9), deleted-application labels (T10), referencedPickIds profile (T9), checklist labels (T10), tab aria-controls (T10), clickable URLs (T10), AppPatch module (T9), TagInput fast path (T10). Deliberately not built: dev `/_blob` serving (esbuild's server cannot intercept paths), stable per-row ids in RowsEditor (no observed loss; revisit if reported), README Settings bullet (T11 rewrite).
- Type consistency: `AgendaItem.tz?` (T1) is consumed by `AgendaList` (T2); `AppFilter.sponsorship/tag` (T5) are the only new filter fields; `AppPatch` keeps its `ApplicationDetail` export through T9's re-export so T8's `RequirementsPanel` import remains valid; `createFakeSample` returns `SampleLike & {calls}` consumed by T8's tests via `sample.calls[0].input`; `RestoreStep` shapes in T3 match `runRestore`'s switch in T4.
