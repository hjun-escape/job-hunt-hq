# Job Hunt HQ — Design Spec

Date: 2026-09-11
Status: Approved design, pending user review of this document

## 1. Purpose

A private, single-user job-search tracker for a multi-market search (Canada, US, Korea) across many companies, roles, and channels. It replaces a flat 2023 Notion table with linked records so every reusable thing (resume version, referrer, answer, story, reference) is stored once and attached to many applications. Beyond tracking, it helps the user *get* the job: surfacing what is due, what is overdue, which channels and resume versions convert, and drafting tailored answers with Claude from the user's own answer bank.

Qualities required by the user: editable, useful, configurable, reusable, service grade.

## 2. Platform and architecture

- **Delivery:** one private hosted page published as a multi-file claude.ai Artifact. The page is organization-internal because it declares `db` and `assets`; it cannot be shared publicly.
- **Runtime capabilities declared:** `db` (document store), `assets` (PDF uploads), `downloads` (exports), `sample` (in-app Claude drafting). Each is obtained with `await claude.use(name)` and may resolve `null`; the page renders without it and lights the feature up when it resolves.
- **Stack:** React 18 + TypeScript, bundled by esbuild into `dist/app.js` and `dist/app.css` with no CDN dependency. Luxon for timezone math. Vitest for unit tests. Hash-based routing (`#/applications/<id>`) so deep links work with no server.
- **Published files:** `dist/index.html` is an HTML *fragment* (title, stylesheet link, root div, script tag — no doctype/html/head/body, per the Artifact tool contract). Supporting files are published as `app.js` and `app.css` referenced by relative path.
- **Theme:** light and dark palettes defined as CSS tokens on `:root`, overridden under `prefers-color-scheme: dark` guarded by `:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`. Body background is an explicit token.
- **State:** the page subscribes to each collection with `onSnapshot` (10 subscriptions, under the 64 cap) and keeps them in an in-memory store exposed through React context. All writes go through a repository layer that validates the document, stamps `updatedAt`, and appends activity where relevant.
- **Concurrency:** writes are last-writer-wins. Acceptable for one user. Schema migrations run once, guarded by an `acquire` lease on `settings/main`.
- **Capacity:** the store allows 5,000 documents and 256 KiB per document. Activity history is embedded inside each application (capped at the most recent 200 entries) so record counts stay far below the cap.

## 3. Data model

All collections are top-level so filters scan one collection. IDs are client-generated: a type prefix plus base36 timestamp plus 6 random chars (`app_l8x2k1_a9f3q2`). Every document carries `id`, `createdAt`, `updatedAt` (ISO UTC).

### 3.1 `settings/main` (single document)
- `schemaVersion: number`
- `homeTz: string` (IANA, default: browser timezone at first run)
- `displayCurrency: "CAD" | "USD" | "KRW" | string` (default `CAD`)
- `fxRates: Record<string, number>` — user-entered rate from currency to `displayCurrency` (e.g. `{USD: 1.36, KRW: 0.00099}`)
- `priorityWeights: {desire: number, fit: number, likelihood: number}` (default 0.4 / 0.35 / 0.25)
- `followUpCadenceDays: number` (default 7) — days after last contact before a contact is flagged
- `pickLists`: editable option lists, each entry `{id, label, color?, archived?}` plus type-specific fields:
  - `statuses` — adds `group: "open" | "won" | "lost"` and `stageRank: number` (funnel order). Defaults, in rank order: Saved, Preparing, Applied, Screening, Online assessment, Interviewing, Final round, Offer, Negotiating (all `open`); Accepted (`won`); Rejected, Withdrawn, Ghosted (`lost`). Won statuses carry the highest `stageRank` (one above Negotiating); lost statuses have `stageRank` 0 and never advance the funnel.
  - `channels` — Company site, LinkedIn, Referral, Recruiter inbound, Indeed, Glassdoor, Wanted, 사람인, JobKorea, 프로그래머스, 링커리어, Career fair, Cold outreach, Other
  - `countries` — CA, US, KR (extensible)
  - `workModes` — Remote, Hybrid, Onsite
  - `employmentTypes` — Full-time, Contract, Internship, New grad, Part-time
  - `hiringTracks` — 공채 (mass hiring), 수시 (rolling), Not applicable
  - `levels` — Intern, New grad, Junior, Mid, Senior, Staff, Lead, Manager
  - `roleFamilies` — Software Engineer, Backend, Frontend, Full-stack, Mobile, Data Engineer, ML Engineer, Product Manager, Other
  - `roundTypes` — Recruiter screen, Hiring manager screen, Online assessment, Coding interview, System design, Behavioral, Take-home, Onsite loop, 인적성검사, 임원면접, Final, Other
  - `contactRelationships` — Recruiter, Referrer, Hiring manager, Interviewer, Reference, Peer, Other
  - `assetKinds` — Resume, CV, Cover letter, Portfolio, Transcript, Certificate, Other
  - `answerKinds` — Answer, STAR story, Email template
  - `answerThemes` — Tell me about yourself, Why this company, Why this role, Strengths, Weaknesses, Conflict, Leadership, Failure, Salary expectations, Visa/authorization, Referral request, Reference request, Follow-up, Thank-you, 지원동기, 성장과정, 입사 후 포부
  - `prepKinds` — Coding, System design, Behavioral, Domain knowledge
  - `closedReasons` — No response, Rejected after screen, Rejected after OA, Rejected after interview, Position closed, Declined offer, Visa/sponsorship, Compensation, Location, Other
- Pick-list entries are referenced by `id` from records; renaming a label never breaks data. Entries can be archived (hidden from new selections, still rendered on old records) but not deleted while referenced.

### 3.2 `applications/{id}` — the hub
- `companyId: string`, `title: string`, `reqId?: string`, `url?: string`, `team?: string`
- `countryId`, `city?: string`, `workModeId?`, `employmentTypeId?`, `hiringTrackId?`, `levelId?`, `roleFamilyId?`
- `channelId`, `sourceNote?: string`
- `deadline?: {at: string (ISO UTC), tz: string, dateOnly: boolean}` — date-only deadlines are stored as 23:59:59 in `tz`
- `appliedAt?: string` (ISO date)
- `statusId: string`, `closedReasonId?: string`, `closedAt?: string`
- `tier: "A" | "B" | "C" | null`, `desire: 1..5 | null`, `fit: 1..5 | null`, `likelihood: 1..5 | null`
- `comp?: {min?: number, max?: number, currency: string, period: "year" | "month" | "hour", note?: string}`
- `needsSponsorship: boolean | null`, `sponsorshipOffered: boolean | null`
- `resumeAssetId?`, `coverLetterAssetId?`, `referrerContactId?`, `recruiterContactId?`
- `answerIds: string[]` — answers used in this application
- `nextAction?: string`, `nextActionDue?: string` (ISO date)
- `jobDescription?: string` — pasted JD, used by AI drafting
- `tags: string[]`, `notes: string` (markdown)
- `activity: Array<{at: string, type: "status" | "note" | "interview" | "contact" | "file", from?: string, to?: string, text?: string}>` — appended on status change and by explicit "log" actions; capped at 200 most recent
- `maxStageRank: number` — highest `stageRank` ever reached, maintained on status change; drives the funnel

### 3.3 `companies/{id}`
- `name`, `website?`, `industry?`, `size?`, `hq?`, `cities: string[]`, `techStack: string[]`
- `sponsorship: Record<countryId, {policy: "yes" | "no" | "unknown", note?: string}>`
- `interviewProcess: string` (markdown), `sources: Array<{label, url}>`, `notes: string`

### 3.4 `contacts/{id}`
- `name`, `companyId?`, `title?`, `relationshipId`, `email?`, `phone?`, `linkedin?`
- `lastContactedAt?: string`, `followUpEveryDays?: number` (overrides global cadence)
- `referral?: {status: "not_asked" | "asked" | "agreed" | "submitted" | "declined", askedAt?, submittedAt?}`
- `reference?: {consentAt?: string, usedInApplicationIds: string[], lastNotifiedAt?: string}`
- `notes: string`

### 3.5 `assets/{id}` — document records (the file itself lives in the `assets` capability)
- `kindId`, `name`, `version: string`, `targetCountryIds: string[]`, `targetRoleFamilyIds: string[]`
- `file?: {assetId: string, fileName: string, sizeBytes: number, contentType: string, uploadedAt: string}` — `assetId` is the durable pointer; display URL is `/_blob/<assetId>`
- `changelog: string` (markdown), `notes: string`

### 3.6 `answers/{id}`
- `kindId`, `title`, `question?: string`, `body: string` (markdown), `themeIds: string[]`, `language: "en" | "ko" | "other"`, `tags: string[]`
- Usage count is derived at render time from `applications.answerIds`; not stored.

### 3.7 `interviews/{id}`
- `applicationId`, `roundTypeId`, `scheduledAt?: {at: string (ISO UTC), tz: string}`, `durationMin?: number`
- `format: "video" | "phone" | "onsite" | "take_home" | "other"`, `location?: string`, `meetingUrl?: string`
- `interviewerContactIds: string[]`, `interviewerNames?: string`
- `prepChecklist: Array<{id, text, done: boolean}>`
- `questionsAsked: string`, `selfRating: 1..5 | null`, `outcome: "pending" | "passed" | "failed" | "cancelled"`
- `thankYouSentAt?: string`, `notes: string`

### 3.8 `prep/{id}`
- `kindId`, `title`, `sourceUrl?`, `patterns: string[]`, `difficulty: "easy" | "medium" | "hard" | null`, `companyTags: string[]`
- `lastAttemptedAt?: string`, `attempts: number`, `confidence: 1..5 | null`, `notes: string` (markdown, solution notes)

### 3.9 `profile/main` (single document)
- `name`, `email`, `phones: Array<{label, value}>`, `addresses: Array<{countryId, lines: string}>`
- `links: Array<{label, url}>` (GitHub, LinkedIn, portfolio)
- `education: Array<{school, degree, field, start, end, gpa?, notes?}>`
- `employment: Array<{company, title, start, end?, location?, summary}>`
- `salaryExpectations: Record<countryId, {min?, max?, currency}>`
- `noticePeriod?: string`, `earliestStart?: string`
- `workAuth: Record<countryId, {status: string, permitType?: string, expiresAt?: string, needsSponsorship: boolean | null, formSentence: string, notes?: string}>`
- `sensitiveNote: string` — where passport / SIN / SSN / 주민번호 live. The numbers themselves are never stored.

## 4. Domain rules (pure functions, unit-tested)

- **Priority score:** `score = 100 × (w.desire×desire + w.fit×fit + w.likelihood×likelihood) / (5 × (w.desire + w.fit + w.likelihood))`, rounded to an integer; `null` when any input is null. Tier stays manual; the app shows a suggested tier (A ≥ 75, B ≥ 50, else C).
- **Status change:** append an activity entry, set `closedAt` when moving into a `won`/`lost` status and clear it when moving back to `open`, and set `maxStageRank = max(maxStageRank, newStatus.stageRank)`.
- **Funnel:** for a set of applications, count how many reached each open stage using `maxStageRank ≥ stageRank`; conversion between consecutive stages is `reached[n+1] / reached[n]`. Grouped by channel and by resume version. Never counts lost statuses as stages.
- **Due this week:** items whose date falls in `[startOfToday, startOfToday + 7 days)` in `homeTz`: application deadlines, `nextActionDue`, interview `scheduledAt`. Items are merged into one list sorted by time.
- **Overdue:** open applications with `nextActionDue < today` (home tz), and open applications whose deadline has passed while `appliedAt` is still empty.
- **Follow-up flags:** contacts whose `lastContactedAt` is older than their cadence and who are linked to an open application.
- **Timezones:** all instants stored as ISO UTC with the source IANA zone. Display in `homeTz`; when the source zone differs, show the source time beside it. Date-only deadlines never shift dates when rendered.
- **Money:** `normalized = amount × fxRates[currency]` when `currency ≠ displayCurrency` and a rate exists; otherwise the normalized column shows a dash and a "set rate in Settings" hint.
- **CSV:** top-level scalar fields as columns; arrays joined with `"; "`; nested objects serialized as JSON; RFC 4180 quoting; UTF-8 with BOM so Excel opens Korean text correctly.
- **Backup validation:** a backup is accepted when `schemaVersion ≤ current`, every collection is an array of objects with string `id`, and referenced pick-list ids exist in the backup's settings; otherwise a list of human-readable problems is returned and nothing is written.

## 5. Screens

Navigation: left rail (collapses to a bottom bar under 720 px) with Dashboard, Applications, Companies, Contacts, Assets, Answers, Interviews, Prep, Profile, Settings. Global search box matches company, title, contact name, answer title.

- **Dashboard:** "Due this week" list; "Overdue" list; pipeline count per open status; funnel chart (reached-stage bars) with a toggle for grouping by channel or by resume version; upcoming interviews in home tz; follow-up flags.
- **Applications:** table view with column chooser, sort, and filters (country, status, tier, channel, sponsorship, tag, text). Kanban view grouped by status with drag-to-move (moving triggers the status-change rule). Quick-add form: URL, title, company (creates the company if new), country; files under Saved. Detail panel with tabs: Overview (all fields), Interviews (rounds for this application, add round), Answers (attach from bank, draft with AI), Activity (log plus manual note), Notes.
- **Companies:** list with search; detail editor including sponsorship-per-country matrix and interview-process notes; shows linked applications and contacts.
- **Contacts:** list with relationship filter and follow-up flags; detail editor; reference section appears when relationship is Reference.
- **Assets:** list grouped by kind; detail editor with PDF upload (drag-drop or picker), "Open file" link, "Remove file" with confirmation; shows which applications use the asset and its screen-rate from the funnel.
- **Answers:** search by text and theme; detail editor with markdown preview and a Copy button; shows usage count and applications; "Tailor with AI" action.
- **Interviews:** calendar-style week list in home tz plus table; detail editor with prep checklist and post-interview fields.
- **Prep:** table with kind and pattern filters, confidence and last-attempted; detail editor.
- **Profile:** form-fill sheet with per-section copy buttons; work authorization per country with the paste-ready sentence.
- **Settings:** timezone, display currency, FX rates, weights, cadence; pick-list editor (add, rename, recolor, reorder, archive); Backup (download JSON), Restore (merge or replace, with typed confirmation for replace), CSV export per collection; storage meter for files.

Every editor autosaves on blur with a visible "Saved" / "Saving…" / "Failed, retry" indicator. Destructive actions (delete record, remove file, replace-all restore) require confirmation.

## 6. AI draft assist (`sample`)

Available only when `claude.use("sample")` resolves; otherwise the buttons are hidden. Every call happens on an explicit click; the first call triggers the platform's consent prompt; the viewer pays.

Two actions, one mechanism:
1. **Draft answer** (Application → Answers tab, and Answer editor "Tailor"): the page assembles the prompt from the target question, the application's `jobDescription`, the company name and role, the answers/stories the user ticks from the bank, an optional profile summary (employment summaries and links only, never contact details or sensitive notes), the output language (en/ko), and a target length. Output streams into an editable textarea via `onText`. Buttons: "Save as new answer", "Attach to application", "Discard".
2. **Extract requirements** (Application → Overview): sends the `jobDescription` and asks for a JSON list of must-have and nice-to-have requirements via `sample.json`; the result is shown as a checklist the user can copy into notes or the interview prep checklist.

Error handling: `not_granted`/`sampling_disabled`/`not_declared` hide the feature for the page load; `rate_limited` shows a toast and disables the button for 30 s; `refused`/`empty_completion` show a message; on any failure partial text already streamed is kept in the textarea. A `signal` lets the user cancel.

## 7. Files (`assets`)

- Accepted: PDF only for documents (the platform does not accept Word files); the UI says "export to PDF first" when a `.docx` is dropped. Images allowed for portfolio previews.
- Upload flow: pick file → `assets.upload(blob)` → write `file` block onto the asset record immediately. Show size and a storage meter from `assets.list().usage` in Settings.
- Errors map to messages: `too_large` (20 MiB), `unsupported_type`, `quota_or_state`, `rate_limited`; `store_unavailable` retries once.
- Delete: only via "Remove file" on the record; the record's `file` block is cleared in the same action, then `assets.delete(id)` is called.
- A pointer whose file returns 404 renders as "file missing".

## 8. Export and import (`downloads`)

- **Backup JSON:** `{app: "job-hunt-hq", schemaVersion, exportedAt, settings, profile, applications[], companies[], contacts[], assets[], answers[], interviews[], prep[]}`. Uploaded files are not included; their ids are.
- **CSV:** one file per collection, from the same flattening rules as the domain CSV function.
- **Restore:** file picker → validate (section 4) → choose Merge (upsert by id) or Replace (delete all then write). Writes proceed sequentially with a progress bar; `resource_exhausted` backs off and continues; `quota_exceeded` stops and reports how many documents were written.
- A blank tracker for another person is the app itself with an empty store; a "Reset to defaults" action in Settings rewrites `settings/main` from defaults.

## 9. Degraded modes and errors

- `db` null: banner "Storage unavailable in this view", all editors read-only, dashboard renders from empty data.
- `assets` null: upload and remove hidden; existing files still open via `/_blob/<id>`.
- `downloads` null: export buttons hidden.
- `sample` null: AI buttons hidden.
- Store errors: `quota_exceeded` and `resource_exhausted` produce toasts with the action to take; `unavailable` retries once with jitter; `revoked` switches to read-only for the page load.
- Subscriptions pass an error callback; a terminated listener is re-subscribed once, then the banner shows.

## 10. Testing

- **Unit (Vitest):** scoring, status-change rule, funnel, due-this-week and overdue selection across timezones, Luxon-based formatting for date-only vs timed deadlines, money normalization, CSV serialization with Korean text and commas, backup validation and merge/replace planning, id generation, migration runner.
- **Component smoke:** App renders with a fake capability layer (all `null`) and with an in-memory fake `db`; quick-add creates an application; status move appends activity.
- **Manual:** publish, open in the browser pane, exercise create/edit/upload/export, confirm light and dark themes, confirm mobile layout at 375 px.

TDD applies during implementation: failing test first for every domain rule.

## 11. Non-goals for v1

Email or calendar sync, push reminders, automatic FX rates, multi-user collaboration, Word file uploads, offline editing beyond the store's own cache.

## 12. Project layout

```
job-hunt-hq/
  package.json  tsconfig.json  vitest.config.ts
  scripts/build.mjs          # esbuild → dist/app.js, dist/app.css; copies public/index.html
  public/index.html          # artifact fragment: <title>, <link app.css>, <div id=root>, <script app.js>
  src/
    main.tsx
    capabilities/            # use() wrappers: db repo, assets, downloads, sample, fakes for tests
    domain/                  # types, defaults, scoring, status, funnel, dates, money, csv, backup, ids, migrate
    store/                   # subscriptions → context; repository with validation
    features/                # dashboard, applications, companies, contacts, assets, answers, interviews, prep, profile, settings, ai
    ui/                      # Table, Drawer, Select, TagInput, Markdown, Toast, Confirm, EmptyState
    styles/                  # tokens.css (light/dark), app.css
  tests/                     # vitest specs mirroring domain/ and store/
  docs/superpowers/specs/    # this document
```

Publish command: Artifact tool with `file_path: dist/index.html`, `files: {"app.js": "dist/app.js", "app.css": "dist/app.css"}`, `capabilities: {db: {}, assets: {}, downloads: true, sample: {}}`.
