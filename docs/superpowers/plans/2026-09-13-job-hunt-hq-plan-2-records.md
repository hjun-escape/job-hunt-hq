# Job Hunt HQ — Plan 2 of 3: Contacts, Assets, Answers, Interviews, Prep, Profile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the six remaining record types from the spec (contacts and references, document assets with PDF uploads, the answer bank, interview rounds, prep items, the profile with work authorization), wire them into the application detail panel, clear the Plan 1 backlog, and publish v0.2.0.

**Architecture:** Same layered app as Plan 1 (React 18 + TypeScript, esbuild, Vitest): pure domain rules under `src/domain/`, every write through `Repository`, pages registered in `src/app/routes.tsx`, editors as drawers built from the `src/ui/` kit. Files use the platform `assets` capability with an in-memory fake for local dev and tests. Each task ends with a working page or a working integration and its own tests.

**Tech Stack:** Node 25, npm, React 18, TypeScript 5 strict, esbuild, Luxon, Vitest + jsdom + @testing-library/react 16 (`globals: true`).

**Spec:** `docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md` — this plan implements §3.4–§3.9 (data model), §4 follow-up flags and timezone rules, §5 (Contacts, Assets, Answers, Interviews, Prep, Profile screens; Settings storage meter; the Interviews and Answers tabs of the application detail), §7 (files), and the Plan 2 items of the Plan 1 review backlog.

**Deferred to Plan 3 (do not build here):** dashboard due/overdue/funnel, kanban, backup/restore/CSV, AI draft assist, global search box, applications column chooser and sponsorship/tag filters, lease-guarded migrations, cache-aware readiness.

## Global Constraints

- From the repository root, branch `plan-2-records` (from `master` at the Plan 1 merge). Run every command from the root.
- React `^18.3.1`; TypeScript `strict: true`; `npm run typecheck` exits 0 after every task.
- Every write goes through `Repository`; components never call `db` or `assets` capabilities directly except through the helpers this plan adds (`src/capabilities/files.ts`).
- Every record write strips `undefined` keys and stamps `updatedAt` (already enforced by `Repository`); clearing an optional field sends `undefined`.
- Pick-list values are referenced by `id`, never by label. Records that other records point at cannot be deleted while referenced; they can be archived or unlinked.
- Every editor autosaves with a visible Saving / Saved / Failed indicator; destructive actions go through `useConfirm`.
- Accessible names are unique on a page (tests query by label). The application detail header already uses "Application status" / "Application tier"; the applications toolbar uses "Filter by …"; keep new labels distinct from those.
- All colors via CSS tokens; wide content scrolls inside `.table-wrap`; nav collapses under 720 px; new CSS goes at the END of `src/styles/app.css` (before the final mobile block is fine, but never above the rules it overrides).
- Files (spec §7): PDF and images only; 20 MiB cap; store the asset `id` in the record and build the URL as `/_blob/<id>`; delete a file only from the record's "Remove file" action, clearing the record first.
- Timezones (spec §4): instants stored as ISO UTC plus the source IANA zone (`ZonedInstant`); display in `settings.homeTz` with the source beside it when different.
- TDD: failing test first, run it, implement, run green; paste complete verbatim RED and GREEN vitest output (banner and footer) in the report; test output pristine (zero React `act(...)` warnings — wrap out-of-band `db.doc().set()` calls made after render in `await act(async () => …)`).
- Commits: end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Existing interfaces this plan builds on (exact, from Plan 1)

- `Repository` (`src/store/repository.ts`): `get(collection, id)`, `create(collection, doc)`, `update(collection, id, patch): Promise<Entity>`, `remove(collection, id)`, `saveSettings(s)`, `saveProfile(p)`, `createCompany(input)`, `createApplication(input)`, `changeStatus(appId, statusId, note?)`, `logActivity(appId, entry)`, getter `readOnly`. `update`/`changeStatus`/`logActivity` are serialized per document; `write()` echoes into the store.
- Factories (`src/domain/factories.ts`): `buildContact(input: NewContact, id, now)`, `buildAsset(NewAsset)`, `buildAnswer(NewAnswer)`, `buildInterview(NewInterview)`, `buildPrep(NewPrep)` where `NewContact = Pick<Contact,"name"|"relationshipId"> & Partial<…>`, `NewAsset = Pick<AssetDoc,"kindId"|"name"> & Partial<…>`, `NewAnswer = Pick<Answer,"kindId"|"title"> & Partial<…>`, `NewInterview = Pick<Interview,"applicationId"|"roundTypeId"> & Partial<…>`, `NewPrep = Pick<PrepItem,"kindId"|"title"> & Partial<…>`. `ID_PREFIX = {contacts:"ct", assets:"as", answers:"an", interviews:"iv", prep:"pr", …}`.
- Types (`src/domain/types.ts`): `Contact`, `AssetDoc`, `StoredFile`, `Answer`, `Interview`, `ChecklistItem`, `PrepItem`, `Profile`, `WorkAuth`, `ZonedInstant`, `Deadline`, `PickEntry`, `StatusEntry`, `Rating`, `LabeledLink`, `EntityMap`, `COLLECTIONS`.
- Dates (`src/domain/dates.ts`): `makeZoned(local, tz): ZonedInstant`, `makeDeadline`, `toLocalInputValue(iso, tz, dateOnly)`, `formatForHome(z, homeTz): {home, source}`, `formatInstant(iso, tz, {dateOnly?})`, `todayIso(homeTz, now?)`, `daysUntil(iso, homeTz, now?)`, `isPastDate(isoDate, homeTz, now?)`, `urgency(days)`.
- UI kit (`src/ui/`): `Field({label, htmlFor, hint})`, `TextField({label, value, onCommit: (v)=>void|boolean|Promise<boolean|void>, placeholder?, type?, disabled?})`, `TextArea({… rows?})`, `NumberField({label, value: number|null, onCommit, min?, max?, step?, disabled?})`, `SelectField({label, value, options: PickEntry[], onChange, allowEmpty?, emptyLabel?, disabled?})`, `DateField({label, value, onCommit, disabled?})`, `RatingField({label, value, onChange})`, `TagInput({label, value, onChange, placeholder?, suggestions?})`, `TriStateField({label, value, onChange, yesLabel?, noLabel?})`, `Chip({color?, children, title?})`, `PickChip({list, id})`, `Table({rows, columns, sortKey?, sortDir?, onSort?, onRowClick?, emptyText?, selectedId?})` with `Column<T> {key, header, render, sortValue?, width?, align?}` from `src/ui/sortRows.ts`, `Drawer({open, title, onClose, children, footer?, wide?})`, `useConfirm()(req): Promise<boolean>`, `useSaver(): {status, run(fn): Promise<boolean>}`, `SaveIndicator({status})`, `useToast().show(msg, kind?)`, `allTimeZones()` (`src/ui/timeZones.ts`).
- App (`src/app/`): `routes.tsx` exports `PageProps {parts, query}`, `NAV: NavItem[]`, `PAGES: Record<string, ComponentType<PageProps>>`; `router.ts` exports `navigate(to)`; `context.tsx` exports `useApp()` → `{store, repo, caps}`, `useAppState()`, `useSettings()`, `useProfile()`.
- Capabilities (`src/capabilities/`): `types.ts` exports `Capabilities {db, assets, downloads, sample}` (each `Promise<X|null>`), `AssetsLike = Claude.Assets` (`upload(blob, {type?}) → {id, url, sizeBytes, contentType}`, `list() → {assets, usage:{files, bytes, maxFiles, maxBytes}}`, `delete(id) → {deleted}`), `absentCapabilities()`; `errors.ts` exports `errorCode(e)`, `describeDbError(e)`, `isTransient(e)`; `resolve.ts` builds real or dev capabilities; `fakeDb.ts` exports `createFakeDb`.
- Test pattern (from `tests/features/companies.test.tsx`): an `open(hash, seed?)` helper that creates a fake db, writes `settings/main` (`defaultSettings("America/Toronto", NOW)`), runs `seed(db)`, sets `window.location.hash`, renders `<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />`, and awaits the page heading.

## File map

```
src/store/repository.ts            + createContact/createAsset/createAnswer/createInterview/createPrep; readOnly also honours store.readOnly
src/ui/useSort.ts                  useSort(initialKey, initialDir?) → {sortKey, sortDir, onSort}
src/ui/MultiPick.tsx               chip toggles for multi-select of PickEntry[]
src/ui/fields.tsx                  + disabled on RatingField, TagInput, TriStateField
src/domain/contacts.ts             contactLinks, isContactReferenced, followUpDue
src/features/contacts/ContactsPage.tsx, ContactEditor.tsx
src/capabilities/files.ts          validateDocument, uploadDocument, blobUrl, describeAssetError
src/capabilities/fakeAssets.ts     in-memory AssetsLike for dev/tests (wired into resolve.ts dev branch)
src/domain/assets.ts               assetsOfKind, assetUsage, isAssetReferenced
src/features/assets/AssetsPage.tsx, AssetEditor.tsx, useFileStatus.ts
src/features/settings/StorageMeter.tsx (+ SettingsPage section)
src/ui/Markdown.tsx                minimal safe markdown → React elements
src/ui/copyText.ts                 copyText(text): Promise<boolean>
src/domain/answers.ts              answerUsage, filterAnswers
src/features/answers/AnswersPage.tsx, AnswerEditor.tsx
src/domain/interviews.ts           bucketFor, groupInterviews, formatSlot, roundsFor
src/ui/ZonedTimeField.tsx          datetime-local + zone → ZonedInstant
src/features/interviews/InterviewsPage.tsx, InterviewEditor.tsx, ChecklistEditor.tsx
src/domain/prep.ts                 filterPrep, logAttempt
src/features/prep/PrepPage.tsx, PrepEditor.tsx
src/ui/RowsEditor.tsx              generic add/remove rows editor for profile lists
src/features/profile/ProfilePage.tsx, WorkAuthSection.tsx
src/features/applications/AnswersTab.tsx, InterviewsTab.tsx (+ OverviewTab documents/people section, ApplicationDetail tabs)
src/features/companies/CompanyEditor.tsx (+ contacts list)
src/app/routes.tsx                 final NAV: Dashboard, Applications, Companies, Contacts, Interviews, Assets, Answers, Prep, Profile, Settings
tests/**                           mirrors the above
```

---

### Task 1: Repository create helpers, sort hook, multi-pick, read-only field props

**Files:**
- Modify: `src/store/repository.ts`, `src/ui/fields.tsx` (RatingField, TagInput, TriStateField), `src/styles/app.css` (append)
- Create: `src/ui/useSort.ts`, `src/ui/MultiPick.tsx`
- Test: `tests/store/repository.test.ts` (append), `tests/ui/useSort.test.tsx`, `tests/ui/MultiPick.test.tsx`, `tests/ui/fields.test.tsx` (append)

**Interfaces:**
- Consumes: factories and `ID_PREFIX` (Plan 1), `Store` state `readOnly`.
- Produces: `repo.createContact(input: NewContact): Promise<Contact>`, `repo.createAsset(input: NewAsset): Promise<AssetDoc>`, `repo.createAnswer(input: NewAnswer): Promise<Answer>`, `repo.createInterview(input: NewInterview): Promise<Interview>` (rejects `not_found` when the application does not exist), `repo.createPrep(input: NewPrep): Promise<PrepItem>`; `repo.readOnly` true when `db` is null OR the store is `readOnly`; `useSort(initialKey, initialDir = "asc") → { sortKey, sortDir, onSort(key) }`; `MultiPick({ label, options, value, onChange, disabled? })` rendering `role="group"` with `aria-pressed` chip buttons named by option label; `disabled?: boolean` on `RatingField`, `TagInput`, `TriStateField`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/store/repository.test.ts` (inside `describe("Repository", …)`):
```ts
  it("creates the five record types with prefixed ids and factory defaults", async () => {
    const { repo, store } = await boot();
    const contact = await repo.createContact({ name: "Dana", relationshipId: "recruiter" });
    const asset = await repo.createAsset({ kindId: "resume", name: "Backend resume" });
    const answer = await repo.createAnswer({ kindId: "answer", title: "Why us" });
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved" });
    const interview = await repo.createInterview({ applicationId: app.id, roundTypeId: "coding" });
    const prep = await repo.createPrep({ kindId: "coding", title: "Two Sum" });
    expect(contact.id).toMatch(/^ct_/); expect(contact.notes).toBe("");
    expect(asset.id).toMatch(/^as_/); expect(asset.version).toBe("v1");
    expect(answer.id).toMatch(/^an_/); expect(answer.language).toBe("en");
    expect(interview.id).toMatch(/^iv_/); expect(interview.outcome).toBe("pending");
    expect(prep.id).toMatch(/^pr_/); expect(prep.attempts).toBe(0);
    const s = store.getState();
    expect(s.contacts[contact.id] && s.assets[asset.id] && s.answers[answer.id] && s.interviews[interview.id] && s.prep[prep.id]).toBeTruthy();
  });

  it("createInterview rejects an unknown application", async () => {
    const { repo } = await boot();
    await expect(repo.createInterview({ applicationId: "app_missing", roundTypeId: "coding" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("readOnly reflects a store that was marked read-only after a terminal error", async () => {
    const { repo, store } = await boot();
    expect(repo.readOnly).toBe(false);
    store.setState({ readOnly: true });
    expect(repo.readOnly).toBe(true);
  });
```

`tests/ui/useSort.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSort } from "../../src/ui/useSort";

describe("useSort", () => {
  it("starts on the initial column, toggles direction on repeat, resets to asc on a new column", () => {
    const { result } = renderHook(() => useSort("name"));
    expect(result.current).toMatchObject({ sortKey: "name", sortDir: "asc" });
    act(() => result.current.onSort("name"));
    expect(result.current.sortDir).toBe("desc");
    act(() => result.current.onSort("updated"));
    expect(result.current).toMatchObject({ sortKey: "updated", sortDir: "asc" });
  });
});
```

`tests/ui/MultiPick.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MultiPick } from "../../src/ui/MultiPick";

const options = [{ id: "CA", label: "Canada" }, { id: "US", label: "United States" }, { id: "old", label: "Old", archived: true }];

describe("MultiPick", () => {
  it("toggles ids on and off and hides archived options that are not selected", () => {
    const onChange = vi.fn();
    render(<MultiPick label="Target countries" options={options} value={["CA"]} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Old" })).toBeNull();
    expect(screen.getByRole("button", { name: "Canada" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    expect(onChange).toHaveBeenLastCalledWith(["CA", "US"]);
    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
  it("does nothing while disabled", () => {
    const onChange = vi.fn();
    render(<MultiPick label="Themes" options={options} value={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

Append to `tests/ui/fields.test.tsx`:
```tsx
describe("disabled fields", () => {
  it("RatingField, TagInput and TriStateField ignore input while disabled", () => {
    const onRating = vi.fn(); const onTags = vi.fn(); const onTri = vi.fn();
    render(<>
      <RatingField label="Desire" value={2} onChange={onRating} disabled />
      <TagInput label="Tags" value={["a"]} onChange={onTags} disabled />
      <TriStateField label="Sponsorship needed" value={null} onChange={onTri} disabled />
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Desire 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    const tagInput = screen.getByLabelText("Tags") as HTMLInputElement;
    expect(tagInput.disabled).toBe(true);
    expect((screen.getByLabelText("Sponsorship needed") as HTMLSelectElement).disabled).toBe(true);
    expect(onRating).not.toHaveBeenCalled();
    expect(onTags).not.toHaveBeenCalled();
    expect(onTri).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/store/repository.test.ts tests/ui/useSort.test.tsx tests/ui/MultiPick.test.tsx tests/ui/fields.test.tsx`
Expected: FAIL — `repo.createContact is not a function`, `readOnly` false, modules `useSort`/`MultiPick` not found, disabled buttons still call handlers.

- [ ] **Step 3: Implement**

`src/store/repository.ts` — add to the imports:
```ts
import { buildAnswer, buildApplication, buildAsset, buildCompany, buildContact, buildInterview, buildPrep, type NewAnswer, type NewApplication, type NewAsset, type NewCompany, type NewContact, type NewInterview, type NewPrep } from "../domain/factories";
import type { ActivityEntry, Answer, Application, AssetDoc, CollectionName, Company, Contact, EntityMap, Interview, PrepItem, Profile, Settings } from "../domain/types";
```
(replace the two existing import lines for factories and types). Change the getter:
```ts
  /** No database in this view, or the sync layer switched the store to read-only after a terminal error. */
  get readOnly(): boolean {
    return this.db === null || this.store.getState().readOnly;
  }
```
Add after `createApplication`:
```ts
  async createContact(input: NewContact): Promise<Contact> {
    return this.create("contacts", buildContact(input, newId(ID_PREFIX.contacts), this.now()));
  }

  async createAsset(input: NewAsset): Promise<AssetDoc> {
    return this.create("assets", buildAsset(input, newId(ID_PREFIX.assets), this.now()));
  }

  async createAnswer(input: NewAnswer): Promise<Answer> {
    return this.create("answers", buildAnswer(input, newId(ID_PREFIX.answers), this.now()));
  }

  async createInterview(input: NewInterview): Promise<Interview> {
    if (!this.get("applications", input.applicationId)) throw new RepoError("not_found", `No application ${input.applicationId}.`);
    return this.create("interviews", buildInterview(input, newId(ID_PREFIX.interviews), this.now()));
  }

  async createPrep(input: NewPrep): Promise<PrepItem> {
    return this.create("prep", buildPrep(input, newId(ID_PREFIX.prep), this.now()));
  }
```

`src/ui/useSort.ts`:
```ts
import { useState } from "react";
import type { SortDir } from "./sortRows";

/** Column sort state for a Table: same column toggles direction, a new column starts ascending. */
export function useSort(initialKey: string, initialDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  const onSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  return { sortKey, sortDir, onSort };
}
```

`src/ui/MultiPick.tsx`:
```tsx
import { useId } from "react";
import type { PickEntry } from "../domain/types";

interface Props {
  label: string;
  options: PickEntry[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/** Multi-select over a pick list as toggle chips; archived options stay visible only while selected. */
export function MultiPick({ label, options, value, onChange, disabled }: Props) {
  const id = useId();
  const visible = options.filter((o) => !o.archived || value.includes(o.id));
  const toggle = (optId: string) => onChange(value.includes(optId) ? value.filter((v) => v !== optId) : [...value, optId]);
  return (
    <div className="field">
      <span className="field-label" id={id}>{label}</span>
      <div className="row" role="group" aria-labelledby={id}>
        {visible.map((o) => {
          const on = value.includes(o.id);
          return (
            <button key={o.id} type="button" className={on ? "chip chip-blue chip-toggle" : "chip chip-gray chip-toggle"} aria-pressed={on} disabled={disabled} onClick={() => toggle(o.id)}>
              {o.label}
            </button>
          );
        })}
        {visible.length === 0 ? <span className="muted">No options</span> : null}
      </div>
    </div>
  );
}
```

`src/ui/fields.tsx` — three edits:
- `RatingProps` gains `disabled?: boolean`; `RatingField({ label, value, onChange, disabled })`; each button gets `disabled={disabled}`.
- `TagProps` gains `disabled?: boolean`; `TagInput({ …, disabled })`: `add()` returns early when `disabled`; the remove buttons get `disabled={disabled}`; the `<input>` gets `disabled={disabled}` and its Backspace branch is skipped when disabled.
- `TriProps` gains `disabled?: boolean`; the `<select>` gets `disabled={disabled}`.

Append to `src/styles/app.css` (before the final mobile block or at the end):
```css
.chip-toggle { font: inherit; cursor: pointer; border: 1px solid transparent; }
.chip-toggle[aria-pressed="true"] { border-color: var(--accent); }
.chip-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS (existing suites untouched); typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): record create helpers, sort hook, multi-pick, read-only field props

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Contacts — follow-up rules, list, editor with referral and reference blocks

**Files:**
- Create: `src/domain/contacts.ts`, `src/features/contacts/ContactsPage.tsx`, `src/features/contacts/ContactEditor.tsx`
- Modify: `src/app/routes.tsx` (register `contacts` after `companies`)
- Test: `tests/domain/contacts.test.ts`, `tests/features/contacts.test.tsx`

**Interfaces:**
- Consumes: `repo.createContact`, `repo.update`, `repo.remove`, `useSort`, `Table`, `Drawer`, fields, `PickChip`, `todayIso`, `daysUntil`.
- Produces: `contactLinks(contactId, apps, interviews): { asReferrer: Application[]; asRecruiter: Application[]; asInterviewer: Interview[] }`; `isContactReferenced(contactId, apps, interviews): boolean`; `followUpDue(contact, apps, statuses, cadenceDays, today): { due: boolean; daysSince: number | null; reason: string }`; `ContactsPage({parts})`; `ContactEditor({id, onClose})`; route key `contacts`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/contacts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildContact, buildInterview } from "../../src/domain/factories";
import { contactLinks, followUpDue, isContactReferenced } from "../../src/domain/contacts";

const NOW = "2026-09-11T00:00:00.000Z";
const statuses = defaultSettings("UTC", NOW).pickLists.statuses;
const apps = [
  buildApplication({ companyId: "co_1", title: "A", countryId: "CA", channelId: "referral", statusId: "applied", referrerContactId: "ct_1", recruiterContactId: "ct_2" }, "app_1", NOW),
  buildApplication({ companyId: "co_1", title: "B", countryId: "CA", channelId: "linkedin", statusId: "rejected", referrerContactId: "ct_1" }, "app_2", NOW),
];
const interviews = [buildInterview({ applicationId: "app_1", roundTypeId: "coding", interviewerContactIds: ["ct_3"] }, "iv_1", NOW)];

describe("contactLinks / isContactReferenced", () => {
  it("collects the applications and interviews a contact is attached to", () => {
    const links = contactLinks("ct_1", apps, interviews);
    expect(links.asReferrer.map((a) => a.id)).toEqual(["app_1", "app_2"]);
    expect(links.asRecruiter).toEqual([]);
    expect(contactLinks("ct_3", apps, interviews).asInterviewer.map((i) => i.id)).toEqual(["iv_1"]);
    expect(isContactReferenced("ct_2", apps, interviews)).toBe(true);
    expect(isContactReferenced("ct_9", apps, interviews)).toBe(false);
  });
});

describe("followUpDue", () => {
  const today = "2026-09-11";
  it("is due when linked to an open application and last contact is older than the cadence", () => {
    const c = buildContact({ name: "Dana", relationshipId: "referrer", lastContactedAt: "2026-09-01" }, "ct_1", NOW);
    expect(followUpDue(c, apps, statuses, 7, today)).toEqual({ due: true, daysSince: 10, reason: "Last contacted 10 days ago" });
  });
  it("respects a per-contact cadence override", () => {
    const c = buildContact({ name: "Dana", relationshipId: "referrer", lastContactedAt: "2026-09-01", followUpEveryDays: 14 }, "ct_1", NOW);
    expect(followUpDue(c, apps, statuses, 7, today).due).toBe(false);
  });
  it("is due when never contacted but linked to an open application", () => {
    const c = buildContact({ name: "Rae", relationshipId: "recruiter" }, "ct_2", NOW);
    expect(followUpDue(c, apps, statuses, 7, today)).toEqual({ due: true, daysSince: null, reason: "Never contacted" });
  });
  it("is not due when only linked to closed applications or not linked at all", () => {
    const onlyClosed = buildContact({ name: "X", relationshipId: "referrer", lastContactedAt: "2026-01-01" }, "ct_x", NOW);
    const closedApps = apps.filter((a) => a.id === "app_2");
    expect(followUpDue(onlyClosed, closedApps, statuses, 7, today).due).toBe(false);
    const unlinked = buildContact({ name: "Y", relationshipId: "peer", lastContactedAt: "2026-01-01" }, "ct_y", NOW);
    expect(followUpDue(unlinked, apps, statuses, 7, today).due).toBe(false);
  });
});
```

`tests/features/contacts.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany, buildContact } from "../../src/domain/factories";
import type { Contact } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Contacts" });
  return db;
}

describe("Contacts", () => {
  it("creates a contact from the toolbar and opens its editor", async () => {
    const db = await open("#/contacts");
    fireEvent.change(screen.getByLabelText("New contact name"), { target: { value: "Dana Kim" } });
    fireEvent.change(screen.getByLabelText("New contact relationship"), { target: { value: "recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Dana Kim");
    await waitFor(async () => expect((await db.collection("contacts").get()).size).toBe(1));
    expect(window.location.hash).toMatch(/^#\/contacts\/ct_/);
  });

  it("flags follow-ups that are due and shows the reference block only for references", async () => {
    await open("#/contacts/ct_1", async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "referral", statusId: "applied", referrerContactId: "ct_1" }, "app_1", NOW));
      await put(db, "contacts/ct_1", buildContact({ name: "Dana Kim", relationshipId: "referrer", lastContactedAt: "2026-01-01" }, "ct_1", NOW));
    });
    await screen.findByRole("dialog");
    expect(screen.getAllByText(/Follow up/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Consent given on")).toBeNull();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "reference" } });
    expect(await screen.findByLabelText("Consent given on")).toBeTruthy();
  });

  it("blocks deleting a contact that an application references, and deletes an unreferenced one", async () => {
    const db = await open("#/contacts/ct_1", async (d) => {
      await put(d, "applications/app_1", buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "referral", statusId: "applied", recruiterContactId: "ct_1" }, "app_1", NOW));
      await put(d, "contacts/ct_1", buildContact({ name: "Linked", relationshipId: "recruiter" }, "ct_1", NOW));
      await put(d, "contacts/ct_2", buildContact({ name: "Loose", relationshipId: "peer" }, "ct_2", NOW));
    });
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: "Delete contact" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { window.location.hash = "#/contacts/ct_2"; });
    await screen.findByText("Loose", { selector: ".drawer-title *, .drawer-title" });
    fireEvent.click(screen.getByRole("button", { name: "Delete contact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.doc("contacts/ct_2").get()).exists).toBe(false));
    expect(window.location.hash).toBe("#/contacts");
  });

  it("saves a reference's consent date and usage from the editor", async () => {
    const db = await open("#/contacts/ct_r", async (d) => {
      await put(d, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(d, "applications/app_1", buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW));
      await put(d, "contacts/ct_r", buildContact({ name: "Prof. Lee", relationshipId: "reference" }, "ct_r", NOW));
    });
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Consent given on"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Used for application"), { target: { value: "app_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record use" }));
    await waitFor(async () => {
      const c = (await db.doc("contacts/ct_r").get()).data() as unknown as Contact;
      expect(c.reference).toEqual({ consentAt: "2026-09-01", usedInApplicationIds: ["app_1"] });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/contacts.test.ts tests/features/contacts.test.tsx`
Expected: FAIL — module `contacts` not found; no "Contacts" heading.

- [ ] **Step 3: Implement**

`src/domain/contacts.ts`:
```ts
import { DateTime } from "luxon";
import type { Application, Contact, Interview, StatusEntry } from "./types";

export function contactLinks(contactId: string, apps: Application[], interviews: Interview[]) {
  return {
    asReferrer: apps.filter((a) => a.referrerContactId === contactId),
    asRecruiter: apps.filter((a) => a.recruiterContactId === contactId),
    asInterviewer: interviews.filter((i) => i.interviewerContactIds.includes(contactId)),
  };
}

export function isContactReferenced(contactId: string, apps: Application[], interviews: Interview[]): boolean {
  const l = contactLinks(contactId, apps, interviews);
  return l.asReferrer.length + l.asRecruiter.length + l.asInterviewer.length > 0;
}

export interface FollowUp {
  due: boolean;
  daysSince: number | null;
  reason: string;
}

/** Spec §4: a contact is flagged when linked (as referrer or recruiter) to an open application and
 * either never contacted or last contacted longer ago than their cadence. */
export function followUpDue(contact: Contact, apps: Application[], statuses: StatusEntry[], cadenceDays: number, today: string): FollowUp {
  const open = new Set(statuses.filter((s) => s.group === "open").map((s) => s.id));
  const linkedOpen = apps.some((a) => open.has(a.statusId) && (a.referrerContactId === contact.id || a.recruiterContactId === contact.id));
  if (!linkedOpen) return { due: false, daysSince: null, reason: "" };
  if (!contact.lastContactedAt) return { due: true, daysSince: null, reason: "Never contacted" };
  const days = Math.round(DateTime.fromISO(today).diff(DateTime.fromISO(contact.lastContactedAt), "days").days);
  const cadence = contact.followUpEveryDays ?? cadenceDays;
  return { due: days > cadence, daysSince: days, reason: `Last contacted ${days} days ago` };
}
```

`src/features/contacts/ContactEditor.tsx`:
```tsx
import { useState } from "react";
import { contactLinks, isContactReferenced } from "../../domain/contacts";
import type { Contact, ReferralStatus } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { DateField, Field, NumberField, SelectField, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const REFERRAL: { id: ReferralStatus; label: string }[] = [
  { id: "not_asked", label: "Not asked" }, { id: "asked", label: "Asked" }, { id: "agreed", label: "Agreed" },
  { id: "submitted", label: "Submitted" }, { id: "declined", label: "Declined" },
];

export function ContactEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [useFor, setUseFor] = useState("");
  const contact = state.contacts[id];
  if (!contact) {
    return <Drawer open title="Contact not found" onClose={onClose}><p className="muted">This contact no longer exists.</p></Drawer>;
  }
  const apps = Object.values(state.applications);
  const interviews = Object.values(state.interviews);
  const links = contactLinks(id, apps, interviews);
  const referenced = isContactReferenced(id, apps, interviews);
  const ro = repo.readOnly;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<Contact>) => run(() => repo.update("contacts", id, p));
  const companies = Object.values(state.companies).map((c) => ({ id: c.id, label: c.name }));
  const appLabel = (appId: string) => { const a = state.applications[appId]; return a ? `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}` : appId; };
  const isReference = contact.relationshipId === "reference";
  const isReferrer = contact.relationshipId === "referrer";
  const reference = contact.reference ?? { usedInApplicationIds: [] };
  const remove = async () => {
    if (referenced) return;
    const ok = await confirm({ title: `Delete ${contact.name}?`, message: "This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("contacts", id)))) onClose();
  };

  return (
    <Drawer open title={contact.name} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" disabled={referenced || ro} title={referenced ? "Unlink this contact from applications and interviews first" : undefined} onClick={() => void remove()}>Delete contact</button></>}>
      <div className="grid-2">
        <TextField label="Name" value={contact.name} onCommit={(v) => (v.trim() ? patch({ name: v.trim() }) : false)} disabled={ro} />
        <SelectField label="Relationship" value={contact.relationshipId} options={settings.pickLists.contactRelationships} onChange={(v) => { if (v) void patch({ relationshipId: v }); }} allowEmpty={false} disabled={ro} />
        <SelectField label="Company" value={contact.companyId ?? ""} options={companies} onChange={(v) => void patch({ companyId: opt(v) })} disabled={ro} />
        <TextField label="Title" value={contact.title ?? ""} onCommit={(v) => patch({ title: opt(v) })} disabled={ro} />
        <TextField label="Email" type="email" value={contact.email ?? ""} onCommit={(v) => patch({ email: opt(v) })} disabled={ro} />
        <TextField label="Phone" value={contact.phone ?? ""} onCommit={(v) => patch({ phone: opt(v) })} disabled={ro} />
        <TextField label="LinkedIn" type="url" value={contact.linkedin ?? ""} onCommit={(v) => patch({ linkedin: opt(v) })} disabled={ro} />
        <DateField label="Last contacted" value={contact.lastContactedAt ?? ""} onCommit={(v) => void patch({ lastContactedAt: opt(v) })} disabled={ro} />
        <NumberField label="Follow up every (days)" value={contact.followUpEveryDays ?? null} min={1} onCommit={(v) => patch({ followUpEveryDays: v ?? undefined })} disabled={ro} />
      </div>

      {isReferrer ? (
        <div className="section">
          <h3>Referral</h3>
          <div className="grid-3">
            <SelectField label="Referral status" value={contact.referral?.status ?? "not_asked"} options={REFERRAL} onChange={(v) => { if (v) void patch({ referral: { ...contact.referral, status: v as ReferralStatus } }); }} allowEmpty={false} disabled={ro} />
            <DateField label="Asked on" value={contact.referral?.askedAt ?? ""} onCommit={(v) => void patch({ referral: { status: contact.referral?.status ?? "not_asked", ...contact.referral, askedAt: opt(v) } })} disabled={ro} />
            <DateField label="Submitted on" value={contact.referral?.submittedAt ?? ""} onCommit={(v) => void patch({ referral: { status: contact.referral?.status ?? "not_asked", ...contact.referral, submittedAt: opt(v) } })} disabled={ro} />
          </div>
        </div>
      ) : null}

      {isReference ? (
        <div className="section">
          <h3>Reference</h3>
          <div className="grid-2">
            <DateField label="Consent given on" value={reference.consentAt ?? ""} onCommit={(v) => void patch({ reference: { ...reference, consentAt: opt(v) } })} disabled={ro} />
            <DateField label="Last told to expect a call" value={reference.lastNotifiedAt ?? ""} onCommit={(v) => void patch({ reference: { ...reference, lastNotifiedAt: opt(v) } })} disabled={ro} />
          </div>
          <h4>Used for</h4>
          {reference.usedInApplicationIds.length === 0 ? <p className="muted">Not used yet.</p> : (
            <ul>{reference.usedInApplicationIds.map((appId) => (
              <li key={appId}><a href={`#/applications/${appId}`}>{appLabel(appId)}</a>{" "}
                <button type="button" className="btn ghost" aria-label={`Remove use for ${appLabel(appId)}`} disabled={ro} onClick={() => void patch({ reference: { ...reference, usedInApplicationIds: reference.usedInApplicationIds.filter((x) => x !== appId) } })}>×</button></li>
            ))}</ul>
          )}
          <div className="row">
            <Field label="Used for application" htmlFor="ref-use-for">
              <select id="ref-use-for" value={useFor} onChange={(e) => setUseFor(e.target.value)} disabled={ro}>
                <option value="">Choose an application</option>
                {apps.filter((a) => !reference.usedInApplicationIds.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{appLabel(a.id)}</option>)}
              </select>
            </Field>
            <button type="button" className="btn" disabled={!useFor || ro} onClick={() => { void patch({ reference: { ...reference, usedInApplicationIds: [...reference.usedInApplicationIds, useFor] } }); setUseFor(""); }}>Record use</button>
          </div>
        </div>
      ) : null}

      <TextArea label="Notes" rows={6} value={contact.notes} onCommit={(v) => patch({ notes: v })} disabled={ro} />

      <h3>Linked applications</h3>
      {links.asReferrer.length + links.asRecruiter.length === 0 ? <p className="muted">Not linked to any application yet. Pick this contact as referrer or recruiter on an application.</p> : (
        <ul>
          {links.asReferrer.map((a) => <li key={`r-${a.id}`}><a href={`#/applications/${a.id}`}>{appLabel(a.id)}</a> <span className="muted">· referrer</span></li>)}
          {links.asRecruiter.map((a) => <li key={`c-${a.id}`}><a href={`#/applications/${a.id}`}>{appLabel(a.id)}</a> <span className="muted">· recruiter</span></li>)}
        </ul>
      )}
      {links.asInterviewer.length ? <p className="muted">Interviewer on {links.asInterviewer.length} round(s).</p> : null}
    </Drawer>
  );
}
```

`src/features/contacts/ContactsPage.tsx`:
```tsx
import { useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { followUpDue } from "../../domain/contacts";
import { todayIso } from "../../domain/dates";
import type { Contact } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { ContactEditor } from "./ContactEditor";

export function ContactsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("name");
  const [q, setQ] = useState("");
  const [rel, setRel] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState(settings.pickLists.contactRelationships[0]?.id ?? "");
  const apps = Object.values(state.applications);
  const today = todayIso(settings.homeTz);
  const flag = (c: Contact) => followUpDue(c, apps, settings.pickLists.statuses, settings.followUpCadenceDays, today);
  const needle = q.trim().toLowerCase();
  const rows = Object.values(state.contacts).filter((c) => {
    if (rel && c.relationshipId !== rel) return false;
    if (onlyDue && !flag(c).due) return false;
    if (needle) {
      const company = c.companyId ? state.companies[c.companyId]?.name ?? "" : "";
      if (!`${c.name} ${c.email ?? ""} ${c.title ?? ""} ${company}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
  const columns: Column<Contact>[] = [
    { key: "name", header: "Name", render: (c) => <strong>{c.name}</strong>, sortValue: (c) => c.name },
    { key: "rel", header: "Relationship", render: (c) => <PickChip list={settings.pickLists.contactRelationships} id={c.relationshipId} />, sortValue: (c) => c.relationshipId },
    { key: "company", header: "Company", render: (c) => (c.companyId ? state.companies[c.companyId]?.name ?? "?" : <span className="muted">—</span>), sortValue: (c) => (c.companyId ? state.companies[c.companyId]?.name ?? null : null) },
    { key: "last", header: "Last contacted", render: (c) => c.lastContactedAt ?? <span className="muted">never</span>, sortValue: (c) => c.lastContactedAt ?? null },
    { key: "due", header: "Follow-up", render: (c) => { const f = flag(c); return f.due ? <Chip color="amber" title={f.reason}>Follow up</Chip> : <span className="muted">—</span>; }, sortValue: (c) => (flag(c).due ? 0 : 1) },
    { key: "email", header: "Email", render: (c) => c.email ?? <span className="muted">—</span>, sortValue: (c) => c.email ?? null },
  ];
  const create = () => {
    const name = newName.trim();
    if (!name || !newRel) return;
    void run(async () => {
      const c = await repo.createContact({ name, relationshipId: newRel });
      setNewName("");
      navigate(`/contacts/${c.id}`);
    });
  };
  return (
    <section>
      <h1>Contacts</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, company" /></label>
        <label className="field"><span className="field-label">Filter by relationship</span>
          <select value={rel} onChange={(e) => setRel(e.target.value)}><option value="">Any</option>{settings.pickLists.contactRelationships.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </label>
        <label className="row"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Follow-up due only</label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">New contact name</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <label className="field"><span className="field-label">New contact relationship</span>
          <select value={newRel} onChange={(e) => setNewRel(e.target.value)}>{settings.pickLists.contactRelationships.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add contact</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(c) => navigate(`/contacts/${c.id}`)} selectedId={parts[0]} emptyText="No contacts yet. Add recruiters, referrers, interviewers and references here." />
      {parts[0] ? <ContactEditor id={parts[0]} onClose={() => navigate("/contacts")} /> : null}
    </section>
  );
}
```

`src/app/routes.tsx`: import `ContactsPage` from `../features/contacts/ContactsPage`; insert `{ key: "contacts", to: "/contacts", label: "Contacts" }` after the companies entry; add `contacts: ContactsPage` to `PAGES`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(contacts): follow-up rules, list with flags, editor with referral and reference blocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Assets — file helper, fake asset store, list, editor with upload, storage meter

**Files:**
- Create: `src/capabilities/files.ts`, `src/capabilities/fakeAssets.ts`, `src/store/useCapability.ts`, `src/domain/assets.ts`, `src/features/assets/useFileStatus.ts`, `src/features/assets/AssetsPage.tsx`, `src/features/assets/AssetEditor.tsx`, `src/features/settings/StorageMeter.tsx`
- Modify: `src/capabilities/resolve.ts` (dev branch gets the fake asset store), `src/features/settings/SettingsPage.tsx` (Files section), `src/app/routes.tsx` (register `assets`)
- Test: `tests/capabilities/files.test.ts`, `tests/capabilities/fakeAssets.test.ts`, `tests/domain/assets.test.ts`, `tests/features/assets.test.tsx`

**Interfaces:**
- Consumes: `AssetsLike`, `errorCode`, `repo.createAsset/update/remove`, `MultiPick`, `useSort`, `useConfirm`, `Capabilities` from `useApp().caps`.
- Produces: `DOCUMENT_TYPES`, `MAX_DOCUMENT_BYTES`, `blobUrl(assetId)`, `validateDocument(file): string | null`, `describeAssetError(e)`, `FileError {code}`, `uploadDocument(assets, file, now?): Promise<StoredFile>`; `createFakeAssets(opts?): FakeAssets` (an `AssetsLike` plus `_blobs`); `useCapability(promise): T | null | undefined` (undefined while resolving); `assetsOfKind(assets, kindIds)`, `assetUsage(assetId, apps): {asResume, asCoverLetter}`, `isAssetReferenced(assetId, apps)`, `formatBytes(n)`; `useFileStatus(assetId): "unknown" | "ok" | "missing"`; `AssetsPage`, `AssetEditor({id, onClose})`, `StorageMeter`; route key `assets`.

- [ ] **Step 1: Write the failing tests**

`tests/capabilities/files.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";
import { FileError, blobUrl, describeAssetError, uploadDocument, validateDocument } from "../../src/capabilities/files";

const pdf = (name = "resume.pdf", bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

describe("validateDocument", () => {
  it("accepts pdf and images, rejects word files, empty and oversized files", () => {
    expect(validateDocument(pdf())).toBeNull();
    expect(validateDocument(new File([new Uint8Array(3)], "a.png", { type: "image/png" }))).toBeNull();
    expect(validateDocument(new File([new Uint8Array(3)], "cv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toMatch(/Word files/);
    expect(validateDocument(new File([], "empty.pdf", { type: "application/pdf" }))).toMatch(/empty/);
    const big = { name: "big.pdf", type: "application/pdf", size: 21 * 1024 * 1024 } as File;
    expect(validateDocument(big)).toMatch(/over 20 MB/);
  });
});

describe("uploadDocument", () => {
  it("uploads and returns a StoredFile block", async () => {
    const assets = createFakeAssets();
    const stored = await uploadDocument(assets, pdf("Ada_Resume.pdf", 42), () => "2026-09-13T00:00:00.000Z");
    expect(stored).toMatchObject({ fileName: "Ada_Resume.pdf", sizeBytes: 42, contentType: "application/pdf", uploadedAt: "2026-09-13T00:00:00.000Z" });
    expect(stored.assetId).toMatch(/^[0-9a-f]{32}$/);
    expect(blobUrl(stored.assetId)).toBe(`/_blob/${stored.assetId}`);
  });
  it("turns platform errors into user text and retries once on store_unavailable", async () => {
    const assets = createFakeAssets();
    await expect(uploadDocument(assets, new File([new Uint8Array(3)], "x.txt", { type: "text/rtf" }))).rejects.toBeInstanceOf(FileError);
    let calls = 0;
    const flaky = { ...assets, upload: async (b: Blob, o?: { type?: string }) => { calls++; if (calls === 1) throw { code: "store_unavailable", message: "blip" }; return assets.upload(b, o); } };
    const stored = await uploadDocument(flaky, pdf());
    expect(calls).toBe(2);
    expect(stored.sizeBytes).toBe(10);
    await expect(uploadDocument({ ...assets, upload: async () => { throw { code: "quota_or_state", message: "" }; } }, pdf())).rejects.toMatchObject({ code: "quota_or_state", message: expect.stringMatching(/storage is full/i) });
  });
  it("describes every documented code", () => {
    for (const code of ["too_large", "unsupported_type", "quota_or_state", "rate_limited", "upstream_auth", "store_unavailable", "not_granted", "nope"]) {
      expect(describeAssetError({ code, message: "" }).length).toBeGreaterThan(10);
    }
  });
});
```

`tests/capabilities/fakeAssets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";

describe("createFakeAssets", () => {
  it("uploads, lists with usage, and deletes", async () => {
    const assets = createFakeAssets({ maxFiles: 2, maxBytes: 1000 });
    const a = await assets.upload(new Blob([new Uint8Array(100)], { type: "application/pdf" }));
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.contentType).toBe("application/pdf");
    const listed = await assets.list();
    expect(listed.usage).toEqual({ files: 1, bytes: 100, maxFiles: 2, maxBytes: 1000 });
    expect((await assets.delete(a.id)).deleted).toBe(true);
    expect((await assets.delete(a.id)).deleted).toBe(false);
  });
  it("rejects unsupported types, empty blobs and quota overruns with contract codes", async () => {
    const assets = createFakeAssets({ maxFiles: 1, maxBytes: 150 });
    await expect(assets.upload(new Blob(["x"], { type: "text/rtf" }))).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(assets.upload(new Blob([], { type: "application/pdf" }))).rejects.toMatchObject({ code: "invalid_request" });
    await assets.upload(new Blob([new Uint8Array(100)], { type: "application/pdf" }));
    await expect(assets.upload(new Blob([new Uint8Array(10)], { type: "application/pdf" }))).rejects.toMatchObject({ code: "quota_or_state" });
  });
});
```

`tests/domain/assets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildApplication, buildAsset } from "../../src/domain/factories";
import { assetUsage, assetsOfKind, formatBytes, isAssetReferenced } from "../../src/domain/assets";

const NOW = "2026-09-11T00:00:00.000Z";
const apps = [
  buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", resumeAssetId: "as_1", coverLetterAssetId: "as_2" }, "app_1", NOW),
  buildApplication({ companyId: "co", title: "B", countryId: "CA", channelId: "linkedin", statusId: "saved", resumeAssetId: "as_1" }, "app_2", NOW),
];
const assets = [buildAsset({ kindId: "resume", name: "R" }, "as_1", NOW), buildAsset({ kindId: "cover-letter", name: "C" }, "as_2", NOW), buildAsset({ kindId: "cv", name: "V" }, "as_3", NOW)];

describe("assets domain", () => {
  it("filters by kinds", () => {
    expect(assetsOfKind(assets, ["resume", "cv"]).map((a) => a.id)).toEqual(["as_1", "as_3"]);
  });
  it("reports usage and references", () => {
    expect(assetUsage("as_1", apps).asResume.map((a) => a.id)).toEqual(["app_1", "app_2"]);
    expect(assetUsage("as_2", apps).asCoverLetter.map((a) => a.id)).toEqual(["app_1"]);
    expect(isAssetReferenced("as_3", apps)).toBe(false);
  });
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
```

`tests/features/assets.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildAsset } from "../../src/domain/factories";
import type { AssetDoc } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>, heading = "Assets") {
  const db = createFakeDb();
  const assets = createFakeAssets();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db), assets: Promise.resolve(assets) }} />);
  await screen.findByRole("heading", { name: heading });
  return { db, assets };
}

describe("Assets", () => {
  it("creates an asset record and opens it", async () => {
    const { db } = await open("#/assets");
    fireEvent.change(screen.getByLabelText("New asset kind"), { target: { value: "cover-letter" } });
    fireEvent.change(screen.getByLabelText("New asset name"), { target: { value: "Shopify cover letter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("assets").get()).size).toBe(1));
    expect(window.location.hash).toMatch(/^#\/assets\/as_/);
  });

  it("uploads a PDF onto the record, then removes it", async () => {
    const { db, assets } = await open("#/assets/as_1", async (d) => {
      await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
    });
    await screen.findByRole("dialog");
    const file = new File([new Uint8Array(20)], "Backend_Resume.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [file] } });
    await waitFor(async () => {
      const a = (await db.doc("assets/as_1").get()).data() as unknown as AssetDoc;
      expect(a.file).toMatchObject({ fileName: "Backend_Resume.pdf", sizeBytes: 20, contentType: "application/pdf" });
    });
    expect((await assets.list()).usage.files).toBe(1);
    expect(screen.getByRole("link", { name: "Open file" }).getAttribute("href")).toMatch(/^\/_blob\/[0-9a-f]{32}$/);
    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(async () => expect(((await db.doc("assets/as_1").get()).data() as unknown as AssetDoc).file).toBeUndefined());
    await waitFor(async () => expect((await assets.list()).usage.files).toBe(0));
  });

  it("rejects a Word file with a message and never uploads it", async () => {
    const { assets } = await open("#/assets/as_1", async (d) => {
      await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "R" }, "as_1", NOW));
    });
    await screen.findByRole("dialog");
    const docx = new File([new Uint8Array(5)], "cv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [docx] } });
    expect(await screen.findByText(/Word files are not accepted/)).toBeTruthy();
    expect((await assets.list()).usage.files).toBe(0);
  });

  it("blocks deleting a record that an application uses", async () => {
    await open("#/assets/as_1", async (d) => {
      await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "R" }, "as_1", NOW));
      await put(d, "applications/app_1", buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", resumeAssetId: "as_1" }, "app_1", NOW));
    });
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: "Delete asset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the storage meter on the Settings page", async () => {
    const { assets } = await open("#/settings", undefined, "Settings");
    await assets.upload(new Blob([new Uint8Array(1024)], { type: "application/pdf" }));
    expect(await screen.findByText(/1 file/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/capabilities/files.test.ts tests/capabilities/fakeAssets.test.ts tests/domain/assets.test.ts tests/features/assets.test.tsx`
Expected: FAIL — modules not found; no "Assets" heading.

- [ ] **Step 3: Implement**

`src/capabilities/files.ts`:
```ts
import { nowIso } from "../domain/ids";
import type { StoredFile } from "../domain/types";
import { errorCode } from "./errors";
import type { AssetsLike } from "./types";

/** Spec §7: PDF for documents, images for portfolio previews. Word files are refused with a hint. */
export const DOCUMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function blobUrl(assetId: string): string {
  return `/_blob/${assetId}`;
}

export function validateDocument(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!DOCUMENT_TYPES.has(file.type)) {
    return name.endsWith(".doc") || name.endsWith(".docx") ? "Word files are not accepted. Export to PDF first." : "Only PDF, PNG, JPEG and WebP files are accepted.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is over 20 MB. Compress it or split it.";
  return null;
}

export function describeAssetError(e: unknown): string {
  switch (errorCode(e)) {
    case "too_large": return "That file is over 20 MB. Compress it or split it.";
    case "unsupported_type": return "Only PDF, PNG, JPEG and WebP files are accepted. Export documents to PDF first.";
    case "quota_or_state": return "File storage is full. Remove a file you no longer need and try again.";
    case "rate_limited": return "Too many uploads at once. Wait a moment and try again.";
    case "upstream_auth": return "Sign in again to upload files.";
    case "store_unavailable": return "File storage is temporarily unavailable. Try again.";
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return "File uploads are not available in this view.";
    default: return "Could not upload the file. Try again.";
  }
}

export class FileError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FileError";
  }
}

/** Validate, upload, and return the block to store on the owning record. Retries once on `store_unavailable`. */
export async function uploadDocument(assets: AssetsLike, file: File, now: () => string = nowIso): Promise<StoredFile> {
  const problem = validateDocument(file);
  if (problem) throw new FileError("invalid", problem);
  const attempt = () => assets.upload(file, { type: file.type });
  let result: Awaited<ReturnType<AssetsLike["upload"]>>;
  try {
    result = await attempt();
  } catch (e) {
    if (errorCode(e) !== "store_unavailable") throw new FileError(errorCode(e) ?? "unknown", describeAssetError(e));
    try {
      result = await attempt();
    } catch (e2) {
      throw new FileError(errorCode(e2) ?? "unknown", describeAssetError(e2));
    }
  }
  return { assetId: result.id, fileName: file.name, sizeBytes: result.sizeBytes, contentType: result.contentType, uploadedAt: now() };
}
```

`src/capabilities/fakeAssets.ts`:
```ts
import type { AssetsLike } from "./types";

const ACCEPTED = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "video/mp4", "video/webm", "application/pdf",
  "font/woff2", "font/woff", "font/ttf", "font/otf", "text/csv", "text/markdown", "application/json", "text/plain", "text/css", "text/javascript",
]);
const MAX_FILE = 20 * 1024 * 1024;

export interface FakeAssets extends AssetsLike {
  _blobs: Map<string, Blob>;
}

/** In-memory stand-in for the platform `assets` capability (dev page and tests). Ids are 32 hex chars like the real ones. */
export function createFakeAssets(opts: { maxFiles?: number; maxBytes?: number } = {}): FakeAssets {
  const maxFiles = opts.maxFiles ?? 100;
  const maxBytes = opts.maxBytes ?? 100 * 1024 * 1024;
  const items = new Map<string, { contentType: string; sizeBytes: number; createdAt: string; url: string }>();
  const blobs = new Map<string, Blob>();
  const reject = (code: string, message: string) => Promise.reject({ code, message });
  const urlFor = (id: string, blob: Blob) => (typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : `/_blob/${id}`);
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return {
    _blobs: blobs,
    async upload(blob, options) {
      if (!(blob instanceof Blob) || blob.size === 0) return reject("invalid_request", "empty body or not a Blob");
      const type = options?.type ?? blob.type;
      if (!ACCEPTED.has(type)) return reject("unsupported_type", `unsupported type ${type}`);
      if (blob.size > MAX_FILE) return reject("too_large", "over 20 MiB");
      const used = [...items.values()].reduce((n, i) => n + i.sizeBytes, 0);
      if (items.size >= maxFiles || used + blob.size > maxBytes) return reject("quota_or_state", "storage quota exhausted");
      const id = newId();
      const entry = { contentType: type, sizeBytes: blob.size, createdAt: new Date().toISOString(), url: urlFor(id, blob) };
      items.set(id, entry);
      blobs.set(id, blob);
      return { id, url: entry.url, sizeBytes: entry.sizeBytes, contentType: type };
    },
    async list() {
      const assets = [...items].map(([id, i]) => ({ id, url: i.url, contentType: i.contentType, sizeBytes: i.sizeBytes, createdAt: i.createdAt }));
      return { assets, usage: { files: items.size, bytes: assets.reduce((n, a) => n + a.sizeBytes, 0), maxFiles, maxBytes } };
    },
    async delete(ref) {
      const id = ref.replace(/^.*\/_blob\//, "");
      const deleted = items.delete(id);
      blobs.delete(id);
      return { deleted };
    },
  };
}
```

`src/capabilities/resolve.ts`: import `createFakeAssets` and in the dev branch replace `assets: Promise.resolve(null)` with `assets: Promise.resolve(createFakeAssets())`.

`src/store/useCapability.ts`:
```ts
import { useEffect, useState } from "react";

/** Resolves a capability promise for a component: `undefined` while pending, `null` when absent. */
export function useCapability<T>(promise: Promise<T | null>): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    promise.then((v) => { if (live) setValue(v); }, () => { if (live) setValue(null); });
    return () => { live = false; };
  }, [promise]);
  return value;
}
```

`src/domain/assets.ts`:
```ts
import type { Application, AssetDoc } from "./types";

export function assetsOfKind(assets: AssetDoc[], kindIds: string[]): AssetDoc[] {
  return assets.filter((a) => kindIds.includes(a.kindId));
}

export function assetUsage(assetId: string, apps: Application[]) {
  return {
    asResume: apps.filter((a) => a.resumeAssetId === assetId),
    asCoverLetter: apps.filter((a) => a.coverLetterAssetId === assetId),
  };
}

export function isAssetReferenced(assetId: string, apps: Application[]): boolean {
  const u = assetUsage(assetId, apps);
  return u.asResume.length + u.asCoverLetter.length > 0;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
```

`src/features/assets/useFileStatus.ts`:
```ts
import { useEffect, useState } from "react";
import { blobUrl } from "../../capabilities/files";

export type FileStatus = "unknown" | "ok" | "missing";

/** Spec §7: a pointer whose file 404s renders as "file missing". A HEAD request settles it; anything else stays unknown. */
export function useFileStatus(assetId: string | undefined): FileStatus {
  const [status, setStatus] = useState<FileStatus>("unknown");
  useEffect(() => {
    let live = true;
    setStatus("unknown");
    if (!assetId || typeof fetch !== "function") return;
    fetch(blobUrl(assetId), { method: "HEAD" })
      .then((r) => { if (live) setStatus(r.status === 404 ? "missing" : "ok"); })
      .catch(() => { /* relative URL outside the platform, offline, etc.: stay unknown */ });
    return () => { live = false; };
  }, [assetId]);
  return status;
}
```

`src/features/assets/AssetEditor.tsx`:
```tsx
import { useRef, useState } from "react";
import { blobUrl, uploadDocument, validateDocument } from "../../capabilities/files";
import { assetUsage, formatBytes, isAssetReferenced } from "../../domain/assets";
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
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const asset = state.assets[id];
  const fileStatus = useFileStatus(asset?.file?.assetId);
  if (!asset) return <Drawer open title="Asset not found" onClose={onClose}><p className="muted">This asset no longer exists.</p></Drawer>;

  const apps = Object.values(state.applications);
  const usage = assetUsage(id, apps);
  const referenced = isAssetReferenced(id, apps);
  const ro = repo.readOnly;
  const pl = settings.pickLists;
  const patch = (p: Partial<AssetDoc>) => run(() => repo.update("assets", id, p));
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
    if (asset.file) { try { await assets?.delete(asset.file.assetId); } catch { /* record delete still proceeds; storage housekeeping can prune it */ } }
    if (await run(() => repo.remove("assets", id))) onClose();
  };

  return (
    <Drawer open title={asset.name} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" disabled={referenced || ro} title={referenced ? "Unlink it from applications first" : undefined} onClick={() => void removeRecord()}>Delete asset</button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={asset.kindId} options={pl.assetKinds} onChange={(v) => { if (v) void patch({ kindId: v }); }} allowEmpty={false} disabled={ro} />
        <TextField label="Name" value={asset.name} onCommit={(v) => (v.trim() ? patch({ name: v.trim() }) : false)} disabled={ro} />
        <TextField label="Version" value={asset.version} onCommit={(v) => patch({ version: v.trim() || "v1" })} disabled={ro} />
      </div>
      <MultiPick label="Target countries" options={pl.countries} value={asset.targetCountryIds} onChange={(v) => void patch({ targetCountryIds: v })} disabled={ro} />
      <MultiPick label="Target role families" options={pl.roleFamilies} value={asset.targetRoleFamilyIds} onChange={(v) => void patch({ targetRoleFamilyIds: v })} disabled={ro} />

      <div className="section">
        <h3>File</h3>
        {asset.file ? (
          <div className="row">
            <span>{asset.file.fileName} <span className="muted">· {formatBytes(asset.file.sizeBytes)} · uploaded {asset.file.uploadedAt.slice(0, 10)}</span></span>
            {fileStatus === "missing" ? <span className="chip chip-red">file missing</span> : <a className="btn" href={blobUrl(asset.file.assetId)} target="_blank" rel="noreferrer">Open file</a>}
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
    </Drawer>
  );
}
```

`src/features/assets/AssetsPage.tsx`:
```tsx
import { useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { formatBytes } from "../../domain/assets";
import type { AssetDoc } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { AssetEditor } from "./AssetEditor";

export function AssetsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("updated", "desc");
  const kinds = settings.pickLists.assetKinds;
  const [newKind, setNewKind] = useState(kinds[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const all = Object.values(state.assets);
  const usedBy = (id: string) => Object.values(state.applications).filter((a) => a.resumeAssetId === id || a.coverLetterAssetId === id).length;
  const countryLabel = (id: string) => settings.pickLists.countries.find((c) => c.id === id)?.label ?? id;
  const columns: Column<AssetDoc>[] = [
    { key: "name", header: "Name", render: (a) => <strong>{a.name}</strong>, sortValue: (a) => a.name },
    { key: "version", header: "Version", render: (a) => a.version, sortValue: (a) => a.version },
    { key: "targets", header: "Targets", render: (a) => <span className="row">{a.targetCountryIds.map((c) => <Chip key={c}>{countryLabel(c)}</Chip>)}</span> },
    { key: "file", header: "File", render: (a) => (a.file ? <span>{a.file.fileName} <span className="muted">({formatBytes(a.file.sizeBytes)})</span></span> : <span className="muted">no file</span>), sortValue: (a) => a.file?.fileName ?? null },
    { key: "used", header: "Used by", align: "right", render: (a) => usedBy(a.id), sortValue: (a) => usedBy(a.id) },
    { key: "updated", header: "Updated", render: (a) => a.updatedAt.slice(0, 10), sortValue: (a) => a.updatedAt },
  ];
  const create = () => {
    const name = newName.trim();
    if (!name || !newKind) return;
    void run(async () => {
      const a = await repo.createAsset({ kindId: newKind, name });
      setNewName("");
      navigate(`/assets/${a.id}`);
    });
  };
  const groups = kinds.filter((k) => all.some((a) => a.kindId === k.id));
  const orphans = all.filter((a) => !kinds.some((k) => k.id === a.kindId));
  return (
    <section>
      <h1>Assets</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">New asset kind</span>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{kinds.filter((k) => !k.archived).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        </label>
        <label className="field"><span className="field-label">New asset name</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Backend resume, Korean 이력서, …" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add asset</button>
      </div>
      {all.length === 0 ? <p className="empty">No assets yet. Add a resume version to get started; upload its PDF from the editor.</p> : null}
      {groups.map((k) => (
        <div key={k.id} className="section">
          <h2>{k.label}</h2>
          <Table rows={all.filter((a) => a.kindId === k.id)} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(a) => navigate(`/assets/${a.id}`)} selectedId={parts[0]} />
        </div>
      ))}
      {orphans.length ? <div className="section"><h2>Other</h2><Table rows={orphans} columns={columns} onRowClick={(a) => navigate(`/assets/${a.id}`)} selectedId={parts[0]} /></div> : null}
      {parts[0] ? <AssetEditor id={parts[0]} onClose={() => navigate("/assets")} /> : null}
    </section>
  );
}
```

`src/features/settings/StorageMeter.tsx`:
```tsx
import { useEffect, useState } from "react";
import { formatBytes } from "../../domain/assets";
import { useApp } from "../../store/context";
import { useCapability } from "../../store/useCapability";

export function StorageMeter() {
  const { caps } = useApp();
  const assets = useCapability(caps.assets);
  const [usage, setUsage] = useState<{ files: number; bytes: number; maxFiles: number; maxBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!assets) return;
    let live = true;
    assets.list().then((r) => { if (live) setUsage(r.usage); }, () => { if (live) setError("Could not read storage usage."); });
    return () => { live = false; };
  }, [assets]);
  if (assets === undefined) return <p className="muted">Checking file storage…</p>;
  if (assets === null) return <p className="muted">File storage is not available in this view.</p>;
  if (error) return <p className="muted">{error}</p>;
  if (!usage) return <p className="muted">Loading…</p>;
  const pct = usage.maxBytes > 0 ? Math.min(100, Math.round((usage.bytes / usage.maxBytes) * 100)) : 0;
  return (
    <div>
      <p>{usage.files} file{usage.files === 1 ? "" : "s"} · {formatBytes(usage.bytes)} of {formatBytes(usage.maxBytes)} ({pct}%) · {usage.maxFiles - usage.files} file slots left</p>
      <progress max={100} value={pct} aria-label="Storage used" style={{ width: "100%" }} />
    </div>
  );
}
```

`src/features/settings/SettingsPage.tsx`: import `StorageMeter` and add, between the "Pick lists" section and the "Reset" section:
```tsx
      <div className="section">
        <h2>Files</h2>
        <StorageMeter />
      </div>
```

`src/app/routes.tsx`: import `AssetsPage`; add `{ key: "assets", to: "/assets", label: "Assets" }` after contacts; `PAGES.assets = AssetsPage`.

Append to `src/styles/app.css`:
```css
.danger-text { color: var(--danger); }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS (the resolve test's fallback assertion `expect(await caps.assets).toBeNull()` must be updated: change it to `expect(await caps.assets).not.toBeNull()` in `tests/capabilities/resolve.test.ts`, since the dev branch now provides the fake asset store); typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(assets): document uploads via the assets capability, asset records, storage meter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Answers — safe markdown, copy, bank page, editor with preview and usage

**Files:**
- Create: `src/ui/Markdown.tsx`, `src/ui/copyText.ts`, `src/domain/answers.ts`, `src/features/answers/AnswersPage.tsx`, `src/features/answers/AnswerEditor.tsx`
- Modify: `src/app/routes.tsx` (register `answers`)
- Test: `tests/ui/Markdown.test.tsx`, `tests/domain/answers.test.ts`, `tests/features/answers.test.tsx`

**Interfaces:**
- Consumes: `repo.createAnswer/update/remove`, `MultiPick`, `TagInput`, `useSort`, `useToast`.
- Produces: `Markdown({ text })` rendering paragraphs, `#`/`##` headings (as h3/h4), `-`/`*` bullet lists, `**bold**`, `*italic*`, `` `code` ``, and `[label](http…)` links (http/https only; other schemes render as plain text), with no raw HTML; `copyText(text): Promise<boolean>`; `answerUsage(answerId, apps): Application[]`; `AnswerFilter { text, kindId, themeId, language }`; `filterAnswers(answers, filter)`; `AnswersPage`, `AnswerEditor({id, onClose})`; route key `answers`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/Markdown.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "../../src/ui/Markdown";

describe("Markdown", () => {
  it("renders paragraphs, lists, headings and inline styles as elements", () => {
    const { container } = render(<Markdown text={"# Why us\n\nI **love** the *scale*.\n\n- one\n- two\n\nSee [site](https://example.com) and `code`."} />);
    expect(container.querySelector("h3")?.textContent).toBe("Why us");
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("love");
    expect(container.querySelector("em")?.textContent).toBe("scale");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noreferrer");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });
  it("never emits raw HTML and refuses non-http links", () => {
    const { container } = render(<Markdown text={"<img src=x onerror=alert(1)> [bad](javascript:alert(1))"} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("bad");
  });
});
```

`tests/domain/answers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildAnswer, buildApplication } from "../../src/domain/factories";
import { answerUsage, filterAnswers } from "../../src/domain/answers";

const NOW = "2026-09-11T00:00:00.000Z";
const answers = [
  buildAnswer({ kindId: "answer", title: "Why Shopify", body: "Commerce at scale", themeIds: ["why-company"], language: "en" }, "an_1", NOW),
  buildAnswer({ kindId: "star", title: "Outage story", body: "We lost the primary DB", themeIds: ["failure", "leadership"], language: "en", tags: ["infra"] }, "an_2", NOW),
  buildAnswer({ kindId: "answer", title: "지원동기", body: "성장 가능성", themeIds: ["motivation-ko"], language: "ko" }, "an_3", NOW),
];
const apps = [buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", answerIds: ["an_1", "an_2"] }, "app_1", NOW)];

describe("answers domain", () => {
  it("filters by text across title, question, body and tags; by kind, theme and language", () => {
    const f = { text: "", kindId: "", themeId: "", language: "" };
    expect(filterAnswers(answers, { ...f, text: "db" }).map((a) => a.id)).toEqual(["an_2"]);
    expect(filterAnswers(answers, { ...f, text: "infra" }).map((a) => a.id)).toEqual(["an_2"]);
    expect(filterAnswers(answers, { ...f, kindId: "answer" }).map((a) => a.id)).toEqual(["an_1", "an_3"]);
    expect(filterAnswers(answers, { ...f, themeId: "leadership" }).map((a) => a.id)).toEqual(["an_2"]);
    expect(filterAnswers(answers, { ...f, language: "ko" }).map((a) => a.id)).toEqual(["an_3"]);
    expect(filterAnswers(answers, { ...f, text: "성장" }).map((a) => a.id)).toEqual(["an_3"]);
  });
  it("reports which applications use an answer", () => {
    expect(answerUsage("an_1", apps).map((a) => a.id)).toEqual(["app_1"]);
    expect(answerUsage("an_3", apps)).toEqual([]);
  });
});
```

`tests/features/answers.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication } from "../../src/domain/factories";
import type { Answer } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Answers" });
  return db;
}

describe("Answers", () => {
  it("creates an answer and edits its body", async () => {
    const db = await open("#/answers");
    fireEvent.change(screen.getByLabelText("New answer title"), { target: { value: "Why Shopify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    await screen.findByRole("dialog");
    const body = screen.getByLabelText("Body");
    fireEvent.change(body, { target: { value: "Because **commerce**." } });
    fireEvent.blur(body);
    await waitFor(async () => {
      const list = (await db.collection("answers").get()).docs.map((d) => d.data() as unknown as Answer);
      expect(list[0]?.body).toBe("Because **commerce**.");
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByText("commerce")).tagName).toBe("STRONG");
  });

  it("copies the body to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open("#/answers/an_1", async (d) => {
      await put(d, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why us", body: "Scale and craft." }, "an_1", NOW));
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Scale and craft."));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("filters by theme and blocks deleting an answer an application uses", async () => {
    await open("#/answers/an_1", async (d) => {
      await put(d, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why us", themeIds: ["why-company"] }, "an_1", NOW));
      await put(d, "answers/an_2", buildAnswer({ kindId: "star", title: "Outage", themeIds: ["failure"] }, "an_2", NOW));
      await put(d, "applications/app_1", buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", answerIds: ["an_1"] }, "app_1", NOW));
    });
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: "Delete answer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Filter by theme"), { target: { value: "failure" } });
    expect(screen.getAllByText("Outage").length).toBeGreaterThan(0);
    expect(screen.queryByText("Why us", { selector: "td strong" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/Markdown.test.tsx tests/domain/answers.test.ts tests/features/answers.test.tsx`
Expected: FAIL — modules not found; no "Answers" heading.

- [ ] **Step 3: Implement**

`src/ui/copyText.ts`:
```ts
/** Copies text with the async clipboard API, falling back to a hidden textarea + execCommand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
```

`src/ui/Markdown.tsx`:
```tsx
import type { ReactNode } from "react";

const SAFE_LINK = /^https?:\/\//i;
// Tokens: **bold**, *italic*, `code`, [label](url). Longest-first alternation keeps `**` from matching as two `*`.
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("*")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const url = tok.slice(close + 2, -1);
      out.push(SAFE_LINK.test(url) ? <a key={key} href={url} target="_blank" rel="noreferrer">{label}</a> : label);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal markdown: paragraphs, `#`/`##` headings, `-`/`*` bullets, bold, italic, code, http(s) links. Everything else is text. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={`p${blocks.length}`}>{renderInline(para.join(" "), `p${blocks.length}`)}</p>); para = []; } };
  const flushList = () => { if (list.length) { blocks.push(<ul key={`u${blocks.length}`}>{list.map((item, i) => <li key={i}>{renderInline(item, `l${blocks.length}-${i}`)}</li>)}</ul>); list = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") { flushPara(); flushList(); continue; }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) { flushPara(); list.push(bullet[1]); continue; }
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara(); flushList();
      const key = `h${blocks.length}`;
      blocks.push(heading[1].length === 1 ? <h3 key={key}>{renderInline(heading[2], key)}</h3> : <h4 key={key}>{renderInline(heading[2], key)}</h4>);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return <div className="markdown">{blocks}</div>;
}
```

`src/domain/answers.ts`:
```ts
import type { Answer, Application } from "./types";

export interface AnswerFilter {
  text: string;
  kindId: string;
  themeId: string;
  language: string;
}

export function filterAnswers(answers: Answer[], f: AnswerFilter): Answer[] {
  const needle = f.text.trim().toLowerCase();
  return answers.filter((a) => {
    if (f.kindId && a.kindId !== f.kindId) return false;
    if (f.themeId && !a.themeIds.includes(f.themeId)) return false;
    if (f.language && a.language !== f.language) return false;
    if (needle) {
      const hay = `${a.title} ${a.question ?? ""} ${a.body} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function answerUsage(answerId: string, apps: Application[]): Application[] {
  return apps.filter((a) => a.answerIds.includes(answerId));
}
```

`src/features/answers/AnswerEditor.tsx`:
```tsx
import { useState } from "react";
import { answerUsage } from "../../domain/answers";
import type { Answer } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { copyText } from "../../ui/copyText";
import { Drawer } from "../../ui/Drawer";
import { Markdown } from "../../ui/Markdown";
import { MultiPick } from "../../ui/MultiPick";
import { SelectField, TagInput, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useToast } from "../../ui/Toast";
import { useSaver } from "../../ui/useSaver";

const LANGUAGES = [{ id: "en", label: "English" }, { id: "ko", label: "한국어" }, { id: "other", label: "Other" }];

export function AnswerEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const answer = state.answers[id];
  if (!answer) return <Drawer open title="Answer not found" onClose={onClose}><p className="muted">This answer no longer exists.</p></Drawer>;
  const used = answerUsage(id, Object.values(state.applications));
  const ro = repo.readOnly;
  const pl = settings.pickLists;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<Answer>) => run(() => repo.update("answers", id, p));
  const copy = async () => {
    const ok = await copyText(answer.body);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); } else toast.show("Could not copy. Select the text and copy it manually.", "error");
  };
  const remove = async () => {
    if (used.length) return;
    const ok = await confirm({ title: `Delete "${answer.title}"?`, message: "This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("answers", id)))) onClose();
  };
  return (
    <Drawer open wide title={answer.title} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" disabled={used.length > 0 || ro} title={used.length ? "Detach it from applications first" : undefined} onClick={() => void remove()}>Delete answer</button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={answer.kindId} options={pl.answerKinds} onChange={(v) => { if (v) void patch({ kindId: v }); }} allowEmpty={false} disabled={ro} />
        <TextField label="Title" value={answer.title} onCommit={(v) => (v.trim() ? patch({ title: v.trim() }) : false)} disabled={ro} />
        <TextField label="Question it answers" value={answer.question ?? ""} onCommit={(v) => patch({ question: opt(v) })} placeholder="Tell me about a time you…" disabled={ro} />
        <SelectField label="Language" value={answer.language} options={LANGUAGES} onChange={(v) => { if (v) void patch({ language: v as Answer["language"] }); }} allowEmpty={false} disabled={ro} />
      </div>
      <MultiPick label="Themes" options={pl.answerThemes} value={answer.themeIds} onChange={(v) => void patch({ themeIds: v })} disabled={ro} />
      <TagInput label="Tags" value={answer.tags} onChange={(v) => void patch({ tags: v })} disabled={ro} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <button type="button" className={preview ? "btn" : "btn primary"} onClick={() => setPreview(false)} aria-pressed={!preview}>Edit</button>
          <button type="button" className={preview ? "btn primary" : "btn"} onClick={() => setPreview(true)} aria-pressed={preview}>Preview</button>
        </div>
        <div className="row"><button type="button" className="btn" onClick={() => void copy()}>Copy</button>{copied ? <span className="muted">Copied</span> : null}</div>
      </div>
      {preview ? <div className="section"><Markdown text={answer.body} /></div> : (
        <TextArea label="Body" rows={14} value={answer.body} onCommit={(v) => patch({ body: v })} placeholder="Markdown works: **bold**, - bullets, [links](https://…)" disabled={ro} />
      )}
      <h3>Used in {used.length} application{used.length === 1 ? "" : "s"}</h3>
      {used.length ? <ul>{used.map((a) => <li key={a.id}><a href={`#/applications/${a.id}`}>{state.companies[a.companyId]?.name ?? "?"} · {a.title}</a></li>)}</ul> : <p className="muted">Attach it from an application's Answers tab.</p>}
    </Drawer>
  );
}
```

`src/features/answers/AnswersPage.tsx`:
```tsx
import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { answerUsage, filterAnswers, type AnswerFilter } from "../../domain/answers";
import type { Answer } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { AnswerEditor } from "./AnswerEditor";

export function AnswersPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("updated", "desc");
  const pl = settings.pickLists;
  const [filter, setFilter] = useState<AnswerFilter>({ text: "", kindId: "", themeId: "", language: "" });
  const [newKind, setNewKind] = useState(pl.answerKinds[0]?.id ?? "answer");
  const [newTitle, setNewTitle] = useState("");
  const apps = Object.values(state.applications);
  const rows = useMemo(() => filterAnswers(Object.values(state.answers), filter), [state.answers, filter]);
  const set = (p: Partial<AnswerFilter>) => setFilter({ ...filter, ...p });
  const columns: Column<Answer>[] = [
    { key: "title", header: "Title", render: (a) => <strong>{a.title}</strong>, sortValue: (a) => a.title },
    { key: "kind", header: "Kind", render: (a) => <PickChip list={pl.answerKinds} id={a.kindId} />, sortValue: (a) => a.kindId },
    { key: "themes", header: "Themes", render: (a) => <span className="row">{a.themeIds.map((t) => <Chip key={t}>{pl.answerThemes.find((x) => x.id === t)?.label ?? t}</Chip>)}</span> },
    { key: "lang", header: "Language", render: (a) => a.language, sortValue: (a) => a.language },
    { key: "used", header: "Used by", align: "right", render: (a) => answerUsage(a.id, apps).length, sortValue: (a) => answerUsage(a.id, apps).length },
    { key: "updated", header: "Updated", render: (a) => a.updatedAt.slice(0, 10), sortValue: (a) => a.updatedAt },
  ];
  const create = () => {
    const title = newTitle.trim();
    if (!title) return;
    void run(async () => {
      const a = await repo.createAnswer({ kindId: newKind, title });
      setNewTitle("");
      navigate(`/answers/${a.id}`);
    });
  };
  return (
    <section>
      <h1>Answers</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Title, question, body, tag" /></label>
        <label className="field"><span className="field-label">Filter by kind</span><select value={filter.kindId} onChange={(e) => set({ kindId: e.target.value })}><option value="">Any</option>{pl.answerKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by theme</span><select value={filter.themeId} onChange={(e) => set({ themeId: e.target.value })}><option value="">Any</option>{pl.answerThemes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by language</span><select value={filter.language} onChange={(e) => set({ language: e.target.value })}><option value="">Any</option><option value="en">English</option><option value="ko">한국어</option><option value="other">Other</option></select></label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">New answer kind</span><select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{pl.answerKinds.filter((k) => !k.archived).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">New answer title</span><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Why this company, STAR: outage, 지원동기…" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add answer</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(a) => navigate(`/answers/${a.id}`)} selectedId={parts[0]} emptyText="No answers yet. Store the answers, STAR stories and email templates you reuse." />
      {parts[0] ? <AnswerEditor id={parts[0]} onClose={() => navigate("/answers")} /> : null}
    </section>
  );
}
```

`src/app/routes.tsx`: import `AnswersPage`; add `{ key: "answers", to: "/answers", label: "Answers" }` after assets; `PAGES.answers = AnswersPage`.

Append to `src/styles/app.css`:
```css
.markdown p { margin: 0 0 10px; max-width: 65ch; }
.markdown ul { margin: 0 0 10px 18px; padding: 0; }
.markdown h3, .markdown h4 { margin: 12px 0 6px; }
.markdown code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: var(--surface-2); padding: 1px 4px; border-radius: 4px; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(answers): answer bank with themes, safe markdown preview, copy, and usage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Interviews — week buckets, zoned time field, checklist, page, editor

**Files:**
- Create: `src/domain/interviews.ts`, `src/ui/ZonedTimeField.tsx`, `src/features/interviews/ChecklistEditor.tsx`, `src/features/interviews/InterviewEditor.tsx`, `src/features/interviews/InterviewsPage.tsx`
- Modify: `src/app/routes.tsx` (register `interviews` after `contacts`), `src/styles/app.css` (append)
- Test: `tests/domain/interviews.test.ts`, `tests/ui/ZonedTimeField.test.tsx`, `tests/features/interviews.test.tsx`

**Interfaces:**
- Consumes: `repo.createInterview/update/remove`, `makeZoned`, `toLocalInputValue`, `formatForHome`, `allTimeZones`, `MultiPick`, `RatingField`, `useSort`, `newId`.
- Produces: `Bucket` (`"today" | "thisWeek" | "nextWeek" | "later" | "unscheduled" | "past"`), `BUCKET_ORDER`, `BUCKET_LABELS`, `bucketFor(scheduledAt, homeTz, now?)`, `groupInterviews(interviews, homeTz, now?)`, `formatSlot(scheduledAt, homeTz)`, `roundsFor(applicationId, interviews)`; `ZonedTimeField({ label, value, homeTz, onCommit, disabled? })` with inputs named `"<label> date and time"` and `"<label> timezone"`; `ChecklistEditor({ items, onChange, disabled? })`; `InterviewEditor({ id, onClose })`; `InterviewsPage`; route key `interviews`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/interviews.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildInterview } from "../../src/domain/factories";
import { bucketFor, formatSlot, groupInterviews, roundsFor } from "../../src/domain/interviews";

const NOW = "2026-09-11T00:00:00.000Z";
// Friday 2026-09-11 08:00 in Toronto
const now = DateTime.fromISO("2026-09-11T12:00:00Z", { zone: "utc" });
const z = (at: string, tz = "America/Toronto") => ({ at, tz });

describe("bucketFor", () => {
  it("assigns past, today, this week, next week, later and unscheduled in the home zone", () => {
    expect(bucketFor(z("2026-09-10T20:00:00.000Z"), "America/Toronto", now)).toBe("past");
    expect(bucketFor(z("2026-09-11T11:00:00.000Z"), "America/Toronto", now)).toBe("past");
    expect(bucketFor(z("2026-09-11T20:00:00.000Z"), "America/Toronto", now)).toBe("today");
    expect(bucketFor(z("2026-09-13T15:00:00.000Z"), "America/Toronto", now)).toBe("thisWeek");
    expect(bucketFor(z("2026-09-15T15:00:00.000Z"), "America/Toronto", now)).toBe("nextWeek");
    expect(bucketFor(z("2026-10-01T15:00:00.000Z"), "America/Toronto", now)).toBe("later");
    expect(bucketFor(undefined, "America/Toronto", now)).toBe("unscheduled");
  });
});

describe("groupInterviews / roundsFor / formatSlot", () => {
  const ivs = [
    buildInterview({ applicationId: "app_1", roundTypeId: "coding", scheduledAt: z("2026-09-15T15:00:00.000Z") }, "iv_next", NOW),
    buildInterview({ applicationId: "app_1", roundTypeId: "recruiter-screen", scheduledAt: z("2026-09-10T20:00:00.000Z") }, "iv_past", NOW),
    buildInterview({ applicationId: "app_2", roundTypeId: "oa" }, "iv_none", "2026-09-12T00:00:00.000Z"),
    buildInterview({ applicationId: "app_1", roundTypeId: "system-design", scheduledAt: z("2026-09-11T20:00:00.000Z") }, "iv_today", NOW),
  ];
  it("groups and orders upcoming ascending, past descending", () => {
    const g = groupInterviews(ivs, "America/Toronto", now);
    expect(g.today.map((i) => i.id)).toEqual(["iv_today"]);
    expect(g.nextWeek.map((i) => i.id)).toEqual(["iv_next"]);
    expect(g.past.map((i) => i.id)).toEqual(["iv_past"]);
    expect(g.unscheduled.map((i) => i.id)).toEqual(["iv_none"]);
  });
  it("lists an application's rounds scheduled first, then unscheduled", () => {
    expect(roundsFor("app_1", ivs).map((i) => i.id)).toEqual(["iv_past", "iv_today", "iv_next"]);
    expect(roundsFor("app_2", ivs).map((i) => i.id)).toEqual(["iv_none"]);
  });
  it("formats a slot in the home zone with the source zone when different", () => {
    expect(formatSlot(z("2026-09-15T05:00:00.000Z", "Asia/Seoul"), "America/Toronto")).toMatch(/2026-09-15 .*01:00.*14:00.*there/);
    expect(formatSlot(undefined, "America/Toronto")).toBe("Not scheduled");
  });
});
```

`tests/ui/ZonedTimeField.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ZonedTimeField } from "../../src/ui/ZonedTimeField";

describe("ZonedTimeField", () => {
  it("commits a UTC instant with the chosen zone and clears", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<ZonedTimeField label="Scheduled" value={undefined} homeTz="America/Toronto" onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("Scheduled timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Scheduled date and time"), { target: { value: "2026-10-01T14:00" } });
    expect(onCommit).toHaveBeenLastCalledWith({ at: "2026-10-01T05:00:00.000Z", tz: "Asia/Seoul" });
    rerender(<ZonedTimeField label="Scheduled" value={{ at: "2026-10-01T05:00:00.000Z", tz: "Asia/Seoul" }} homeTz="America/Toronto" onCommit={onCommit} />);
    expect((screen.getByLabelText("Scheduled date and time") as HTMLInputElement).value).toBe("2026-10-01T14:00");
    expect(screen.getByText(/01:00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });
});
```

`tests/features/interviews.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";
import type { Interview } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "interviewing", maxStageRank: 6 }, "app_1", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Interviews" });
  return db;
}

describe("Interviews", () => {
  it("adds a round for an application from the toolbar", async () => {
    const db = await open("#/interviews");
    fireEvent.change(screen.getByLabelText("New round application"), { target: { value: "app_1" } });
    fireEvent.change(screen.getByLabelText("New round type"), { target: { value: "system-design" } });
    fireEvent.click(screen.getByRole("button", { name: "Add round" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("interviews").get()).size).toBe(1));
    const iv = (await db.collection("interviews").get()).docs[0].data() as unknown as Interview;
    expect(iv).toMatchObject({ applicationId: "app_1", roundTypeId: "system-design", outcome: "pending" });
    expect(window.location.hash).toMatch(/^#\/interviews\/iv_/);
  });

  it("schedules in Seoul time, picks interviewers, and manages the checklist", async () => {
    const db = await open("#/interviews/iv_1", async (d) => {
      await put(d, "contacts/ct_1", buildContact({ name: "Dana Kim", relationshipId: "interviewer", companyId: "co_1" }, "ct_1", NOW));
      await put(d, "interviews/iv_1", buildInterview({ applicationId: "app_1", roundTypeId: "coding" }, "iv_1", NOW));
    });
    await screen.findByRole("dialog");
    const stored = async () => (await db.doc("interviews/iv_1").get()).data() as unknown as Interview;
    fireEvent.change(screen.getByLabelText("Scheduled timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Scheduled date and time"), { target: { value: "2026-10-01T14:00" } });
    await waitFor(async () => expect((await stored()).scheduledAt).toEqual({ at: "2026-10-01T05:00:00.000Z", tz: "Asia/Seoul" }));
    fireEvent.click(screen.getByRole("button", { name: "Dana Kim" }));
    await waitFor(async () => expect((await stored()).interviewerContactIds).toEqual(["ct_1"]));
    fireEvent.change(screen.getByLabelText("New checklist item"), { target: { value: "Review consistent hashing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(async () => expect((await stored()).prepChecklist.map((c) => c.text)).toEqual(["Review consistent hashing"]));
    fireEvent.click(screen.getByLabelText("Review consistent hashing"));
    await waitFor(async () => expect((await stored()).prepChecklist[0].done).toBe(true));
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "passed" } });
    await waitFor(async () => expect((await stored()).outcome).toBe("passed"));
  });

  it("shows rounds under their week bucket and deletes after confirmation", async () => {
    const db = await open("#/interviews", async (d) => {
      await put(d, "interviews/iv_1", buildInterview({ applicationId: "app_1", roundTypeId: "coding" }, "iv_1", NOW));
    });
    expect(await screen.findByRole("heading", { name: "Not scheduled" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Coding interview/ }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete round" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.doc("interviews/iv_1").get()).exists).toBe(false));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/interviews.test.ts tests/ui/ZonedTimeField.test.tsx tests/features/interviews.test.tsx`
Expected: FAIL — modules not found; no "Interviews" heading.

- [ ] **Step 3: Implement**

`src/domain/interviews.ts`:
```ts
import { DateTime } from "luxon";
import { formatForHome } from "./dates";
import type { Interview, ZonedInstant } from "./types";

export type Bucket = "today" | "thisWeek" | "nextWeek" | "later" | "unscheduled" | "past";
export const BUCKET_ORDER: Bucket[] = ["today", "thisWeek", "nextWeek", "later", "unscheduled", "past"];
export const BUCKET_LABELS: Record<Bucket, string> = {
  today: "Today", thisWeek: "This week", nextWeek: "Next week", later: "Later", unscheduled: "Not scheduled", past: "Past",
};

/** Buckets by the home-zone calendar: anything before now is past; weeks end on Sunday in the home zone. */
export function bucketFor(scheduledAt: ZonedInstant | undefined, homeTz: string, now: DateTime = DateTime.utc()): Bucket {
  if (!scheduledAt) return "unscheduled";
  const t = DateTime.fromISO(scheduledAt.at, { zone: "utc" }).setZone(homeTz);
  const local = now.setZone(homeTz);
  if (!t.isValid || t < local) return "past";
  if (t.hasSame(local, "day")) return "today";
  const weekEnd = local.endOf("week");
  if (t <= weekEnd) return "thisWeek";
  if (t <= weekEnd.plus({ weeks: 1 })) return "nextWeek";
  return "later";
}

export function groupInterviews(interviews: Interview[], homeTz: string, now?: DateTime): Record<Bucket, Interview[]> {
  const groups: Record<Bucket, Interview[]> = { today: [], thisWeek: [], nextWeek: [], later: [], unscheduled: [], past: [] };
  for (const i of interviews) groups[bucketFor(i.scheduledAt, homeTz, now)].push(i);
  const byTime = (a: Interview, b: Interview) => (a.scheduledAt?.at ?? "").localeCompare(b.scheduledAt?.at ?? "");
  for (const b of BUCKET_ORDER) {
    if (b === "past") groups[b].sort((a, c) => byTime(c, a));
    else if (b === "unscheduled") groups[b].sort((a, c) => a.createdAt.localeCompare(c.createdAt));
    else groups[b].sort(byTime);
  }
  return groups;
}

/** An application's rounds: scheduled ones in time order, then unscheduled by creation. */
export function roundsFor(applicationId: string, interviews: Interview[]): Interview[] {
  return interviews
    .filter((i) => i.applicationId === applicationId)
    .sort((a, b) => (a.scheduledAt?.at ?? "~").localeCompare(b.scheduledAt?.at ?? "~") || a.createdAt.localeCompare(b.createdAt));
}

export function formatSlot(scheduledAt: ZonedInstant | undefined, homeTz: string): string {
  if (!scheduledAt) return "Not scheduled";
  const f = formatForHome(scheduledAt, homeTz);
  return f.source ? `${f.home} · ${f.source} there` : f.home;
}
```

`src/ui/ZonedTimeField.tsx`:
```tsx
import { useEffect, useState } from "react";
import { formatForHome, makeZoned, toLocalInputValue } from "../domain/dates";
import type { ZonedInstant } from "../domain/types";
import { allTimeZones } from "./timeZones";

interface Props {
  label: string;
  value: ZonedInstant | undefined;
  homeTz: string;
  onCommit: (value: ZonedInstant | undefined) => void;
  disabled?: boolean;
}

/** A timed instant with its source zone; stores UTC + zone, shows the home-zone time beside it (spec §4). */
export function ZonedTimeField({ label, value, homeTz, onCommit, disabled }: Props) {
  const at = value?.at;
  const valueTz = value?.tz;
  const [tz, setTz] = useState(valueTz ?? homeTz);
  const [draft, setDraft] = useState(at && valueTz ? toLocalInputValue(at, valueTz, false) : "");
  useEffect(() => {
    setTz(valueTz ?? homeTz);
    setDraft(at && valueTz ? toLocalInputValue(at, valueTz, false) : "");
  }, [at, valueTz, homeTz]);
  const commit = (d: string, z: string) => {
    if (!d) {
      if (value) onCommit(undefined);
      return;
    }
    try {
      onCommit(makeZoned(d, z));
    } catch {
      /* partial input while typing */
    }
  };
  const shown = value ? formatForHome(value, homeTz) : null;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="row">
        <input aria-label={`${label} date and time`} type="datetime-local" value={draft} disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value, tz); }} />
        <select aria-label={`${label} timezone`} value={tz} disabled={disabled} onChange={(e) => { setTz(e.target.value); commit(draft, e.target.value); }}>
          {allTimeZones().map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        {value ? <button type="button" className="btn ghost" disabled={disabled} onClick={() => onCommit(undefined)}>Clear</button> : null}
      </div>
      {shown ? <span className="field-hint">{shown.home}{shown.source ? ` · ${shown.source} there` : ""}</span> : null}
    </div>
  );
}
```

`src/features/interviews/ChecklistEditor.tsx`:
```tsx
import { useState } from "react";
import { newId } from "../../domain/ids";
import type { ChecklistItem } from "../../domain/types";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  disabled?: boolean;
}

export function ChecklistEditor({ items, onChange, disabled }: Props) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId("ck"), text, done: false }]);
    setDraft("");
  };
  return (
    <div className="field">
      <span className="field-label">Prep checklist</span>
      {items.length ? (
        <ul className="checklist">
          {items.map((it) => (
            <li key={it.id}>
              <label className="row">
                <input type="checkbox" checked={it.done} disabled={disabled} onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, done: e.target.checked } : x)))} />
                <span className={it.done ? "done" : undefined}>{it.text}</span>
              </label>
              <button type="button" className="btn ghost" aria-label={`Remove ${it.text}`} disabled={disabled} onClick={() => onChange(items.filter((x) => x.id !== it.id))}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <input aria-label="New checklist item" value={draft} disabled={disabled} placeholder="Re-read the job description, review system design basics…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn" onClick={add} disabled={disabled}>Add item</button>
      </div>
    </div>
  );
}
```

`src/features/interviews/InterviewEditor.tsx`:
```tsx
import { formatSlot } from "../../domain/interviews";
import type { Interview, Rating } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { MultiPick } from "../../ui/MultiPick";
import { DateField, NumberField, RatingField, SelectField, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";
import { ZonedTimeField } from "../../ui/ZonedTimeField";
import { ChecklistEditor } from "./ChecklistEditor";

const FORMATS = [{ id: "video", label: "Video call" }, { id: "phone", label: "Phone" }, { id: "onsite", label: "Onsite" }, { id: "take_home", label: "Take-home" }, { id: "other", label: "Other" }];
const OUTCOMES = [{ id: "pending", label: "Pending" }, { id: "passed", label: "Passed" }, { id: "failed", label: "Failed" }, { id: "cancelled", label: "Cancelled" }];

export function InterviewEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const iv = state.interviews[id];
  if (!iv) return <Drawer open title="Round not found" onClose={onClose}><p className="muted">This interview round no longer exists.</p></Drawer>;
  const app = state.applications[iv.applicationId];
  const company = app ? state.companies[app.companyId] : undefined;
  const ro = repo.readOnly;
  const pl = settings.pickLists;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<Interview>) => run(() => repo.update("interviews", id, p));
  const contacts = Object.values(state.contacts)
    .sort((a, b) => Number(b.companyId === app?.companyId) - Number(a.companyId === app?.companyId) || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, label: c.companyId && c.companyId !== app?.companyId ? `${c.name} (${state.companies[c.companyId]?.name ?? "?"})` : c.name }));
  const roundLabel = pl.roundTypes.find((r) => r.id === iv.roundTypeId)?.label ?? iv.roundTypeId;
  const remove = async () => {
    const ok = await confirm({ title: `Delete this ${roundLabel} round?`, message: "Its notes and checklist are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("interviews", id)))) onClose();
  };
  return (
    <Drawer open wide onClose={onClose}
      title={<span>{roundLabel} <span className="muted">·</span> {app ? <a href={`#/applications/${app.id}`}>{company?.name ?? "?"} · {app.title}</a> : <span className="muted">(deleted application)</span>}</span>}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" onClick={() => void remove()} disabled={ro}>Delete round</button></>}>
      <div className="grid-2">
        <SelectField label="Round type" value={iv.roundTypeId} options={pl.roundTypes} onChange={(v) => { if (v) void patch({ roundTypeId: v }); }} allowEmpty={false} disabled={ro} />
        <SelectField label="Format" value={iv.format} options={FORMATS} onChange={(v) => { if (v) void patch({ format: v as Interview["format"] }); }} allowEmpty={false} disabled={ro} />
      </div>
      <ZonedTimeField label="Scheduled" value={iv.scheduledAt} homeTz={settings.homeTz} onCommit={(v) => void patch({ scheduledAt: v })} disabled={ro} />
      <p className="muted">{formatSlot(iv.scheduledAt, settings.homeTz)}</p>
      <div className="grid-3">
        <NumberField label="Duration (minutes)" value={iv.durationMin ?? null} min={5} step={5} onCommit={(v) => patch({ durationMin: v ?? undefined })} disabled={ro} />
        <TextField label="Location" value={iv.location ?? ""} onCommit={(v) => patch({ location: opt(v) })} placeholder="Office address or 'remote'" disabled={ro} />
        <TextField label="Meeting link" type="url" value={iv.meetingUrl ?? ""} onCommit={(v) => patch({ meetingUrl: opt(v) })} disabled={ro} />
      </div>
      <MultiPick label="Interviewers" options={contacts} value={iv.interviewerContactIds} onChange={(v) => void patch({ interviewerContactIds: v })} disabled={ro} />
      <TextField label="Other interviewer names" value={iv.interviewerNames ?? ""} onCommit={(v) => patch({ interviewerNames: opt(v) })} placeholder="Names not in Contacts" disabled={ro} />
      <ChecklistEditor items={iv.prepChecklist} onChange={(items) => void patch({ prepChecklist: items })} disabled={ro} />

      <div className="section">
        <h3>Afterwards</h3>
        <TextArea label="Questions asked" rows={6} value={iv.questionsAsked} onCommit={(v) => patch({ questionsAsked: v })} placeholder="What they asked, what you answered, what you'd change" disabled={ro} />
        <div className="grid-3">
          <RatingField label="Self rating" value={iv.selfRating} onChange={(v) => void patch({ selfRating: v as Rating | null })} disabled={ro} />
          <SelectField label="Outcome" value={iv.outcome} options={OUTCOMES} onChange={(v) => { if (v) void patch({ outcome: v as Interview["outcome"] }); }} allowEmpty={false} disabled={ro} />
          <DateField label="Thank-you sent on" value={iv.thankYouSentAt ?? ""} onCommit={(v) => void patch({ thankYouSentAt: opt(v) })} disabled={ro} />
        </div>
      </div>
      <TextArea label="Notes" rows={5} value={iv.notes} onCommit={(v) => patch({ notes: v })} disabled={ro} />
    </Drawer>
  );
}
```

`src/features/interviews/InterviewsPage.tsx`:
```tsx
import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { BUCKET_LABELS, BUCKET_ORDER, formatSlot, groupInterviews } from "../../domain/interviews";
import type { ColorToken, Interview } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { InterviewEditor } from "./InterviewEditor";

const OUTCOME_COLOR: Record<Interview["outcome"], ColorToken> = { pending: "gray", passed: "green", failed: "red", cancelled: "amber" };

export function InterviewsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("when");
  const pl = settings.pickLists;
  const openStatuses = new Set(pl.statuses.filter((s) => s.group === "open").map((s) => s.id));
  const openApps = Object.values(state.applications).filter((a) => openStatuses.has(a.statusId));
  const [newApp, setNewApp] = useState("");
  const [newType, setNewType] = useState(pl.roundTypes[0]?.id ?? "");
  const all = Object.values(state.interviews);
  const groups = useMemo(() => groupInterviews(all, settings.homeTz), [all, settings.homeTz]);
  const appLabel = (i: Interview) => { const a = state.applications[i.applicationId]; return a ? `${state.companies[a.companyId]?.name ?? "?"} · ${a.title}` : "(deleted application)"; };
  const columns: Column<Interview>[] = [
    { key: "when", header: "When", render: (i) => formatSlot(i.scheduledAt, settings.homeTz), sortValue: (i) => i.scheduledAt?.at ?? null },
    { key: "app", header: "Application", render: (i) => appLabel(i), sortValue: (i) => appLabel(i) },
    { key: "type", header: "Round", render: (i) => <PickChip list={pl.roundTypes} id={i.roundTypeId} />, sortValue: (i) => i.roundTypeId },
    { key: "outcome", header: "Outcome", render: (i) => <Chip color={OUTCOME_COLOR[i.outcome]}>{i.outcome}</Chip>, sortValue: (i) => i.outcome },
    { key: "prep", header: "Prep", render: (i) => (i.prepChecklist.length ? `${i.prepChecklist.filter((c) => c.done).length}/${i.prepChecklist.length}` : <span className="muted">—</span>) },
  ];
  const create = () => {
    if (!newApp || !newType) return;
    void run(async () => {
      const iv = await repo.createInterview({ applicationId: newApp, roundTypeId: newType });
      navigate(`/interviews/${iv.id}`);
    });
  };
  return (
    <section>
      <h1>Interviews</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">New round application</span>
          <select value={newApp} onChange={(e) => setNewApp(e.target.value)}>
            <option value="">Choose an open application</option>
            {openApps.map((a) => <option key={a.id} value={a.id}>{state.companies[a.companyId]?.name ?? "?"} · {a.title}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">New round type</span>
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>{pl.roundTypes.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </label>
        <button type="button" className="btn primary" onClick={create} disabled={!newApp || repo.readOnly}>Add round</button>
      </div>
      {all.length === 0 ? <p className="empty">No interview rounds yet. Add one for an open application.</p> : null}
      {BUCKET_ORDER.filter((b) => groups[b].length > 0).map((b) => (
        <div key={b} className="section">
          <h2>{BUCKET_LABELS[b]}</h2>
          <ul className="slots">
            {groups[b].map((i) => (
              <li key={i.id}>
                <button type="button" className="slot" onClick={() => navigate(`/interviews/${i.id}`)}>
                  <span className="slot-when">{formatSlot(i.scheduledAt, settings.homeTz)}</span>
                  <span>{appLabel(i)}</span>
                  <span className="row"><PickChip list={pl.roundTypes} id={i.roundTypeId} /><Chip color={OUTCOME_COLOR[i.outcome]}>{i.outcome}</Chip></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {all.length ? <><h2>All rounds</h2><Table rows={all} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(i) => navigate(`/interviews/${i.id}`)} selectedId={parts[0]} /></> : null}
      {parts[0] ? <InterviewEditor id={parts[0]} onClose={() => navigate("/interviews")} /> : null}
    </section>
  );
}
```

`src/app/routes.tsx`: import `InterviewsPage`; add `{ key: "interviews", to: "/interviews", label: "Interviews" }` right after contacts (before assets); `PAGES.interviews = InterviewsPage`.

Append to `src/styles/app.css`:
```css
.slots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.slot { font: inherit; text-align: left; width: 100%; display: grid; grid-template-columns: minmax(180px, 1fr) 2fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); cursor: pointer; }
.slot:hover { background: var(--surface-2); }
.slot-when { font-variant-numeric: tabular-nums; }
.checklist { list-style: none; margin: 0 0 8px; padding: 0; }
.checklist li { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border); }
.checklist .done { text-decoration: line-through; color: var(--text-muted); }
@media (max-width: 720px) { .slot { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(interviews): rounds with zoned scheduling, interviewers, prep checklist, week buckets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Prep — coding, system design and behavioral items with attempts

**Files:**
- Create: `src/domain/prep.ts`, `src/features/prep/PrepPage.tsx`, `src/features/prep/PrepEditor.tsx`
- Modify: `src/app/routes.tsx` (register `prep` after `answers`)
- Test: `tests/domain/prep.test.ts`, `tests/features/prep.test.tsx`

**Interfaces:**
- Consumes: `repo.createPrep/update/remove`, `todayIso`, `Markdown`, `TagInput`, `RatingField`, `useSort`.
- Produces: `PrepFilter { text, kindId, pattern, difficulty }`, `filterPrep(items, filter)`, `logAttempt(item, today): Pick<PrepItem, "attempts" | "lastAttemptedAt">`, `allPatterns(items): string[]`; `PrepPage`, `PrepEditor({id, onClose})`; route key `prep`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/prep.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildPrep } from "../../src/domain/factories";
import { allPatterns, filterPrep, logAttempt } from "../../src/domain/prep";

const NOW = "2026-09-11T00:00:00.000Z";
const items = [
  buildPrep({ kindId: "coding", title: "Two Sum", patterns: ["hash map"], difficulty: "easy", companyTags: ["Shopify"] }, "pr_1", NOW),
  buildPrep({ kindId: "coding", title: "LRU Cache", patterns: ["hash map", "linked list"], difficulty: "medium" }, "pr_2", NOW),
  buildPrep({ kindId: "system-design", title: "Rate limiter", patterns: ["distributed"], difficulty: null }, "pr_3", NOW),
];
const f = { text: "", kindId: "", pattern: "", difficulty: "" };

describe("prep domain", () => {
  it("filters by text (title, patterns, company tags), kind, pattern and difficulty", () => {
    expect(filterPrep(items, { ...f, text: "shopify" }).map((p) => p.id)).toEqual(["pr_1"]);
    expect(filterPrep(items, { ...f, kindId: "system-design" }).map((p) => p.id)).toEqual(["pr_3"]);
    expect(filterPrep(items, { ...f, pattern: "hash map" }).map((p) => p.id)).toEqual(["pr_1", "pr_2"]);
    expect(filterPrep(items, { ...f, difficulty: "medium" }).map((p) => p.id)).toEqual(["pr_2"]);
  });
  it("lists unique patterns sorted", () => {
    expect(allPatterns(items)).toEqual(["distributed", "hash map", "linked list"]);
  });
  it("logs an attempt", () => {
    expect(logAttempt(items[0], "2026-09-13")).toEqual({ attempts: 1, lastAttemptedAt: "2026-09-13" });
  });
});
```

`tests/features/prep.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { todayIso } from "../../src/domain/dates";
import { buildPrep } from "../../src/domain/factories";
import type { PrepItem } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Prep" });
  return db;
}

describe("Prep", () => {
  it("creates an item and logs an attempt", async () => {
    const db = await open("#/prep");
    fireEvent.change(screen.getByLabelText("New prep title"), { target: { value: "Two Sum" } });
    fireEvent.click(screen.getByRole("button", { name: "Add prep item" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Log attempt" }));
    await waitFor(async () => {
      const p = (await db.collection("prep").get()).docs[0].data() as unknown as PrepItem;
      expect(p.attempts).toBe(1);
      expect(p.lastAttemptedAt).toBe(todayIso("America/Toronto"));
    });
  });

  it("filters by kind and edits confidence", async () => {
    const db = await open("#/prep/pr_2", async (d) => {
      await put(d, "prep/pr_1", buildPrep({ kindId: "coding", title: "Two Sum" }, "pr_1", NOW));
      await put(d, "prep/pr_2", buildPrep({ kindId: "system-design", title: "Rate limiter" }, "pr_2", NOW));
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Confidence 4" }));
    await waitFor(async () => expect(((await db.doc("prep/pr_2").get()).data() as unknown as PrepItem).confidence).toBe(4));
    fireEvent.change(screen.getByLabelText("Filter by kind"), { target: { value: "coding" } });
    expect(screen.queryByText("Rate limiter", { selector: "td strong" })).toBeNull();
    expect(screen.getByText("Two Sum", { selector: "td strong" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/prep.test.ts tests/features/prep.test.tsx`
Expected: FAIL — module not found; no "Prep" heading.

- [ ] **Step 3: Implement**

`src/domain/prep.ts`:
```ts
import type { PrepItem } from "./types";

export interface PrepFilter {
  text: string;
  kindId: string;
  pattern: string;
  difficulty: string;
}

export function filterPrep(items: PrepItem[], f: PrepFilter): PrepItem[] {
  const needle = f.text.trim().toLowerCase();
  return items.filter((p) => {
    if (f.kindId && p.kindId !== f.kindId) return false;
    if (f.pattern && !p.patterns.includes(f.pattern)) return false;
    if (f.difficulty && p.difficulty !== f.difficulty) return false;
    if (needle && !`${p.title} ${p.patterns.join(" ")} ${p.companyTags.join(" ")}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function allPatterns(items: PrepItem[]): string[] {
  return [...new Set(items.flatMap((p) => p.patterns))].sort((a, b) => a.localeCompare(b));
}

export function logAttempt(item: PrepItem, today: string): Pick<PrepItem, "attempts" | "lastAttemptedAt"> {
  return { attempts: item.attempts + 1, lastAttemptedAt: today };
}
```

`src/features/prep/PrepEditor.tsx`:
```tsx
import { useState } from "react";
import { todayIso } from "../../domain/dates";
import { allPatterns, logAttempt } from "../../domain/prep";
import type { PrepItem, Rating } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { Markdown } from "../../ui/Markdown";
import { RatingField, SelectField, TagInput, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

const DIFFICULTIES = [{ id: "easy", label: "Easy" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Hard" }];

export function PrepEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [preview, setPreview] = useState(false);
  const item = state.prep[id];
  if (!item) return <Drawer open title="Prep item not found" onClose={onClose}><p className="muted">This item no longer exists.</p></Drawer>;
  const ro = repo.readOnly;
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<PrepItem>) => run(() => repo.update("prep", id, p));
  const remove = async () => {
    const ok = await confirm({ title: `Delete "${item.title}"?`, message: "Its notes are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("prep", id)))) onClose();
  };
  return (
    <Drawer open title={item.title} onClose={onClose}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" onClick={() => void remove()} disabled={ro}>Delete prep item</button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={item.kindId} options={settings.pickLists.prepKinds} onChange={(v) => { if (v) void patch({ kindId: v }); }} allowEmpty={false} disabled={ro} />
        <TextField label="Title" value={item.title} onCommit={(v) => (v.trim() ? patch({ title: v.trim() }) : false)} disabled={ro} />
        <TextField label="Source URL" type="url" value={item.sourceUrl ?? ""} onCommit={(v) => patch({ sourceUrl: opt(v) })} placeholder="https://leetcode.com/problems/…" disabled={ro} />
        <SelectField label="Difficulty" value={item.difficulty ?? ""} options={DIFFICULTIES} onChange={(v) => void patch({ difficulty: (v || null) as PrepItem["difficulty"] })} disabled={ro} />
      </div>
      <TagInput label="Patterns" value={item.patterns} onChange={(v) => void patch({ patterns: v })} suggestions={allPatterns(Object.values(state.prep))} placeholder="two pointers, BFS, consistent hashing…" disabled={ro} />
      <TagInput label="Company tags" value={item.companyTags} onChange={(v) => void patch({ companyTags: v })} suggestions={Object.values(state.companies).map((c) => c.name)} disabled={ro} />
      <div className="row" style={{ alignItems: "end" }}>
        <RatingField label="Confidence" value={item.confidence} onChange={(v) => void patch({ confidence: v as Rating | null })} disabled={ro} />
        <div className="field">
          <span className="field-label">Attempts</span>
          <span>{item.attempts}{item.lastAttemptedAt ? <span className="muted"> · last {item.lastAttemptedAt}</span> : null}</span>
        </div>
        <button type="button" className="btn" disabled={ro} onClick={() => void patch(logAttempt(item, todayIso(settings.homeTz)))}>Log attempt</button>
      </div>
      <div className="row">
        <button type="button" className={preview ? "btn" : "btn primary"} aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</button>
        <button type="button" className={preview ? "btn primary" : "btn"} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
      </div>
      {preview ? <div className="section"><Markdown text={item.notes} /></div> : (
        <TextArea label="Notes" rows={12} value={item.notes} onCommit={(v) => patch({ notes: v })} placeholder="Approach, complexity, traps, the story you'd tell" disabled={ro} />
      )}
    </Drawer>
  );
}
```

`src/features/prep/PrepPage.tsx`:
```tsx
import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { allPatterns, filterPrep, type PrepFilter } from "../../domain/prep";
import type { PrepItem } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { useSort } from "../../ui/useSort";
import { PrepEditor } from "./PrepEditor";

export function PrepPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const sort = useSort("updated", "desc");
  const pl = settings.pickLists;
  const [filter, setFilter] = useState<PrepFilter>({ text: "", kindId: "", pattern: "", difficulty: "" });
  const [newKind, setNewKind] = useState(pl.prepKinds[0]?.id ?? "coding");
  const [newTitle, setNewTitle] = useState("");
  const all = Object.values(state.prep);
  const rows = useMemo(() => filterPrep(all, filter), [all, filter]);
  const set = (p: Partial<PrepFilter>) => setFilter({ ...filter, ...p });
  const columns: Column<PrepItem>[] = [
    { key: "title", header: "Title", render: (p) => <strong>{p.title}</strong>, sortValue: (p) => p.title },
    { key: "kind", header: "Kind", render: (p) => <PickChip list={pl.prepKinds} id={p.kindId} />, sortValue: (p) => p.kindId },
    { key: "patterns", header: "Patterns", render: (p) => <span className="row">{p.patterns.map((x) => <Chip key={x}>{x}</Chip>)}</span> },
    { key: "difficulty", header: "Difficulty", render: (p) => p.difficulty ?? <span className="muted">—</span>, sortValue: (p) => ({ easy: 1, medium: 2, hard: 3 }[p.difficulty ?? ""] ?? null) },
    { key: "confidence", header: "Confidence", align: "right", render: (p) => (p.confidence == null ? <span className="muted">—</span> : `${p.confidence}/5`), sortValue: (p) => p.confidence },
    { key: "attempts", header: "Attempts", align: "right", render: (p) => p.attempts, sortValue: (p) => p.attempts },
    { key: "last", header: "Last attempted", render: (p) => p.lastAttemptedAt ?? <span className="muted">never</span>, sortValue: (p) => p.lastAttemptedAt ?? null },
    { key: "updated", header: "Updated", render: (p) => p.updatedAt.slice(0, 10), sortValue: (p) => p.updatedAt },
  ];
  const create = () => {
    const title = newTitle.trim();
    if (!title) return;
    void run(async () => {
      const p = await repo.createPrep({ kindId: newKind, title });
      setNewTitle("");
      navigate(`/prep/${p.id}`);
    });
  };
  return (
    <section>
      <h1>Prep</h1>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Title, pattern, company" /></label>
        <label className="field"><span className="field-label">Filter by kind</span><select value={filter.kindId} onChange={(e) => set({ kindId: e.target.value })}><option value="">Any</option>{pl.prepKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by pattern</span><select value={filter.pattern} onChange={(e) => set({ pattern: e.target.value })}><option value="">Any</option>{allPatterns(all).map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className="field"><span className="field-label">Filter by difficulty</span><select value={filter.difficulty} onChange={(e) => set({ difficulty: e.target.value })}><option value="">Any</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">New prep kind</span><select value={newKind} onChange={(e) => setNewKind(e.target.value)}>{pl.prepKinds.filter((k) => !k.archived).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label className="field"><span className="field-label">New prep title</span><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Two Sum, Design a rate limiter, 'Tell me about a conflict'…" onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add prep item</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.onSort} onRowClick={(p) => navigate(`/prep/${p.id}`)} selectedId={parts[0]} emptyText="No prep items yet. Track coding problems, system design topics and behavioral stories here." />
      {parts[0] ? <PrepEditor id={parts[0]} onClose={() => navigate("/prep")} /> : null}
    </section>
  );
}
```

`src/app/routes.tsx`: import `PrepPage`; add `{ key: "prep", to: "/prep", label: "Prep" }` after answers; `PAGES.prep = PrepPage`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(prep): prep library with patterns, difficulty, confidence and attempt log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Profile — form-fill sheet, list editors, salary expectations, work authorization

**Files:**
- Create: `src/ui/RowsEditor.tsx`, `src/domain/profile.ts`, `src/features/profile/ProfilePage.tsx`, `src/features/profile/WorkAuthSection.tsx`
- Modify: `src/app/routes.tsx` (register `profile` after `prep`), `src/styles/app.css` (append)
- Test: `tests/domain/profile.test.ts`, `tests/ui/RowsEditor.test.tsx`, `tests/features/profile.test.tsx`

**Interfaces:**
- Consumes: `useProfile`, `repo.saveProfile`, `copyText`, fields, `TriStateField` (with `disabled`).
- Produces: `RowsEditor<T>({ label, rows, columns, blank, onChange, disabled?, addLabel?, rowLabel? })` where a column is `{ key, label, type?: "text" | "date", placeholder? }` or `{ key, label, type: "select", options }` and every input is labelled `"<row name> <column label>"` (row name defaults to `"<label> <n>"`); `profileSectionText(profile, section: "identity" | "education" | "employment" | "links")`; `ProfilePage`; `WorkAuthSection({ countryId, countryLabel })`; route key `profile`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/profile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultProfile } from "../../src/domain/defaults";
import { profileSectionText } from "../../src/domain/profile";

const NOW = "2026-09-11T00:00:00.000Z";

describe("profileSectionText", () => {
  const p = { ...defaultProfile(NOW), name: "Ada Lovelace", email: "me@example.com", phones: [{ label: "CA", value: "+1 416 555 0100" }],
    links: [{ label: "GitHub", url: "https://github.com/x" }],
    education: [{ school: "UofT", degree: "BSc", field: "CS", start: "2019-09", end: "2023-05", gpa: "3.8" }],
    employment: [{ company: "Analytical Engines", title: "Founder", start: "2023-06", summary: "Built the platform." }] };
  it("renders identity, education, employment and links as plain text lines", () => {
    expect(profileSectionText(p, "identity")).toBe("Ada Lovelace\nme@example.com\nCA: +1 416 555 0100");
    expect(profileSectionText(p, "education")).toBe("UofT — BSc, CS (2019-09 – 2023-05), GPA 3.8");
    expect(profileSectionText(p, "employment")).toBe("Analytical Engines — Founder (2023-06 – present)\nBuilt the platform.");
    expect(profileSectionText(p, "links")).toBe("GitHub: https://github.com/x");
  });
});
```

`tests/ui/RowsEditor.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RowsEditor } from "../../src/ui/RowsEditor";

type Row = { label: string; value: string };

describe("RowsEditor", () => {
  it("adds, edits and removes rows through labelled inputs", () => {
    const onChange = vi.fn();
    const rows: Row[] = [{ label: "CA", value: "" }];
    render(<RowsEditor<Row> label="Phone numbers" rows={rows} columns={[{ key: "label", label: "Label" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={onChange} addLabel="Add phone" />);
    const number = screen.getByLabelText("Phone numbers 1 Number");
    fireEvent.change(number, { target: { value: "+1 416" } });
    fireEvent.blur(number);
    expect(onChange).toHaveBeenLastCalledWith([{ label: "CA", value: "+1 416" }]);
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    expect(onChange).toHaveBeenLastCalledWith([{ label: "CA", value: "" }, { label: "", value: "" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone numbers 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
```

`tests/features/profile.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import type { Profile } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open() {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  window.location.hash = "#/profile";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Profile" });
  const stored = async () => (await db.doc("profile/main").get()).data() as unknown as Profile;
  return { db, stored };
}

describe("Profile", () => {
  it("saves identity fields and an education row", async () => {
    const { stored } = await open();
    const name = screen.getByLabelText("Full name");
    fireEvent.change(name, { target: { value: "Ada Lovelace" } });
    fireEvent.blur(name);
    await waitFor(async () => expect((await stored()).name).toBe("Ada Lovelace"));
    fireEvent.click(screen.getByRole("button", { name: "Add education" }));
    const school = await screen.findByLabelText("Education 1 School");
    fireEvent.change(school, { target: { value: "UofT" } });
    fireEvent.blur(school);
    await waitFor(async () => expect((await stored()).education[0]?.school).toBe("UofT"));
  });

  it("saves work authorization per country and copies the form sentence", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Canada sponsorship needed"), { target: { value: "no" } });
    await waitFor(async () => expect((await stored()).workAuth.CA.needsSponsorship).toBe(false));
    const sentence = screen.getByLabelText("Canada form sentence");
    fireEvent.change(sentence, { target: { value: "I am a permanent resident of Canada and do not require sponsorship." } });
    fireEvent.blur(sentence);
    await waitFor(async () => expect((await stored()).workAuth.CA.formSentence).toMatch(/permanent resident/));
    fireEvent.click(screen.getByRole("button", { name: "Copy Canada form sentence" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("I am a permanent resident of Canada and do not require sponsorship."));
  });

  it("saves salary expectations per country", async () => {
    const { stored } = await open();
    const min = screen.getByLabelText("Korea salary min");
    fireEvent.change(min, { target: { value: "70000000" } });
    fireEvent.blur(min);
    await waitFor(async () => expect((await stored()).salaryExpectations.KR).toMatchObject({ min: 70000000, currency: "KRW" }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/profile.test.ts tests/ui/RowsEditor.test.tsx tests/features/profile.test.tsx`
Expected: FAIL — modules not found; no "Profile" heading.

- [ ] **Step 3: Implement**

`src/domain/profile.ts`:
```ts
import type { Profile } from "./types";

export type ProfileSection = "identity" | "education" | "employment" | "links";

/** Plain-text rendering of a profile section for pasting into application forms. */
export function profileSectionText(p: Profile, section: ProfileSection): string {
  switch (section) {
    case "identity":
      return [p.name, p.email, ...p.phones.map((ph) => `${ph.label}: ${ph.value}`)].filter((s) => s.trim()).join("\n");
    case "education":
      return p.education.map((e) => `${e.school} — ${e.degree}, ${e.field} (${e.start} – ${e.end})${e.gpa ? `, GPA ${e.gpa}` : ""}`).join("\n");
    case "employment":
      return p.employment.map((j) => `${j.company} — ${j.title} (${j.start} – ${j.end || "present"})${j.summary ? `\n${j.summary}` : ""}`).join("\n\n");
    case "links":
      return p.links.map((l) => `${l.label}: ${l.url}`).join("\n");
  }
}

/** Default currency for a country's salary expectations. */
export const COUNTRY_CURRENCY: Record<string, string> = { CA: "CAD", US: "USD", KR: "KRW" };
```

`src/ui/RowsEditor.tsx`:
```tsx
import type { PickEntry } from "../domain/types";
import { DateField, SelectField, TextField } from "./fields";

export type RowsColumn<T> =
  | { key: keyof T & string; label: string; type?: "text" | "date"; placeholder?: string }
  | { key: keyof T & string; label: string; type: "select"; options: PickEntry[] };

interface Props<T extends object> {
  label: string;
  rows: T[];
  columns: RowsColumn<T>[];
  blank: () => T;
  onChange: (rows: T[]) => void;
  disabled?: boolean;
  addLabel?: string;
  rowLabel?: (row: T, index: number) => string;
}

/** Add/edit/remove rows of small string fields; every input is labelled "<row name> <column label>". */
export function RowsEditor<T extends object>({ label, rows, columns, blank, onChange, disabled, addLabel = "Add row", rowLabel }: Props<T>) {
  const update = (i: number, key: keyof T & string, value: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return (
    <div className="rows">
      {rows.length === 0 ? <p className="muted">None yet.</p> : null}
      {rows.map((row, i) => {
        const name = rowLabel ? rowLabel(row, i) : `${label} ${i + 1}`;
        return (
          // keyed by content so a committed edit or a removed sibling remounts the fields with fresh drafts
          <div key={`${i}:${JSON.stringify(row)}`} className="rows-row">
            <div className="grid-3">
              {columns.map((c) => {
                const v = String((row as Record<string, unknown>)[c.key] ?? "");
                const fieldLabel = `${name} ${c.label}`;
                if (c.type === "date") return <DateField key={c.key} label={fieldLabel} value={v} onCommit={(nv) => update(i, c.key, nv)} disabled={disabled} />;
                if (c.type === "select") return <SelectField key={c.key} label={fieldLabel} value={v} options={c.options} onChange={(nv) => update(i, c.key, nv)} allowEmpty={false} disabled={disabled} />;
                return <TextField key={c.key} label={fieldLabel} value={v} onCommit={(nv) => update(i, c.key, nv)} placeholder={c.placeholder} disabled={disabled} />;
              })}
            </div>
            <button type="button" className="btn ghost" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
          </div>
        );
      })}
      <button type="button" className="btn" disabled={disabled} onClick={() => onChange([...rows, blank()])}>{addLabel}</button>
    </div>
  );
}
```

`src/features/profile/WorkAuthSection.tsx`:
```tsx
import { useState } from "react";
import type { Profile, WorkAuth } from "../../domain/types";
import { useApp, useProfile } from "../../store/context";
import { copyText } from "../../ui/copyText";
import { DateField, TextArea, TextField, TriStateField } from "../../ui/fields";
import { useToast } from "../../ui/Toast";

interface Props {
  countryId: string;
  countryLabel: string;
  save: (patch: Partial<Profile>) => Promise<boolean>;
}

export function WorkAuthSection({ countryId, countryLabel, save }: Props) {
  const { repo } = useApp();
  const profile = useProfile();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const ro = repo.readOnly;
  const auth: WorkAuth = profile.workAuth[countryId] ?? { status: "", needsSponsorship: null, formSentence: "" };
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const patch = (p: Partial<WorkAuth>) => save({ workAuth: { ...profile.workAuth, [countryId]: { ...auth, ...p } } });
  const copy = async () => {
    if (await copyText(auth.formSentence)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } else toast.show("Could not copy.", "error");
  };
  return (
    <div className="section">
      <h3>{countryLabel}</h3>
      <div className="grid-3">
        <TextField label={`${countryLabel} work status`} value={auth.status} onCommit={(v) => patch({ status: v.trim() })} placeholder="Citizen, PR, PGWP, H-1B, F-4…" disabled={ro} />
        <TextField label={`${countryLabel} permit type`} value={auth.permitType ?? ""} onCommit={(v) => patch({ permitType: opt(v) })} disabled={ro} />
        <DateField label={`${countryLabel} permit expires`} value={auth.expiresAt ?? ""} onCommit={(v) => void patch({ expiresAt: opt(v) })} disabled={ro} />
      </div>
      <TriStateField label={`${countryLabel} sponsorship needed`} value={auth.needsSponsorship} onChange={(v) => void patch({ needsSponsorship: v })} disabled={ro} />
      <TextArea label={`${countryLabel} form sentence`} rows={2} value={auth.formSentence} onCommit={(v) => patch({ formSentence: v.trim() })} placeholder="The one sentence you paste into application forms about your authorization" disabled={ro} />
      <div className="row"><button type="button" className="btn" aria-label={`Copy ${countryLabel} form sentence`} disabled={!auth.formSentence} onClick={() => void copy()}>Copy sentence</button>{copied ? <span className="muted">Copied</span> : null}</div>
      <TextField label={`${countryLabel} notes`} value={auth.notes ?? ""} onCommit={(v) => patch({ notes: opt(v) })} disabled={ro} />
    </div>
  );
}
```

`src/features/profile/ProfilePage.tsx`:
```tsx
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
  const { repo } = useApp();
  const profile = useProfile();
  const settings = useSettings();
  const { status, run } = useSaver();
  const toast = useToast();
  const [copied, setCopied] = useState<ProfileSection | null>(null);
  const ro = repo.readOnly;
  const save = (p: Partial<Profile>) => run(() => repo.saveProfile({ ...profile, ...p }));
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const copySection = async (section: ProfileSection) => {
    if (await copyText(profileSectionText(profile, section))) { setCopied(section); setTimeout(() => setCopied(null), 1500); } else toast.show("Could not copy.", "error");
  };
  const CopyButton = ({ section, label }: { section: ProfileSection; label: string }) => (
    <span className="row"><button type="button" className="btn" onClick={() => void copySection(section)}>{label}</button>{copied === section ? <span className="muted">Copied</span> : null}</span>
  );
  const countries = settings.pickLists.countries;
  const salary = (countryId: string) => profile.salaryExpectations[countryId] ?? { currency: COUNTRY_CURRENCY[countryId] ?? settings.displayCurrency };
  const setSalary = (countryId: string, p: Partial<{ min?: number; max?: number; currency: string }>) => save({ salaryExpectations: { ...profile.salaryExpectations, [countryId]: { ...salary(countryId), ...p } } });

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
        <RowsEditor label="Phone numbers" rows={profile.phones} columns={[{ key: "label", label: "Label", placeholder: "CA / KR" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={(rows) => void save({ phones: rows })} disabled={ro} addLabel="Add phone" />
        <RowsEditor label="Addresses" rows={profile.addresses} columns={[{ key: "countryId", label: "Country", type: "select", options: countries }, { key: "lines", label: "Address", placeholder: "Street, city, postal code" }]} blank={() => ({ countryId: countries[0]?.id ?? "CA", lines: "" })} onChange={(rows) => void save({ addresses: rows })} disabled={ro} addLabel="Add address" />
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Links</h2><CopyButton section="links" label="Copy links" /></div>
        <RowsEditor label="Links" rows={profile.links} columns={[{ key: "label", label: "Label", placeholder: "GitHub, LinkedIn, portfolio" }, { key: "url", label: "URL" }]} blank={() => ({ label: "", url: "" })} onChange={(rows) => void save({ links: rows })} disabled={ro} addLabel="Add link" />
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Education</h2><CopyButton section="education" label="Copy education" /></div>
        <RowsEditor<Education> label="Education" rows={profile.education}
          columns={[{ key: "school", label: "School" }, { key: "degree", label: "Degree" }, { key: "field", label: "Field" }, { key: "start", label: "Start", placeholder: "2019-09" }, { key: "end", label: "End", placeholder: "2023-05" }, { key: "gpa", label: "GPA" }, { key: "notes", label: "Notes" }]}
          blank={() => ({ school: "", degree: "", field: "", start: "", end: "" })} onChange={(rows) => void save({ education: rows })} disabled={ro} addLabel="Add education" />
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Employment</h2><CopyButton section="employment" label="Copy employment" /></div>
        <RowsEditor<Employment> label="Employment" rows={profile.employment}
          columns={[{ key: "company", label: "Company" }, { key: "title", label: "Title" }, { key: "start", label: "Start", placeholder: "2023-06" }, { key: "end", label: "End", placeholder: "blank = present" }, { key: "location", label: "Location" }, { key: "summary", label: "Summary" }]}
          blank={() => ({ company: "", title: "", start: "", summary: "" })} onChange={(rows) => void save({ employment: rows })} disabled={ro} addLabel="Add employment" />
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
```

`src/app/routes.tsx`: import `ProfilePage`; add `{ key: "profile", to: "/profile", label: "Profile" }` after prep; `PAGES.profile = ProfilePage`.

Append to `src/styles/app.css`:
```css
.rows-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; padding: 8px 0; border-bottom: 1px solid var(--border); }
.rows-row .btn { margin-top: 20px; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(profile): form-fill sheet with list editors, salary expectations, work authorization

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Application integration — documents and people, Answers tab, Interviews tab, company contacts

**Files:**
- Create: `src/features/applications/AnswersTab.tsx`, `src/features/applications/InterviewsTab.tsx`
- Modify: `src/features/applications/OverviewTab.tsx` (new "Documents and people" section), `src/features/applications/ApplicationDetail.tsx` (five tabs, `role="tabpanel"`), `src/features/companies/CompanyEditor.tsx` (Contacts section)
- Test: `tests/features/applicationLinks.test.tsx`, `tests/features/companies.test.tsx` (append)

**Interfaces:**
- Consumes: `assetsOfKind`, `roundsFor`, `formatSlot`, `answerUsage`, `copyText`, `repo.createInterview`, `navigate`.
- Produces: `AnswersTab({ app, patch })`, `InterviewsTab({ app })`; `ApplicationDetail` tab ids `overview | interviews | answers | activity | notes`.

- [ ] **Step 1: Write the failing tests**

`tests/features/applicationLinks.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication, buildAsset, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";
import type { Application, Interview } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open() {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "profile/main", defaultProfile(NOW));
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW));
  await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
  await put(db, "assets/as_2", buildAsset({ kindId: "cover-letter", name: "Shopify letter" }, "as_2", NOW));
  await put(db, "contacts/ct_1", buildContact({ name: "Dana Kim", relationshipId: "recruiter", companyId: "co_1" }, "ct_1", NOW));
  await put(db, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why Shopify", body: "Commerce at scale." }, "an_1", NOW));
  await put(db, "interviews/iv_1", buildInterview({ applicationId: "app_1", roundTypeId: "recruiter-screen" }, "iv_1", NOW));
  window.location.hash = "#/applications/app_1";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("dialog");
  const stored = async () => (await db.doc("applications/app_1").get()).data() as unknown as Application;
  return { db, stored };
}

describe("Application links", () => {
  it("links a resume, cover letter and recruiter from the overview", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Resume version"), { target: { value: "as_1" } });
    fireEvent.change(screen.getByLabelText("Cover letter"), { target: { value: "as_2" } });
    fireEvent.change(screen.getByLabelText("Recruiter"), { target: { value: "ct_1" } });
    await waitFor(async () => expect(await stored()).toMatchObject({ resumeAssetId: "as_1", coverLetterAssetId: "as_2", recruiterContactId: "ct_1" }));
    expect((screen.getByLabelText("Resume version") as HTMLSelectElement).options.length).toBe(2);
  });

  it("attaches and detaches an answer from the Answers tab", async () => {
    const { stored } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Answers" }));
    fireEvent.change(await screen.findByLabelText("Attach answer"), { target: { value: "an_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await waitFor(async () => expect((await stored()).answerIds).toEqual(["an_1"]));
    expect(await screen.findByText("Why Shopify")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Detach Why Shopify" }));
    await waitFor(async () => expect((await stored()).answerIds).toEqual([]));
  });

  it("lists rounds and adds one from the Interviews tab", async () => {
    const { db } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Interviews" }));
    expect(await screen.findByText("Recruiter screen", { selector: ".chip" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Round type to add"), { target: { value: "coding" } });
    fireEvent.click(screen.getByRole("button", { name: "Add round" }));
    await waitFor(async () => expect((await db.collection("interviews").get()).size).toBe(2));
    const added = (await db.collection("interviews").get()).docs.map((d) => d.data() as unknown as Interview).find((i) => i.roundTypeId === "coding");
    expect(added?.applicationId).toBe("app_1");
    expect(window.location.hash).toMatch(/^#\/interviews\/iv_/);
  });
});
```

Append to `tests/features/companies.test.tsx`:
```tsx
  it("lists the company's contacts in the editor", async () => {
    await open("#/companies/co_1", async (d) => {
      await put(d, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await d.doc("contacts/ct_1").set({ id: "ct_1", name: "Dana Kim", relationshipId: "recruiter", companyId: "co_1", notes: "", createdAt: NOW, updatedAt: NOW });
    });
    await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Dana Kim" }).getAttribute("href")).toBe("#/contacts/ct_1");
  });
```
(If `companies.test.tsx` has no `put` helper, add `const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);` near the top.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/features/applicationLinks.test.tsx tests/features/companies.test.tsx`
Expected: FAIL — no "Resume version" label, no Answers/Interviews tabs, no contact link.

- [ ] **Step 3: Implement**

`src/features/applications/AnswersTab.tsx`:
```tsx
import { useState } from "react";
import type { Application } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { PickChip } from "../../ui/Chip";
import { copyText } from "../../ui/copyText";
import { Field } from "../../ui/fields";
import { useToast } from "../../ui/Toast";

export function AnswersTab({ app, patch }: { app: Application; patch: (p: Partial<Application>) => Promise<boolean> }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const attached = app.answerIds.map((id) => state.answers[id]).filter((a): a is NonNullable<typeof a> => !!a);
  const available = Object.values(state.answers).filter((a) => !app.answerIds.includes(a.id)).sort((a, b) => a.title.localeCompare(b.title));
  const copy = async (id: string, body: string) => {
    if (await copyText(body)) { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } else toast.show("Could not copy.", "error");
  };
  return (
    <div>
      <div className="row" style={{ alignItems: "end" }}>
        <Field label="Attach answer" htmlFor="attach-answer">
          <select id="attach-answer" value={pick} onChange={(e) => setPick(e.target.value)} disabled={repo.readOnly}>
            <option value="">Choose from the bank</option>
            {available.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </Field>
        <button type="button" className="btn primary" disabled={!pick || repo.readOnly} onClick={() => { void patch({ answerIds: [...app.answerIds, pick] }); setPick(""); }}>Attach</button>
        <a href="#/answers" className="muted">Manage the bank</a>
      </div>
      {attached.length === 0 ? <p className="muted">No answers attached. Attach the ones you used or plan to use for this application.</p> : (
        <ul className="activity">
          {attached.map((a) => (
            <li key={a.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span><a href={`#/answers/${a.id}`}>{a.title}</a> <PickChip list={settings.pickLists.answerKinds} id={a.kindId} /></span>
                <span className="row">
                  {copiedId === a.id ? <span className="muted">Copied</span> : null}
                  <button type="button" className="btn ghost" aria-label={`Copy ${a.title}`} onClick={() => void copy(a.id, a.body)}>Copy</button>
                  <button type="button" className="btn ghost" aria-label={`Detach ${a.title}`} disabled={repo.readOnly} onClick={() => void patch({ answerIds: app.answerIds.filter((x) => x !== a.id) })}>Detach</button>
                </span>
              </div>
              {a.body ? <p className="muted" style={{ margin: "4px 0 0" }}>{a.body.length > 160 ? `${a.body.slice(0, 160)}…` : a.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/features/applications/InterviewsTab.tsx`:
```tsx
import { useState } from "react";
import { navigate } from "../../app/router";
import { formatSlot, roundsFor } from "../../domain/interviews";
import type { Application, ColorToken, Interview } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Field } from "../../ui/fields";
import { useSaver } from "../../ui/useSaver";

const OUTCOME_COLOR: Record<Interview["outcome"], ColorToken> = { pending: "gray", passed: "green", failed: "red", cancelled: "amber" };

export function InterviewsTab({ app }: { app: Application }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run, status } = useSaver();
  const pl = settings.pickLists;
  const [type, setType] = useState(pl.roundTypes[0]?.id ?? "");
  const rounds = roundsFor(app.id, Object.values(state.interviews));
  const add = () => {
    if (!type) return;
    void run(async () => {
      const iv = await repo.createInterview({ applicationId: app.id, roundTypeId: type });
      navigate(`/interviews/${iv.id}`);
    });
  };
  return (
    <div>
      <div className="row" style={{ alignItems: "end" }}>
        <Field label="Round type to add" htmlFor="add-round-type">
          <select id="add-round-type" value={type} onChange={(e) => setType(e.target.value)} disabled={repo.readOnly}>
            {pl.roundTypes.filter((r) => !r.archived).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <button type="button" className="btn primary" onClick={add} disabled={!type || repo.readOnly || status === "saving"}>Add round</button>
      </div>
      {rounds.length === 0 ? <p className="muted">No rounds yet. Add the recruiter screen as soon as it's booked.</p> : (
        <ul className="activity">
          {rounds.map((iv) => (
            <li key={iv.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="row"><PickChip list={pl.roundTypes} id={iv.roundTypeId} /><span>{formatSlot(iv.scheduledAt, settings.homeTz)}</span></span>
                <span className="row"><Chip color={OUTCOME_COLOR[iv.outcome]}>{iv.outcome}</Chip><a href={`#/interviews/${iv.id}`}>Open round</a></span>
              </div>
              {iv.prepChecklist.length ? <p className="muted" style={{ margin: "4px 0 0" }}>Prep {iv.prepChecklist.filter((c) => c.done).length}/{iv.prepChecklist.length}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/features/applications/OverviewTab.tsx` — add imports `import { assetsOfKind } from "../../domain/assets";` and insert, after the "Where and how" section and before "Timeline":
```tsx
      <div className="section">
        <h3>Documents and people</h3>
        <div className="grid-2">
          <SelectField label="Resume version" value={app.resumeAssetId ?? ""} options={resumeOptions} onChange={(v) => patch({ resumeAssetId: opt(v) })} emptyLabel="None yet" />
          <SelectField label="Cover letter" value={app.coverLetterAssetId ?? ""} options={coverOptions} onChange={(v) => patch({ coverLetterAssetId: opt(v) })} emptyLabel="None yet" />
          <SelectField label="Referrer" value={app.referrerContactId ?? ""} options={contactOptions} onChange={(v) => patch({ referrerContactId: opt(v) })} emptyLabel="No referrer" />
          <SelectField label="Recruiter" value={app.recruiterContactId ?? ""} options={contactOptions} onChange={(v) => patch({ recruiterContactId: opt(v) })} emptyLabel="No recruiter" />
        </div>
        <p className="field-hint">Manage files under <a href="#/assets">Assets</a> and people under <a href="#/contacts">Contacts</a>.</p>
      </div>
```
and define, next to `companies`:
```tsx
  const allAssets = Object.values(state.assets);
  const resumeOptions = assetsOfKind(allAssets, ["resume", "cv"]).map((a) => ({ id: a.id, label: `${a.name} (${a.version})` }));
  const coverOptions = assetsOfKind(allAssets, ["cover-letter"]).map((a) => ({ id: a.id, label: `${a.name} (${a.version})` }));
  const contactOptions = Object.values(state.contacts)
    .sort((a, b) => Number(b.companyId === app.companyId) - Number(a.companyId === app.companyId) || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, label: c.companyId && c.companyId !== app.companyId ? `${c.name} (${state.companies[c.companyId]?.name ?? "?"})` : c.name }));
```

`src/features/applications/ApplicationDetail.tsx` — replace the tab type, list, and render:
```tsx
type Tab = "overview" | "interviews" | "answers" | "activity" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "interviews", label: "Interviews" },
  { id: "answers", label: "Answers" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
];
```
imports `AnswersTab` and `InterviewsTab`, and the panel:
```tsx
      <div role="tabpanel">
        {tab === "overview" ? <OverviewTab app={app} patch={patch} />
          : tab === "interviews" ? <InterviewsTab app={app} />
          : tab === "answers" ? <AnswersTab app={app} patch={patch} />
          : tab === "activity" ? <ActivityTab app={app} />
          : <NotesTab app={app} patch={patch} />}
      </div>
```

`src/features/companies/CompanyEditor.tsx` — add, after the "Applications" list:
```tsx
      <h3>Contacts ({contacts.length})</h3>
      {contacts.length === 0 ? <p className="muted">No contacts at this company yet. Add them under <a href="#/contacts">Contacts</a>.</p> : (
        <ul>{contacts.map((c) => <li key={c.id}><a href={`#/contacts/${c.id}`}>{c.name}</a> <span className="muted">· {settings.pickLists.contactRelationships.find((r) => r.id === c.relationshipId)?.label ?? c.relationshipId}</span></li>)}</ul>
      )}
```
with `const contacts = Object.values(state.contacts).filter((c) => c.companyId === id).sort((a, b) => a.name.localeCompare(b.name));` defined next to `linked`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS (including the existing `applicationDetail.test.tsx`); typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(applications): link documents and people, attach answers, manage rounds from the detail panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Backlog (core) — retry reentrancy, router robustness, type direction, deadline field, tests

**Files:**
- Modify: `src/store/sync.ts` (extract and fix `retryOnce`), `src/app/router.ts`, `src/domain/types.ts` (+`RecordSets`), `src/store/store.ts` (`StoreState extends RecordSets`), `src/domain/pickLists.ts` (import `RecordSets` from `./types`), `src/features/applications/DeadlineField.tsx`
- Test: `tests/store/sync.test.ts` (append), `tests/app/router.test.ts` (append), `tests/domain/applicationFilters.test.ts` (append), `tests/features/settings.test.tsx` (remove the 50 ms sleep), `tests/features/DeadlineField.test.tsx` (new)

**Interfaces:**
- Produces: `retryOnce(attach, { isStopped, fail }): Unsubscribe` exported from `src/store/sync.ts`; `RecordSets` type in `src/domain/types.ts`; `DeadlineField` accepts `disabled?: boolean` and re-syncs only when `value.at`, `value.tz`, `value.dateOnly` or `homeTz` change.

- [ ] **Step 1: Write the failing tests**

Append to `tests/store/sync.test.ts`:
```ts
import { retryOnce } from "../../src/store/sync";

describe("retryOnce", () => {
  it("re-attaches once when the listener errors synchronously and stop() tears down the live listener", () => {
    const events: string[] = [];
    let calls = 0;
    const attach = (onError: (e: DbError) => void) => {
      const n = ++calls;
      if (n === 1) onError({ code: "revoked", message: "" });
      return () => { events.push(`unsub${n}`); };
    };
    const stop = retryOnce(attach, { isStopped: () => false, fail: () => events.push("fail") });
    expect(calls).toBe(2);
    expect(events).toEqual(["unsub1"]);
    stop();
    expect(events).toEqual(["unsub1", "unsub2"]);
  });
  it("gives up through fail() on the second error, synchronous or not", () => {
    const events: string[] = [];
    const attach = (onError: (e: DbError) => void) => { onError({ code: "revoked", message: "" }); return () => { events.push("unsub"); }; };
    retryOnce(attach, { isStopped: () => false, fail: (e) => events.push(`fail:${e.code}`) });
    expect(events).toEqual(["unsub", "fail:revoked"]);
  });
  it("ignores errors after stop", () => {
    let stopped = false;
    let handler: ((e: DbError) => void) | null = null;
    const events: string[] = [];
    const stop = retryOnce((onError) => { handler = onError; return () => {}; }, { isStopped: () => stopped, fail: () => events.push("fail") });
    stop();
    stopped = true;
    handler!({ code: "revoked", message: "" });
    expect(events).toEqual([]);
  });
});
```

Append to `tests/app/router.test.ts`:
```ts
  it("keeps a malformed percent-escape as raw text instead of throwing", () => {
    expect(() => parseHash("#/applications/%E0")).not.toThrow();
    expect(parseHash("#/applications/%E0").parts).toEqual(["applications", "%E0"]);
  });
```

Append to `tests/domain/applicationFilters.test.ts` (inside the describe):
```ts
  it("matches the requisition id in text search", () => {
    const withReq = [buildApplication({ companyId: "co_1", title: "SRE", countryId: "CA", channelId: "linkedin", statusId: "applied", reqId: "REQ-4471" }, "a9", NOW)];
    expect(filterApplications(withReq, { ...emptyFilter(), text: "4471" }, ctx).map((a) => a.id)).toEqual(["a9"]);
  });
```

In `tests/features/settings.test.tsx`, delete the line `await new Promise((r) => setTimeout(r, 50));` from the list-switch test (the fake store notifies synchronously, so the assertion that follows already observes the final state).

`tests/features/DeadlineField.test.tsx` (new):
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeadlineField } from "../../src/features/applications/DeadlineField";

describe("DeadlineField", () => {
  it("keeps the user's zone choice when the parent re-renders with an equal deadline object", () => {
    const onCommit = vi.fn();
    const v = { at: "2026-10-01T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true };
    const { rerender } = render(<DeadlineField value={v} homeTz="America/Toronto" onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("Deadline timezone"), { target: { value: "America/Vancouver" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The parent echoes the same deadline as a fresh object (any unrelated save does this).
    rerender(<DeadlineField value={{ ...v }} homeTz="America/Toronto" onCommit={onCommit} />);
    expect((screen.getByLabelText("Deadline timezone") as HTMLSelectElement).value).toBe("America/Vancouver");
  });
  it("respects disabled", () => {
    render(<DeadlineField value={undefined} homeTz="America/Toronto" onCommit={() => {}} disabled />);
    expect((screen.getByLabelText("Deadline date") as HTMLInputElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/store/sync.test.ts tests/app/router.test.ts tests/domain/applicationFilters.test.ts tests/features/DeadlineField.test.tsx`
Expected: FAIL — `retryOnce` is not exported; `parseHash` throws `URIError`; the deadline zone resets to Asia/Seoul after the equal-object re-render; `disabled` is not a known prop. (The reqId test may already pass; keep it as regression coverage.)

- [ ] **Step 3: Implement**

`src/store/sync.ts` — replace the inner `retryOnce` with a module-level export and call it with the options:
```ts
export interface RetryOptions {
  isStopped: () => boolean;
  fail: (e: DbError) => void;
}

/** Spec §9: re-subscribe a terminated listener once, then give up via `fail`. Safe when `attach`
 * invokes the error callback synchronously (the first attempt's unsubscribe is still torn down and
 * `current` always points at the live listener). */
export function retryOnce(attach: (onError: (e: DbError) => void) => Unsubscribe, opts: RetryOptions): Unsubscribe {
  let current: Unsubscribe | null = null;
  let attempted = false;
  let retryRequested = false;
  const onError = (e: DbError) => {
    if (opts.isStopped()) return;
    if (attempted) {
      opts.fail(e);
      return;
    }
    attempted = true;
    if (current) {
      current();
      current = attach(onError);
    } else {
      retryRequested = true; // errored inside the first attach(): re-attach below, once it returns
    }
  };
  const first = attach(onError);
  if (retryRequested) {
    first();
    current = attach(onError);
  } else {
    current = first;
  }
  return () => current?.();
}
```
Inside `startSync`, delete the old nested `retryOnce` and change the three call sites to `retryOnce((onError) => …, { isStopped: () => stopped, fail })`.

`src/app/router.ts`:
```ts
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // a malformed escape must not blank the page
  }
}
```
and use `.map(decode)` instead of `.map(decodeURIComponent)`.

`src/domain/types.ts` — append:
```ts
/** The per-collection maps the store holds; domain code that needs "all records" depends on this, not on the store module. */
export interface RecordSets {
  applications: Record<string, Application>;
  companies: Record<string, Company>;
  contacts: Record<string, Contact>;
  assets: Record<string, AssetDoc>;
  answers: Record<string, Answer>;
  interviews: Record<string, Interview>;
  prep: Record<string, PrepItem>;
}
```
`src/store/store.ts`: `export interface StoreState extends RecordSets { ready: boolean; readOnly: boolean; settings: Settings | null; profile: Profile | null; }` (drop the seven duplicated map fields; import `RecordSets` from `../domain/types`).
`src/domain/pickLists.ts`: replace `import type { StoreState } from "../store/store";` with `import type { RecordSets } from "./types";` and `type Records = Pick<StoreState, …>` with `type Records = RecordSets;`.

`src/features/applications/DeadlineField.tsx`:
- add `disabled?: boolean` to `Props` and pass `disabled={disabled}` to the input, select, checkbox and Clear button;
- replace the effect with primitive dependencies:
```tsx
  const at = value?.at;
  const valueTz = value?.tz;
  const dateOnlyValue = value?.dateOnly;
  useEffect(() => {
    setTz(valueTz ?? homeTz);
    setDateOnly(dateOnlyValue ?? true);
    setDraft(at && valueTz ? toLocalInputValue(at, valueTz, dateOnlyValue ?? true) : "");
  }, [at, valueTz, dateOnlyValue, homeTz]);
```
- give the inner `<div className="row">` the class `row zoned-row` (styled in Task 10).
In `OverviewTab.tsx`, pass `disabled={repo.readOnly}` (add `const { repo } = useApp();` there) to `DeadlineField`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(core): reentrant retry-once, tolerant hash decoding, record-set type direction, stable deadline field

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Backlog (UI) — danger contrast, quick-add guards, focus handling, nav state, validation text, safe links

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/app.css`, `src/features/applications/QuickAdd.tsx`, `src/ui/Drawer.tsx`, `src/ui/Confirm.tsx`, `src/app/Shell.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/settings/PickListEditor.tsx`, `src/features/companies/CompanyEditor.tsx`, `src/ui/ZonedTimeField.tsx` (row class)
- Test: `tests/styles/tokens.test.ts`, `tests/features/applications.test.tsx` (append), `tests/ui/Drawer.test.tsx`, `tests/ui/Confirm.test.tsx` (append), `tests/app/App.test.tsx` (append), `tests/features/settings.test.tsx` (append), `tests/features/companies.test.tsx` (append)

**Interfaces:**
- Produces: `--danger-text` token in both themes; `Drawer` focuses its dialog on open and restores focus on close; `Confirm` closes on Escape; active nav item carries `aria-current="page"`; Settings shows inline validation text (`role="alert"`) for an invalid FX rate or an empty pick-list label; company source links render as links only for http(s) URLs; QuickAdd disables Create with a message when no open status exists and hides archived countries/channels.

- [ ] **Step 1: Write the failing tests**

`tests/styles/tokens.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("danger button contrast tokens", () => {
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  const app = readFileSync("src/styles/app.css", "utf8");
  it("defines --danger-text on the light root and in both dark blocks", () => {
    expect(tokens.split("@media")[0]).toContain("--danger-text:");
    expect(tokens.match(/--danger-text:/g)?.length).toBe(3);
  });
  it("uses the token for the danger button text", () => {
    expect(app).toMatch(/\.btn\.danger \{[^}]*color: var\(--danger-text\)/);
  });
});
```

Append to `tests/features/applications.test.tsx`:
```tsx
  it("blocks quick-add when every open status is archived", async () => {
    const db = createFakeDb();
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.statuses = s.pickLists.statuses.map((st) => (st.group === "open" ? { ...st, archived: true } : st));
    await db.doc("settings/main").set(s as unknown as Record<string, unknown>);
    window.location.hash = "#/applications";
    render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
    await screen.findByRole("heading", { name: "Applications" });
    fireEvent.click(screen.getByRole("button", { name: "New application" }));
    expect(await screen.findByText(/no open status/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
  });
```

`tests/ui/Drawer.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Drawer } from "../../src/ui/Drawer";

describe("Drawer focus", () => {
  it("moves focus into the dialog on open and restores it on close", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const { rerender } = render(<Drawer open title="T" onClose={() => {}}>body</Drawer>);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    rerender(<Drawer open={false} title="T" onClose={() => {}}>body</Drawer>);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
```

Append to `tests/ui/Confirm.test.tsx`:
```tsx
  it("cancels on Escape", async () => {
    const results: boolean[] = [];
    render(<ConfirmProvider><Harness onResult={(v) => results.push(v)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText("open"));
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual([false]);
  });
```

Append to `tests/app/App.test.tsx`:
```tsx
  it("marks the active nav item with aria-current", async () => {
    const caps = { ...absentCapabilities(), db: Promise.resolve(createFakeDb()) };
    window.location.hash = "#/";
    render(<App capabilities={caps} />);
    await screen.findByText("Total");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Applications" }).getAttribute("aria-current")).toBeNull();
  });
```

Append to `tests/features/settings.test.tsx`:
```tsx
  it("explains an invalid exchange rate and an empty pick-list label", async () => {
    await open("#/settings");
    fireEvent.change(screen.getByLabelText("Currency code"), { target: { value: "usd" } });
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    expect(await screen.findByRole("alert", { name: /rate/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert", { name: /label/i })).toBeTruthy();
  });
```

Append to `tests/features/companies.test.tsx`:
```tsx
  it("renders only http(s) sources as links", async () => {
    await open("#/companies/co_1", async (d) => {
      await put(d, "companies/co_1", buildCompany({ name: "Shopify", sources: [{ label: "Blind", url: "https://teamblind.com/x" }, { label: "Bad", url: "javascript:alert(1)" }] }, "co_1", NOW));
    });
    await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Blind" }).getAttribute("href")).toBe("https://teamblind.com/x");
    expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
    expect(screen.getByText("Bad")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/styles/tokens.test.ts tests/features/applications.test.tsx tests/ui/Drawer.test.tsx tests/ui/Confirm.test.tsx tests/app/App.test.tsx tests/features/settings.test.tsx tests/features/companies.test.tsx`
Expected: FAIL on each new test for the reason its name states.

- [ ] **Step 3: Implement**

`src/styles/tokens.css`: add `--danger-text: #ffffff;` to the bare `:root` block (after `--ok`), and `--danger-text: #101010;` inside BOTH dark blocks (the `@media` guarded one and `:root[data-theme="dark"]`).
`src/styles/app.css`: change `.btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }` to use `color: var(--danger-text)`. Append:
```css
.zoned-row > input { flex: 2 1 180px; }
.zoned-row > select { flex: 2 1 170px; }
```
and give the inner row in `src/ui/ZonedTimeField.tsx` the class `row zoned-row`.

`src/features/applications/QuickAdd.tsx`:
- `const countries = pl.countries.filter((c) => !c.archived); const channels = pl.channels.filter((c) => !c.archived);` and use them for the two selects and the `blank()` defaults;
- `const canSubmit = openStatuses.length > 0 && form.title.trim() !== "" && form.company.trim() !== "" && status !== "saving";`
- in `submit`, replace `openStatuses[0].id` with `openStatuses[0]?.id ?? ""` guarded by the `canSubmit` early return;
- render above the fields: `{openStatuses.length === 0 ? <p className="banner banner-warn" role="alert">There is no open status to file this under. Unarchive one in Settings › Pick lists first.</p> : null}`.

`src/ui/Drawer.tsx`:
```tsx
import { useEffect, useRef, type ReactNode } from "react";
…
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    asideRef.current?.focus();
    return () => { previous?.focus(); };
  }, [open]);
…
      <aside ref={asideRef} tabIndex={-1} className={wide ? "drawer wide" : "drawer"} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
```
and in `app.css`: `.drawer:focus { outline: none; }`.

`src/ui/Confirm.tsx`: add
```tsx
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
```
(import `useEffect`), and `autoFocus` on the Cancel button so keyboard users land on the safe choice.

`src/app/Shell.tsx`: on each nav link add `aria-current={key === n.key ? "page" : undefined}`.

`src/features/settings/SettingsPage.tsx`: add `const [fxError, setFxError] = useState<string | null>(null);`; in `addFx`, when invalid: `setFxError("Enter a 3-letter currency code and a rate above 0."); return;` and `setFxError(null)` on success; render `{fxError ? <p className="field-hint danger-text" role="alert" aria-label="Exchange rate problem">{fxError}</p> : null}` under the rate row.
`src/features/settings/PickListEditor.tsx`: add `const [addError, setAddError] = useState<string | null>(null);`; in `add`, when the label is blank: `setAddError("Enter a label for the new entry."); return;`, clearing it on success; render `{addError ? <p className="field-hint danger-text" role="alert" aria-label="New entry label problem">{addError}</p> : null}` after the toolbar.

`src/features/companies/CompanyEditor.tsx`: `const isSafeUrl = (u: string) => /^https?:\/\//i.test(u);` and render each source as `{isSafeUrl(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.label || s.url}</a> : <span>{s.label || s.url}</span>}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(ui): danger contrast token, quick-add guards, drawer and confirm focus, nav state, validation text, safe source links

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Navigation order, version bump, verification, publish v0.2.0 (orchestrating session)

**Files:**
- Modify: `src/app/routes.tsx` (final order), `package.json` (`"version": "0.2.0"`), `README.md` (feature list)
- Test: `tests/features/applications.test.tsx` ("shows the final navigation order" expectation)

- [ ] **Step 1: Final navigation order (implementer)**

Rewrite `NAV` in `src/app/routes.tsx` to exactly: Dashboard `/`, Applications `/applications`, Companies `/companies`, Contacts `/contacts`, Interviews `/interviews`, Assets `/assets`, Answers `/answers`, Prep `/prep`, Profile `/profile`, Settings `/settings` (keys `""`, `applications`, `companies`, `contacts`, `interviews`, `assets`, `answers`, `prep`, `profile`, `settings`), with `PAGES` holding all ten. Update the expectation in `tests/features/applications.test.tsx` ("shows the final navigation order") to that list. Bump `package.json` version to `0.2.0`. In `README.md`, under the title paragraph, add a "Features (v0.2.0)" bullet list naming the ten pages in one line each. Run `npm test && npm run typecheck && npm run build`; commit:
```bash
git add -A
git commit -m "chore: final navigation order and v0.2.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: Browser walkthrough (controller)**

`npm run dev` in the background, open `http://localhost:5173/dev.html?v=<n>` (cache-bust) in the browser pane: create a contact and link it as recruiter on an application; add an asset and upload a small PDF via the dev fake store; attach an answer; add a round from the application's Interviews tab and schedule it in Asia/Seoul; fill one profile row and copy a section; check the nav on 375 px with a drawer open; stop the server.

- [ ] **Step 3: Publish (controller)**

`npm run build`, then the Artifact tool with `file_path: dist/index.html`, `files: {"app.js": "dist/app.js", "app.css": "dist/app.css"}` (capabilities carry forward: db, assets, downloads, sample), label `v0.2.0 records`. Open the live page in the user's logged-in Chrome: upload a real PDF onto an asset, confirm "Open file" serves it, then delete the smoke-test records (db and the uploaded file). Tag `v0.2.0` and push the tag.
