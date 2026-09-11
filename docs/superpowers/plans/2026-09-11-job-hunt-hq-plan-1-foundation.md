# Job Hunt HQ — Plan 1 of 3: Foundation and Applications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, published v1 of the tracker: project scaffold, domain model, capability layer with a local fake, live store, app shell, Settings, Companies, and the full Applications table/detail flow.

**Architecture:** A React 18 + TypeScript single-page app bundled by esbuild into `dist/app.js` and `dist/app.css`, published as a multi-file claude.ai Artifact whose HTML is a fragment. Data lives in the artifact's `db` document store, reached through `window.claude.use("db")`; a localStorage-backed fake implements the same interface for local development and tests. All domain rules are pure functions under `src/domain/` and are unit-tested first.

**Tech Stack:** Node 25, npm, React 18, TypeScript 5, esbuild, Luxon (timezones), Vitest + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md` (read it first; this plan implements sections 2, 3, 4 (partly), 5 (Applications, Companies, Settings), 9, 10, 12).

**Later plans:** Plan 2 adds Contacts, Assets (uploads), Answers, Interviews, Prep, Profile. Plan 3 adds Dashboard (due/overdue/funnel), Kanban, backup/restore/CSV, and AI draft assist. Do not build those here.

## Global Constraints

- Run every command from the repository root.
- React `^18.3.1` (not 19). TypeScript `strict: true`. No CDN scripts: everything is bundled.
- `public/index.html` is an HTML fragment: no `<!doctype>`, `<html>`, `<head>`, or `<body>`; references `app.css` and `app.js` by relative path with no leading slash.
- The page must render with every capability absent (`claude.use()` resolving `null`): read-only banner, no crashes.
- Theme tokens: light palette on bare `:root`; dark overrides under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. `body` gets an explicit token background.
- Document store limits: 5,000 documents per artifact, 256 KiB per document. Activity is embedded in the application and capped at 200 entries.
- Every write goes through `Repository`; components never call `db` directly.
- Every record write strips `undefined` keys and stamps `updatedAt`.
- Pick-list values are referenced by `id`, never by label.
- Commits: end each commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- TDD: write the failing test, run it, implement, run it green, commit.

## File map (what each file owns)

```
package.json, tsconfig.json, vitest.config.ts, .gitignore
scripts/build.mjs                 esbuild bundle → dist/app.js, dist/app.css; copies public/*.html
public/index.html                 artifact fragment
public/dev.html                   full document for local dev (npm run dev)
src/types/claude/*.d.ts           platform capability contracts (already copied in; do not edit)
src/main.tsx                      mount App with resolved capabilities
src/styles/tokens.css             light/dark tokens
src/styles/app.css                layout and component styles
src/domain/types.ts               all entity types, PickLists, Settings, Profile, EntityMap, COLLECTIONS
src/domain/ids.ts                 newId(prefix), nowIso()
src/domain/defaults.ts            SCHEMA_VERSION, defaultPickLists, defaultSettings, defaultProfile, browserTimeZone
src/domain/factories.ts           buildApplication, buildCompany (and the other builders for later plans)
src/domain/scoring.ts             priorityScore, suggestedTier
src/domain/status.ts              findStatus, applyStatusChange, appendActivity
src/domain/dates.ts               Luxon helpers: localToUtcIso, makeDeadline, formatForHome, daysUntil, urgency, todayIso
src/domain/money.ts               normalizeAmount, formatMoney, formatCompRange
src/domain/migrate.ts             migrateSettings
src/domain/pickLists.ts           pure pick-list editing reducers, slugId, referencedPickIds
src/domain/applicationFilters.ts  filterApplications, sortApplications
src/capabilities/types.ts         DbLike, AssetsLike, DownloadsLike, SampleLike, Capabilities, absentCapabilities
src/capabilities/fakeDb.ts        in-memory DB implementing the db contract (+ localStorage persistence)
src/capabilities/fakeDownloads.ts anchor-based downloads for local dev
src/capabilities/errors.ts        describeDbError, isTransient
src/capabilities/resolve.ts       createCapabilities(): real window.claude or dev fakes
src/store/store.ts                createStore, StoreState, useStoreState
src/store/sync.ts                 startSync(db, store): subscriptions, seeding, readiness
src/store/repository.ts           Repository: create/update/remove/saveSettings/saveProfile/changeStatus/logActivity, RepoError
src/store/context.tsx             AppContext, useApp, useAppState, useSettings
src/app/router.ts                 parseHash, navigate, useRoute
src/app/App.tsx                   boots store + sync, provides context
src/app/Shell.tsx                 nav rail, banner, route switch
src/app/DashboardPage.tsx         pipeline counts (Plan 3 expands)
src/ui/Toast.tsx                  ToastProvider, useToast
src/ui/fields.tsx                 TextField, TextArea, NumberField, SelectField, DateField, RatingField, TagInput, TriStateField
src/ui/Table.tsx + sortRows.ts    generic sortable table
src/ui/Drawer.tsx                 side panel
src/ui/Confirm.tsx                ConfirmProvider, useConfirm
src/ui/useSaver.ts                autosave status + SaveIndicator
src/ui/Chip.tsx                   colored pick-list chip
src/features/settings/SettingsPage.tsx, PickListEditor.tsx
src/features/companies/CompaniesPage.tsx, CompanyEditor.tsx
src/features/applications/ApplicationsPage.tsx, QuickAdd.tsx, ApplicationDetail.tsx, OverviewTab.tsx, ActivityTab.tsx, NotesTab.tsx, DeadlineField.tsx
tests/**                          Vitest specs mirroring the above
```

---

### Task 1: Project scaffold, build script, artifact fragment

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `scripts/build.mjs`, `public/index.html`, `public/dev.html`, `src/main.tsx`, `src/app/App.tsx`, `src/styles/tokens.css`, `src/styles/app.css`
- Test: `tests/artifact-shell.test.ts`

**Interfaces:**
- Produces: `npm test`, `npm run build` (→ `dist/index.html`, `dist/dev.html`, `dist/app.js`, `dist/app.css`), `npm run dev` (serves `dist/dev.html` on port 5173), `npm run typecheck`.

- [ ] **Step 1: Write the failing test**

`tests/artifact-shell.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("public/index.html is a valid artifact fragment", () => {
  const html = readFileSync("public/index.html", "utf8");

  it("has no document wrapper tags", () => {
    expect(html).not.toMatch(/<!doctype/i);
    expect(html).not.toMatch(/<html|<head|<body/i);
  });

  it("references bundled files by relative path", () => {
    expect(html).toContain('href="app.css"');
    expect(html).toContain('src="app.js"');
    expect(html).not.toMatch(/(href|src)="\//);
  });

  it("declares the title", () => {
    expect(html).toMatch(/<title>Job Hunt HQ<\/title>/);
  });
});
```

- [ ] **Step 2: Create the project files**

`package.json`:
```json
{
  "name": "job-hunt-hq",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "dev": "node scripts/build.mjs --watch --serve",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "luxon": "^3.5.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/react": "^16.0.1",
    "@types/luxon": "^3.4.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "esbuild": "^0.24.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

`.gitignore`:
```
node_modules
dist
.DS_Store
```

`scripts/build.mjs`:
```js
import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");

mkdirSync("dist", { recursive: true });
cpSync("public/index.html", "dist/index.html");
cpSync("public/dev.html", "dist/dev.html");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: { app: "src/main.tsx" },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: "dist", port: 5173 });
    console.log(`dev server: http://${host}:${port}/dev.html`);
  }
} else {
  await esbuild.build(options);
}
```

`public/index.html`:
```html
<title>Job Hunt HQ</title>
<link rel="stylesheet" href="app.css">
<div id="root"></div>
<script src="app.js"></script>
```

`public/dev.html`:
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Hunt HQ (dev)</title>
<link rel="stylesheet" href="app.css">
<style>body{margin:0;font:14px system-ui,sans-serif}</style>
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>
</body>
</html>
```

`src/styles/tokens.css`:
```css
:root {
  color-scheme: light;
  --bg: #f7f7f5;
  --surface: #ffffff;
  --surface-2: #f0efeb;
  --border: #d9d7d0;
  --text: #1c1c1a;
  --text-muted: #6b6a64;
  --accent: #2f6fed;
  --accent-text: #ffffff;
  --danger: #c93b3b;
  --warn: #b7791f;
  --ok: #2f855a;
  --chip-gray: #e4e3de; --chip-gray-text: #3a3a36;
  --chip-blue: #dbe7ff; --chip-blue-text: #1e3f8f;
  --chip-purple: #eadcff; --chip-purple-text: #4b2a8a;
  --chip-green: #d6f2e1; --chip-green-text: #1f5a38;
  --chip-red: #fbdada; --chip-red-text: #8a2323;
  --chip-amber: #fbe8c4; --chip-amber-text: #7a4b0b;
  --radius: 8px;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #141413; --surface: #1e1e1c; --surface-2: #262624; --border: #3a3a36;
    --text: #ecebe6; --text-muted: #a3a29a; --accent: #7aa2ff; --accent-text: #101010;
    --danger: #f08c8c; --warn: #e0b060; --ok: #7fd1a0;
    --chip-gray: #33332f; --chip-gray-text: #d6d5cf;
    --chip-blue: #21365f; --chip-blue-text: #b9ccff;
    --chip-purple: #382758; --chip-purple-text: #d4c0ff;
    --chip-green: #1f3f2c; --chip-green-text: #a9e6c2;
    --chip-red: #4d2222; --chip-red-text: #f4b4b4;
    --chip-amber: #4a3a15; --chip-amber-text: #f2d59a;
    --shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141413; --surface: #1e1e1c; --surface-2: #262624; --border: #3a3a36;
  --text: #ecebe6; --text-muted: #a3a29a; --accent: #7aa2ff; --accent-text: #101010;
  --danger: #f08c8c; --warn: #e0b060; --ok: #7fd1a0;
  --chip-gray: #33332f; --chip-gray-text: #d6d5cf;
  --chip-blue: #21365f; --chip-blue-text: #b9ccff;
  --chip-purple: #382758; --chip-purple-text: #d4c0ff;
  --chip-green: #1f3f2c; --chip-green-text: #a9e6c2;
  --chip-red: #4d2222; --chip-red-text: #f4b4b4;
  --chip-amber: #4a3a15; --chip-amber-text: #f2d59a;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
```

`src/styles/app.css` (Task 7 extends this; start with the base):
```css
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
#root { min-height: 100vh; }
h1, h2, h3 { margin: 0 0 8px; font-weight: 600; }
h1 { font-size: 20px; } h2 { font-size: 16px; } h3 { font-size: 14px; }
a { color: var(--accent); }
.main { padding: 16px; }
```

`src/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/app.css";

const el = document.getElementById("root");
if (!el) throw new Error("root element missing");
createRoot(el).render(<App />);
```

`src/app/App.tsx` (Task 7 replaces this with the real shell):
```tsx
export function App() {
  return (
    <main className="main">
      <h1>Job Hunt HQ</h1>
    </main>
  );
}
```

- [ ] **Step 3: Install and run the test**

Run: `npm install && npm test`
Expected: 3 tests PASS in `tests/artifact-shell.test.ts`.

- [ ] **Step 4: Build and typecheck**

Run: `npm run build && ls dist && npm run typecheck`
Expected: `dist` lists `app.css app.js dev.html index.html`; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold React/TypeScript build with artifact fragment

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Domain types, ids, defaults, factories

**Files:**
- Create: `src/domain/types.ts`, `src/domain/ids.ts`, `src/domain/defaults.ts`, `src/domain/factories.ts`
- Test: `tests/domain/ids.test.ts`, `tests/domain/defaults.test.ts`

**Interfaces:**
- Produces: every type in the spec's data model; `COLLECTIONS`; `newId(prefix, now?)`; `nowIso()`; `ID_PREFIX`; `SCHEMA_VERSION`; `defaultPickLists()`; `defaultSettings(homeTz, now)`; `defaultProfile(now)`; `browserTimeZone()`; `buildApplication(input, id, now)`; `buildCompany(input, id, now)`; `buildContact`, `buildAsset`, `buildAnswer`, `buildInterview`, `buildPrep` (same shape).

- [ ] **Step 1: Write the failing tests**

`tests/domain/ids.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { newId, nowIso, ID_PREFIX } from "../../src/domain/ids";

describe("newId", () => {
  it("formats as prefix_base36time_6chars", () => {
    expect(newId("app", 1_700_000_000_000)).toMatch(/^app_[0-9a-z]+_[0-9a-z]{6}$/);
  });
  it("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId(ID_PREFIX.applications)));
    expect(ids.size).toBe(2000);
  });
});

describe("nowIso", () => {
  it("returns a UTC ISO string", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
```

`tests/domain/defaults.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings, defaultProfile, SCHEMA_VERSION } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { PickListName } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

describe("defaultSettings", () => {
  const s = defaultSettings("America/Toronto", NOW);

  it("has the current schema version and home timezone", () => {
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.homeTz).toBe("America/Toronto");
    expect(s.displayCurrency).toBe("CAD");
  });

  it("has 13 statuses with open/won/lost groups", () => {
    const st = s.pickLists.statuses;
    expect(st).toHaveLength(13);
    expect(st.filter((x) => x.group === "open")).toHaveLength(9);
    expect(st.filter((x) => x.group === "won").map((x) => x.id)).toEqual(["accepted"]);
    expect(st.filter((x) => x.group === "lost").map((x) => x.id)).toEqual(["rejected", "withdrawn", "ghosted"]);
  });

  it("ranks won above every open stage and lost at zero", () => {
    const st = s.pickLists.statuses;
    const maxOpen = Math.max(...st.filter((x) => x.group === "open").map((x) => x.stageRank));
    const won = st.find((x) => x.id === "accepted")!;
    expect(won.stageRank).toBe(maxOpen + 1);
    for (const lost of st.filter((x) => x.group === "lost")) expect(lost.stageRank).toBe(0);
  });

  it("has unique ids inside every pick list", () => {
    for (const name of Object.keys(s.pickLists) as PickListName[]) {
      const ids = s.pickLists[name].map((e) => e.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has CA, US, KR countries", () => {
    expect(s.pickLists.countries.map((c) => c.id)).toEqual(["CA", "US", "KR"]);
  });
});

describe("defaultProfile", () => {
  it("has a work-auth block per default country", () => {
    const p = defaultProfile(NOW);
    expect(Object.keys(p.workAuth).sort()).toEqual(["CA", "KR", "US"]);
    expect(p.sensitiveNote).toBe("");
  });
});

describe("factories", () => {
  it("buildApplication fills every required array and null field", () => {
    const a = buildApplication(
      { companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "saved" },
      "app_1",
      NOW,
    );
    expect(a).toMatchObject({
      id: "app_1", createdAt: NOW, updatedAt: NOW, tier: null, desire: null, fit: null, likelihood: null,
      needsSponsorship: null, sponsorshipOffered: null, answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 0,
    });
  });

  it("buildApplication honours an explicit maxStageRank", () => {
    const a = buildApplication(
      { companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 },
      "app_2",
      NOW,
    );
    expect(a.maxStageRank).toBe(3);
  });

  it("buildCompany fills arrays and strings", () => {
    const c = buildCompany({ name: "Shopify" }, "co_1", NOW);
    expect(c).toMatchObject({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain`
Expected: FAIL, "Cannot find module '../../src/domain/ids'" (and defaults/factories).

- [ ] **Step 3: Write the domain files**

`src/domain/types.ts`:
```ts
export type ISODateTime = string; // "2026-09-11T14:00:00.000Z"
export type ISODate = string; // "2026-09-11"
export type Rating = 1 | 2 | 3 | 4 | 5;
export type Tier = "A" | "B" | "C";
export type ColorToken = "gray" | "blue" | "purple" | "green" | "red" | "amber";

export interface BaseDoc {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PickEntry {
  id: string;
  label: string;
  color?: ColorToken;
  archived?: boolean;
}

export interface StatusEntry extends PickEntry {
  group: "open" | "won" | "lost";
  stageRank: number;
}

export interface PickLists {
  statuses: StatusEntry[];
  channels: PickEntry[];
  countries: PickEntry[];
  workModes: PickEntry[];
  employmentTypes: PickEntry[];
  hiringTracks: PickEntry[];
  levels: PickEntry[];
  roleFamilies: PickEntry[];
  roundTypes: PickEntry[];
  contactRelationships: PickEntry[];
  assetKinds: PickEntry[];
  answerKinds: PickEntry[];
  answerThemes: PickEntry[];
  prepKinds: PickEntry[];
  closedReasons: PickEntry[];
}
export type PickListName = keyof PickLists;

export interface PriorityWeights {
  desire: number;
  fit: number;
  likelihood: number;
}

export interface Settings {
  schemaVersion: number;
  homeTz: string;
  displayCurrency: string;
  fxRates: Record<string, number>;
  priorityWeights: PriorityWeights;
  followUpCadenceDays: number;
  pickLists: PickLists;
  updatedAt: ISODateTime;
}

export interface ZonedInstant {
  at: ISODateTime;
  tz: string;
}
export interface Deadline extends ZonedInstant {
  dateOnly: boolean;
}

export type ActivityType = "status" | "note" | "interview" | "contact" | "file";
export interface ActivityEntry {
  at: ISODateTime;
  type: ActivityType;
  from?: string;
  to?: string;
  text?: string;
}

export interface Comp {
  min?: number;
  max?: number;
  currency: string;
  period: "year" | "month" | "hour";
  note?: string;
}

export interface Application extends BaseDoc {
  companyId: string;
  title: string;
  reqId?: string;
  url?: string;
  team?: string;
  countryId: string;
  city?: string;
  workModeId?: string;
  employmentTypeId?: string;
  hiringTrackId?: string;
  levelId?: string;
  roleFamilyId?: string;
  channelId: string;
  sourceNote?: string;
  deadline?: Deadline;
  appliedAt?: ISODate;
  statusId: string;
  closedReasonId?: string;
  closedAt?: ISODateTime;
  tier: Tier | null;
  desire: Rating | null;
  fit: Rating | null;
  likelihood: Rating | null;
  comp?: Comp;
  needsSponsorship: boolean | null;
  sponsorshipOffered: boolean | null;
  resumeAssetId?: string;
  coverLetterAssetId?: string;
  referrerContactId?: string;
  recruiterContactId?: string;
  answerIds: string[];
  nextAction?: string;
  nextActionDue?: ISODate;
  jobDescription?: string;
  tags: string[];
  notes: string;
  activity: ActivityEntry[];
  maxStageRank: number;
}

export interface SponsorshipPolicy {
  policy: "yes" | "no" | "unknown";
  note?: string;
}
export interface LabeledLink {
  label: string;
  url: string;
}

export interface Company extends BaseDoc {
  name: string;
  website?: string;
  industry?: string;
  size?: string;
  hq?: string;
  cities: string[];
  techStack: string[];
  sponsorship: Record<string, SponsorshipPolicy>;
  interviewProcess: string;
  sources: LabeledLink[];
  notes: string;
}

export type ReferralStatus = "not_asked" | "asked" | "agreed" | "submitted" | "declined";
export interface Contact extends BaseDoc {
  name: string;
  companyId?: string;
  title?: string;
  relationshipId: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  lastContactedAt?: ISODate;
  followUpEveryDays?: number;
  referral?: { status: ReferralStatus; askedAt?: ISODate; submittedAt?: ISODate };
  reference?: { consentAt?: ISODate; usedInApplicationIds: string[]; lastNotifiedAt?: ISODate };
  notes: string;
}

export interface StoredFile {
  assetId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: ISODateTime;
}
export interface AssetDoc extends BaseDoc {
  kindId: string;
  name: string;
  version: string;
  targetCountryIds: string[];
  targetRoleFamilyIds: string[];
  file?: StoredFile;
  changelog: string;
  notes: string;
}

export interface Answer extends BaseDoc {
  kindId: string;
  title: string;
  question?: string;
  body: string;
  themeIds: string[];
  language: "en" | "ko" | "other";
  tags: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export interface Interview extends BaseDoc {
  applicationId: string;
  roundTypeId: string;
  scheduledAt?: ZonedInstant;
  durationMin?: number;
  format: "video" | "phone" | "onsite" | "take_home" | "other";
  location?: string;
  meetingUrl?: string;
  interviewerContactIds: string[];
  interviewerNames?: string;
  prepChecklist: ChecklistItem[];
  questionsAsked: string;
  selfRating: Rating | null;
  outcome: "pending" | "passed" | "failed" | "cancelled";
  thankYouSentAt?: ISODate;
  notes: string;
}

export interface PrepItem extends BaseDoc {
  kindId: string;
  title: string;
  sourceUrl?: string;
  patterns: string[];
  difficulty: "easy" | "medium" | "hard" | null;
  companyTags: string[];
  lastAttemptedAt?: ISODate;
  attempts: number;
  confidence: Rating | null;
  notes: string;
}

export interface WorkAuth {
  status: string;
  permitType?: string;
  expiresAt?: ISODate;
  needsSponsorship: boolean | null;
  formSentence: string;
  notes?: string;
}
export interface Profile {
  name: string;
  email: string;
  phones: { label: string; value: string }[];
  addresses: { countryId: string; lines: string }[];
  links: LabeledLink[];
  education: { school: string; degree: string; field: string; start: string; end: string; gpa?: string; notes?: string }[];
  employment: { company: string; title: string; start: string; end?: string; location?: string; summary: string }[];
  salaryExpectations: Record<string, { min?: number; max?: number; currency: string }>;
  noticePeriod?: string;
  earliestStart?: string;
  workAuth: Record<string, WorkAuth>;
  sensitiveNote: string;
  updatedAt: ISODateTime;
}

export interface EntityMap {
  applications: Application;
  companies: Company;
  contacts: Contact;
  assets: AssetDoc;
  answers: Answer;
  interviews: Interview;
  prep: PrepItem;
}
export type CollectionName = keyof EntityMap;
export const COLLECTIONS: CollectionName[] = ["applications", "companies", "contacts", "assets", "answers", "interviews", "prep"];
```

`src/domain/ids.ts`:
```ts
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const ID_PREFIX = {
  applications: "app",
  companies: "co",
  contacts: "ct",
  assets: "as",
  answers: "an",
  interviews: "iv",
  prep: "pr",
} as const;

export function newId(prefix: string, now: number = Date.now()): string {
  return `${prefix}_${now.toString(36)}_${randomChars(6)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

`src/domain/defaults.ts`:
```ts
import type { ColorToken, PickEntry, PickLists, Profile, Settings, StatusEntry } from "./types";

export const SCHEMA_VERSION = 1;

const entry = (id: string, label: string, color?: ColorToken): PickEntry => (color ? { id, label, color } : { id, label });
const status = (id: string, label: string, group: StatusEntry["group"], stageRank: number, color: ColorToken): StatusEntry => ({
  id, label, group, stageRank, color,
});

export function defaultPickLists(): PickLists {
  return {
    statuses: [
      status("saved", "Saved", "open", 1, "gray"),
      status("preparing", "Preparing", "open", 2, "gray"),
      status("applied", "Applied", "open", 3, "blue"),
      status("screening", "Screening", "open", 4, "blue"),
      status("oa", "Online assessment", "open", 5, "blue"),
      status("interviewing", "Interviewing", "open", 6, "purple"),
      status("final", "Final round", "open", 7, "purple"),
      status("offer", "Offer", "open", 8, "green"),
      status("negotiating", "Negotiating", "open", 9, "green"),
      status("accepted", "Accepted", "won", 10, "green"),
      status("rejected", "Rejected", "lost", 0, "red"),
      status("withdrawn", "Withdrawn", "lost", 0, "red"),
      status("ghosted", "Ghosted", "lost", 0, "red"),
    ],
    channels: [
      entry("company-site", "Company site"), entry("linkedin", "LinkedIn"), entry("referral", "Referral"),
      entry("recruiter-inbound", "Recruiter inbound"), entry("indeed", "Indeed"), entry("glassdoor", "Glassdoor"),
      entry("wanted", "Wanted"), entry("saramin", "사람인"), entry("jobkorea", "JobKorea"),
      entry("programmers", "프로그래머스"), entry("linkareer", "링커리어"), entry("career-fair", "Career fair"),
      entry("cold-outreach", "Cold outreach"), entry("other", "Other"),
    ],
    countries: [entry("CA", "Canada"), entry("US", "United States"), entry("KR", "Korea")],
    workModes: [entry("remote", "Remote"), entry("hybrid", "Hybrid"), entry("onsite", "Onsite")],
    employmentTypes: [
      entry("full-time", "Full-time"), entry("contract", "Contract"), entry("internship", "Internship"),
      entry("new-grad", "New grad"), entry("part-time", "Part-time"),
    ],
    hiringTracks: [entry("gongchae", "공채 (mass hiring)"), entry("susi", "수시 (rolling)"), entry("na", "Not applicable")],
    levels: [
      entry("intern", "Intern"), entry("new-grad", "New grad"), entry("junior", "Junior"), entry("mid", "Mid"),
      entry("senior", "Senior"), entry("staff", "Staff"), entry("lead", "Lead"), entry("manager", "Manager"),
    ],
    roleFamilies: [
      entry("swe", "Software Engineer"), entry("backend", "Backend"), entry("frontend", "Frontend"),
      entry("fullstack", "Full-stack"), entry("mobile", "Mobile"), entry("data-eng", "Data Engineer"),
      entry("ml-eng", "ML Engineer"), entry("pm", "Product Manager"), entry("other", "Other"),
    ],
    roundTypes: [
      entry("recruiter-screen", "Recruiter screen"), entry("hm-screen", "Hiring manager screen"),
      entry("oa", "Online assessment"), entry("coding", "Coding interview"), entry("system-design", "System design"),
      entry("behavioral", "Behavioral"), entry("take-home", "Take-home"), entry("onsite", "Onsite loop"),
      entry("aptitude", "인적성검사"), entry("executive", "임원면접"), entry("final", "Final"), entry("other", "Other"),
    ],
    contactRelationships: [
      entry("recruiter", "Recruiter"), entry("referrer", "Referrer"), entry("hiring-manager", "Hiring manager"),
      entry("interviewer", "Interviewer"), entry("reference", "Reference"), entry("peer", "Peer"), entry("other", "Other"),
    ],
    assetKinds: [
      entry("resume", "Resume"), entry("cv", "CV"), entry("cover-letter", "Cover letter"), entry("portfolio", "Portfolio"),
      entry("transcript", "Transcript"), entry("certificate", "Certificate"), entry("other", "Other"),
    ],
    answerKinds: [entry("answer", "Answer"), entry("star", "STAR story"), entry("email", "Email template")],
    answerThemes: [
      entry("about-me", "Tell me about yourself"), entry("why-company", "Why this company"), entry("why-role", "Why this role"),
      entry("strengths", "Strengths"), entry("weaknesses", "Weaknesses"), entry("conflict", "Conflict"),
      entry("leadership", "Leadership"), entry("failure", "Failure"), entry("salary", "Salary expectations"),
      entry("visa", "Visa/authorization"), entry("referral-request", "Referral request"),
      entry("reference-request", "Reference request"), entry("follow-up", "Follow-up"), entry("thank-you", "Thank-you"),
      entry("motivation-ko", "지원동기"), entry("growth-ko", "성장과정"), entry("aspiration-ko", "입사 후 포부"),
    ],
    prepKinds: [entry("coding", "Coding"), entry("system-design", "System design"), entry("behavioral", "Behavioral"), entry("domain", "Domain knowledge")],
    closedReasons: [
      entry("no-response", "No response"), entry("rejected-screen", "Rejected after screen"),
      entry("rejected-oa", "Rejected after OA"), entry("rejected-interview", "Rejected after interview"),
      entry("position-closed", "Position closed"), entry("declined-offer", "Declined offer"),
      entry("visa", "Visa/sponsorship"), entry("compensation", "Compensation"), entry("location", "Location"), entry("other", "Other"),
    ],
  };
}

export function defaultSettings(homeTz: string, now: string): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    homeTz,
    displayCurrency: "CAD",
    fxRates: {},
    priorityWeights: { desire: 0.4, fit: 0.35, likelihood: 0.25 },
    followUpCadenceDays: 7,
    pickLists: defaultPickLists(),
    updatedAt: now,
  };
}

export function defaultProfile(now: string): Profile {
  const auth = { status: "", needsSponsorship: null, formSentence: "" };
  return {
    name: "",
    email: "",
    phones: [],
    addresses: [],
    links: [],
    education: [],
    employment: [],
    salaryExpectations: {},
    workAuth: { CA: { ...auth }, US: { ...auth }, KR: { ...auth } },
    sensitiveNote: "",
    updatedAt: now,
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
```

`src/domain/factories.ts`:
```ts
import type { Answer, Application, AssetDoc, Company, Contact, Interview, PrepItem } from "./types";

type Base = "id" | "createdAt" | "updatedAt";

export type NewApplication = Pick<Application, "companyId" | "title" | "countryId" | "channelId" | "statusId"> &
  Partial<Omit<Application, Base>>;
export function buildApplication(input: NewApplication, id: string, now: string): Application {
  return {
    id, createdAt: now, updatedAt: now,
    tier: null, desire: null, fit: null, likelihood: null,
    needsSponsorship: null, sponsorshipOffered: null,
    answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 0,
    ...input,
  };
}

export type NewCompany = Pick<Company, "name"> & Partial<Omit<Company, Base>>;
export function buildCompany(input: NewCompany, id: string, now: string): Company {
  return { id, createdAt: now, updatedAt: now, cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", ...input };
}

export type NewContact = Pick<Contact, "name" | "relationshipId"> & Partial<Omit<Contact, Base>>;
export function buildContact(input: NewContact, id: string, now: string): Contact {
  return { id, createdAt: now, updatedAt: now, notes: "", ...input };
}

export type NewAsset = Pick<AssetDoc, "kindId" | "name"> & Partial<Omit<AssetDoc, Base>>;
export function buildAsset(input: NewAsset, id: string, now: string): AssetDoc {
  return { id, createdAt: now, updatedAt: now, version: "v1", targetCountryIds: [], targetRoleFamilyIds: [], changelog: "", notes: "", ...input };
}

export type NewAnswer = Pick<Answer, "kindId" | "title"> & Partial<Omit<Answer, Base>>;
export function buildAnswer(input: NewAnswer, id: string, now: string): Answer {
  return { id, createdAt: now, updatedAt: now, body: "", themeIds: [], language: "en", tags: [], ...input };
}

export type NewInterview = Pick<Interview, "applicationId" | "roundTypeId"> & Partial<Omit<Interview, Base>>;
export function buildInterview(input: NewInterview, id: string, now: string): Interview {
  return {
    id, createdAt: now, updatedAt: now, format: "video", interviewerContactIds: [], prepChecklist: [],
    questionsAsked: "", selfRating: null, outcome: "pending", notes: "", ...input,
  };
}

export type NewPrep = Pick<PrepItem, "kindId" | "title"> & Partial<Omit<PrepItem, Base>>;
export function buildPrep(input: NewPrep, id: string, now: string): PrepItem {
  return { id, createdAt: now, updatedAt: now, patterns: [], difficulty: null, companyTags: [], attempts: 0, confidence: null, notes: "", ...input };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain && npm run typecheck`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/domain
git commit -m "feat(domain): entity types, ids, default settings and factories

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Priority scoring and the status-change rule

**Files:**
- Create: `src/domain/scoring.ts`, `src/domain/status.ts`
- Test: `tests/domain/scoring.test.ts`, `tests/domain/status.test.ts`

**Interfaces:**
- Consumes: `Application`, `Settings`, `StatusEntry`, `ActivityEntry` from `src/domain/types.ts`; `defaultSettings` from `src/domain/defaults.ts`.
- Produces: `priorityScore(app, weights): number | null`; `suggestedTier(score): Tier | null`; `findStatus(settings, id): StatusEntry | undefined`; `applyStatusChange(app, next, now, note?): Application`; `appendActivity(app, entry, now): Application`; `ACTIVITY_CAP = 200`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { priorityScore, suggestedTier } from "../../src/domain/scoring";

const W = { desire: 0.4, fit: 0.35, likelihood: 0.25 };

describe("priorityScore", () => {
  it("is 100 for all fives and 20 for all ones", () => {
    expect(priorityScore({ desire: 5, fit: 5, likelihood: 5 }, W)).toBe(100);
    expect(priorityScore({ desire: 1, fit: 1, likelihood: 1 }, W)).toBe(20);
  });
  it("weights each factor", () => {
    // 0.4*5 + 0.35*3 + 0.25*1 = 3.3 ; 3.3 / 5 = 0.66
    expect(priorityScore({ desire: 5, fit: 3, likelihood: 1 }, W)).toBe(66);
  });
  it("returns null when any rating is missing", () => {
    expect(priorityScore({ desire: 5, fit: null, likelihood: 5 }, W)).toBeNull();
  });
  it("returns null when weights sum to zero", () => {
    expect(priorityScore({ desire: 5, fit: 5, likelihood: 5 }, { desire: 0, fit: 0, likelihood: 0 })).toBeNull();
  });
});

describe("suggestedTier", () => {
  it("maps thresholds", () => {
    expect(suggestedTier(75)).toBe("A");
    expect(suggestedTier(74)).toBe("B");
    expect(suggestedTier(50)).toBe("B");
    expect(suggestedTier(49)).toBe("C");
    expect(suggestedTier(null)).toBeNull();
  });
});
```

`tests/domain/status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import { applyStatusChange, appendActivity, findStatus, ACTIVITY_CAP } from "../../src/domain/status";

const NOW = "2026-09-11T00:00:00.000Z";
const LATER = "2026-09-12T00:00:00.000Z";
const settings = defaultSettings("America/Toronto", NOW);
const base = () =>
  buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW);

describe("findStatus", () => {
  it("finds by id and returns undefined otherwise", () => {
    expect(findStatus(settings, "interviewing")?.label).toBe("Interviewing");
    expect(findStatus(settings, "nope")).toBeUndefined();
  });
});

describe("applyStatusChange", () => {
  it("appends a status activity and raises maxStageRank", () => {
    const next = applyStatusChange(base(), findStatus(settings, "interviewing")!, LATER, "recruiter emailed");
    expect(next.statusId).toBe("interviewing");
    expect(next.maxStageRank).toBe(6);
    expect(next.updatedAt).toBe(LATER);
    expect(next.activity).toEqual([{ at: LATER, type: "status", from: "applied", to: "interviewing", text: "recruiter emailed" }]);
  });

  it("sets closedAt when moving to a lost status and keeps maxStageRank", () => {
    const next = applyStatusChange(base(), findStatus(settings, "rejected")!, LATER);
    expect(next.closedAt).toBe(LATER);
    expect(next.maxStageRank).toBe(3);
  });

  it("clears closedAt and closedReasonId when reopening", () => {
    const closed = { ...applyStatusChange(base(), findStatus(settings, "rejected")!, LATER), closedReasonId: "no-response" };
    const reopened = applyStatusChange(closed, findStatus(settings, "applied")!, LATER);
    expect(reopened.closedAt).toBeUndefined();
    expect(reopened.closedReasonId).toBeUndefined();
  });

  it("is a no-op for the same status", () => {
    const app = base();
    expect(applyStatusChange(app, findStatus(settings, "applied")!, LATER)).toBe(app);
  });

  it("does not mutate the input", () => {
    const app = base();
    applyStatusChange(app, findStatus(settings, "offer")!, LATER);
    expect(app.statusId).toBe("applied");
    expect(app.activity).toEqual([]);
  });
});

describe("appendActivity", () => {
  it("caps the log at ACTIVITY_CAP keeping the newest", () => {
    let app = base();
    for (let i = 0; i < ACTIVITY_CAP + 5; i++) app = appendActivity(app, { type: "note", text: `n${i}` }, LATER);
    expect(app.activity).toHaveLength(ACTIVITY_CAP);
    expect(app.activity[app.activity.length - 1].text).toBe(`n${ACTIVITY_CAP + 4}`);
    expect(app.activity[0].text).toBe("n5");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/scoring.test.ts tests/domain/status.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/domain/scoring.ts`:
```ts
import type { Application, PriorityWeights, Tier } from "./types";

export function priorityScore(app: Pick<Application, "desire" | "fit" | "likelihood">, weights: PriorityWeights): number | null {
  if (app.desire == null || app.fit == null || app.likelihood == null) return null;
  const sum = weights.desire + weights.fit + weights.likelihood;
  if (sum <= 0) return null;
  const raw = weights.desire * app.desire + weights.fit * app.fit + weights.likelihood * app.likelihood;
  return Math.round((100 * raw) / (5 * sum));
}

export function suggestedTier(score: number | null): Tier | null {
  if (score == null) return null;
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  return "C";
}
```

`src/domain/status.ts`:
```ts
import type { ActivityEntry, Application, Settings, StatusEntry } from "./types";

export const ACTIVITY_CAP = 200;

export function findStatus(settings: Settings, id: string): StatusEntry | undefined {
  return settings.pickLists.statuses.find((s) => s.id === id);
}

export function appendActivity(app: Application, entry: Omit<ActivityEntry, "at">, now: string): Application {
  const activity = [...app.activity, { at: now, ...entry }].slice(-ACTIVITY_CAP);
  return { ...app, activity, updatedAt: now };
}

export function applyStatusChange(app: Application, next: StatusEntry, now: string, note?: string): Application {
  if (next.id === app.statusId) return app;
  const entry: Omit<ActivityEntry, "at"> = { type: "status", from: app.statusId, to: next.id, ...(note ? { text: note } : {}) };
  const withLog = appendActivity(app, entry, now);
  const closing = next.group !== "open";
  const { closedAt: _closedAt, closedReasonId: _closedReasonId, ...rest } = withLog;
  return {
    ...rest,
    statusId: next.id,
    maxStageRank: Math.max(app.maxStageRank, next.stageRank),
    ...(closing ? { closedAt: now, ...(app.closedReasonId ? { closedReasonId: app.closedReasonId } : {}) } : {}),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain && npm run typecheck`
Expected: PASS; typecheck 0. (If typecheck flags the unused `_closedAt`/`_closedReasonId` destructuring, that's fine under the current tsconfig; `noUnusedLocals` is off.)

- [ ] **Step 5: Commit**

```bash
git add src/domain/scoring.ts src/domain/status.ts tests/domain/scoring.test.ts tests/domain/status.test.ts
git commit -m "feat(domain): priority scoring and status-change rule

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Dates (Luxon), money, and settings migration

**Files:**
- Create: `src/domain/dates.ts`, `src/domain/money.ts`, `src/domain/migrate.ts`
- Test: `tests/domain/dates.test.ts`, `tests/domain/money.test.ts`, `tests/domain/migrate.test.ts`

**Interfaces:**
- Produces (dates): `isValidZone(tz)`, `localToUtcIso(local, tz)`, `makeDeadline(value, tz, dateOnly): Deadline`, `makeZoned(value, tz): ZonedInstant`, `formatInstant(iso, tz, {dateOnly?})`, `formatForHome(z, homeTz): {home, source}`, `toLocalInputValue(iso, tz, dateOnly)`, `todayIso(homeTz, now?)`, `daysUntil(iso, homeTz, now?)`, `isPastDate(isoDate, homeTz, now?)`, `urgency(days)`.
- Produces (money): `normalizeAmount(amount, currency, settings)`, `formatMoney(amount, currency)`, `formatCompRange(comp)`.
- Produces (migrate): `Migration`, `MIGRATIONS`, `migrateSettings(settings, migrations?, target?)`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/dates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  isValidZone, localToUtcIso, makeDeadline, makeZoned, formatForHome, toLocalInputValue, todayIso, daysUntil, isPastDate, urgency,
} from "../../src/domain/dates";

describe("zones and conversion", () => {
  it("validates IANA zones", () => {
    expect(isValidZone("Asia/Seoul")).toBe(true);
    expect(isValidZone("Mars/Olympus")).toBe(false);
  });
  it("converts a Seoul local time to UTC", () => {
    expect(localToUtcIso("2026-09-20T14:00", "Asia/Seoul")).toBe("2026-09-20T05:00:00.000Z");
  });
  it("throws on an invalid local time", () => {
    expect(() => localToUtcIso("nope", "Asia/Seoul")).toThrow();
  });
});

describe("makeDeadline / makeZoned", () => {
  it("date-only ends the day in the source zone", () => {
    expect(makeDeadline("2026-09-20", "Asia/Seoul", true)).toEqual({ at: "2026-09-20T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true });
  });
  it("timed deadline keeps the instant", () => {
    expect(makeDeadline("2026-09-20T09:30", "America/Toronto", false).at).toBe("2026-09-20T13:30:00.000Z");
  });
  it("makeZoned wraps an instant with its zone", () => {
    expect(makeZoned("2026-09-20T09:30", "America/Vancouver")).toEqual({ at: "2026-09-20T16:30:00.000Z", tz: "America/Vancouver" });
  });
});

describe("formatForHome", () => {
  it("shows home time and the source time when zones differ", () => {
    const r = formatForHome({ at: "2026-09-20T05:00:00.000Z", tz: "Asia/Seoul" }, "America/Toronto");
    expect(r.home).toContain("2026-09-20");
    expect(r.home).toContain("01:00");
    expect(r.source).toContain("14:00");
  });
  it("omits the source when zones match", () => {
    const r = formatForHome({ at: "2026-09-20T05:00:00.000Z", tz: "Asia/Seoul" }, "Asia/Seoul");
    expect(r.source).toBeNull();
  });
  it("never shifts a date-only deadline", () => {
    const r = formatForHome({ at: "2026-09-20T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true }, "America/Toronto");
    expect(r.home).toContain("2026-09-20");
    expect(r.home).not.toMatch(/\d{2}:\d{2}/);
    expect(r.source).toBeNull();
  });
});

describe("input values", () => {
  it("renders datetime-local and date values in the given zone", () => {
    expect(toLocalInputValue("2026-09-20T05:00:00.000Z", "Asia/Seoul", false)).toBe("2026-09-20T14:00");
    expect(toLocalInputValue("2026-09-20T14:59:59.999Z", "Asia/Seoul", true)).toBe("2026-09-20");
  });
});

describe("today / daysUntil / isPastDate / urgency", () => {
  const now = DateTime.fromISO("2026-09-11T12:00:00Z", { zone: "utc" });
  it("todayIso is the home-zone date", () => {
    expect(todayIso("Asia/Seoul", now)).toBe("2026-09-11");
    expect(todayIso("Pacific/Auckland", DateTime.fromISO("2026-09-11T23:30:00Z", { zone: "utc" }))).toBe("2026-09-12");
  });
  it("daysUntil counts whole days in the home zone", () => {
    // 2026-09-13T03:00Z is 2026-09-12 23:00 in Toronto → 1 day after 2026-09-11
    expect(daysUntil("2026-09-13T03:00:00.000Z", "America/Toronto", now)).toBe(1);
    expect(daysUntil("2026-09-10T12:00:00.000Z", "America/Toronto", now)).toBe(-1);
  });
  it("isPastDate compares ISO dates against today", () => {
    expect(isPastDate("2026-09-10", "America/Toronto", now)).toBe(true);
    expect(isPastDate("2026-09-11", "America/Toronto", now)).toBe(false);
  });
  it("urgency bands", () => {
    expect(urgency(-1)).toBe("overdue");
    expect(urgency(0)).toBe("urgent");
    expect(urgency(1)).toBe("urgent");
    expect(urgency(6)).toBe("soon");
    expect(urgency(7)).toBe("later");
  });
});
```

`tests/domain/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeAmount, formatMoney, formatCompRange } from "../../src/domain/money";

const settings = { displayCurrency: "CAD", fxRates: { USD: 1.36, KRW: 0.001 } };

describe("normalizeAmount", () => {
  it("returns the amount unchanged in the display currency", () => {
    expect(normalizeAmount(100000, "CAD", settings)).toBe(100000);
  });
  it("applies a known rate and rounds", () => {
    expect(normalizeAmount(100000, "USD", settings)).toBe(136000);
    expect(normalizeAmount(70_000_000, "KRW", settings)).toBe(70000);
  });
  it("returns null without a rate", () => {
    expect(normalizeAmount(100, "JPY", settings)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats with thousands separators and no decimals", () => {
    expect(formatMoney(1000000, "KRW")).toMatch(/1,000,000/);
    expect(formatMoney(95000, "CAD")).toMatch(/95,000/);
  });
});

describe("formatCompRange", () => {
  it("renders a dash without amounts", () => {
    expect(formatCompRange(undefined)).toBe("—");
    expect(formatCompRange({ currency: "CAD", period: "year" })).toBe("—");
  });
  it("renders min–max with currency and period", () => {
    expect(formatCompRange({ min: 90000, max: 110000, currency: "CAD", period: "year" })).toMatch(/90,000.*110,000.*\/ year/);
    expect(formatCompRange({ min: 50, currency: "USD", period: "hour" })).toMatch(/50.*\/ hour/);
  });
});
```

`tests/domain/migrate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings, SCHEMA_VERSION } from "../../src/domain/defaults";
import { migrateSettings, type Migration } from "../../src/domain/migrate";

const NOW = "2026-09-11T00:00:00.000Z";

describe("migrateSettings", () => {
  it("is a no-op at the current version", () => {
    const s = defaultSettings("UTC", NOW);
    expect(migrateSettings(s)).toBe(s);
  });
  it("applies pending migrations in order and stamps the version", () => {
    const s = { ...defaultSettings("UTC", NOW), schemaVersion: 1 };
    const log: number[] = [];
    const migrations: Migration[] = [
      { to: 2, apply: (x) => { log.push(2); return { ...x, followUpCadenceDays: 10 }; } },
      { to: 3, apply: (x) => { log.push(3); return { ...x, displayCurrency: "USD" }; } },
    ];
    const out = migrateSettings(s, migrations, 3);
    expect(log).toEqual([2, 3]);
    expect(out.schemaVersion).toBe(3);
    expect(out.followUpCadenceDays).toBe(10);
    expect(out.displayCurrency).toBe("USD");
  });
  it("skips migrations at or below the stored version", () => {
    const s = { ...defaultSettings("UTC", NOW), schemaVersion: 2 };
    const migrations: Migration[] = [{ to: 2, apply: () => { throw new Error("must not run"); } }];
    expect(migrateSettings(s, migrations, 2).schemaVersion).toBe(2);
  });
  it("SCHEMA_VERSION is 1 for this plan", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/dates.test.ts tests/domain/money.test.ts tests/domain/migrate.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/domain/dates.ts`:
```ts
import { DateTime } from "luxon";
import type { Deadline, ZonedInstant } from "./types";

export function isValidZone(tz: string): boolean {
  return DateTime.utc().setZone(tz).isValid;
}

function parseLocal(value: string, tz: string): DateTime {
  const dt = DateTime.fromISO(value, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid date "${value}" for zone ${tz}: ${dt.invalidReason}`);
  return dt;
}

export function localToUtcIso(local: string, tz: string): string {
  return parseLocal(local, tz).toUTC().toISO() as string;
}

export function makeDeadline(value: string, tz: string, dateOnly: boolean): Deadline {
  const dt = dateOnly ? parseLocal(value, tz).endOf("day") : parseLocal(value, tz);
  return { at: dt.toUTC().toISO() as string, tz, dateOnly };
}

export function makeZoned(value: string, tz: string): ZonedInstant {
  return { at: localToUtcIso(value, tz), tz };
}

export function formatInstant(iso: string, tz: string, opts: { dateOnly?: boolean } = {}): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) return iso;
  return opts.dateOnly ? dt.toFormat("yyyy-MM-dd (ccc)") : dt.toFormat("yyyy-MM-dd (ccc) HH:mm ZZZZ");
}

export function formatForHome(z: ZonedInstant & { dateOnly?: boolean }, homeTz: string): { home: string; source: string | null } {
  if (z.dateOnly) return { home: formatInstant(z.at, z.tz, { dateOnly: true }), source: null };
  const home = formatInstant(z.at, homeTz);
  const source = z.tz !== homeTz ? formatInstant(z.at, z.tz) : null;
  return { home, source };
}

export function toLocalInputValue(iso: string, tz: string, dateOnly: boolean): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) return "";
  return dateOnly ? dt.toFormat("yyyy-MM-dd") : dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

export function todayIso(homeTz: string, now: DateTime = DateTime.utc()): string {
  return now.setZone(homeTz).toISODate() as string;
}

export function daysUntil(iso: string, homeTz: string, now: DateTime = DateTime.utc()): number {
  const target = DateTime.fromISO(iso, { zone: "utc" }).setZone(homeTz).startOf("day");
  const today = now.setZone(homeTz).startOf("day");
  return Math.round(target.diff(today, "days").days);
}

export function isPastDate(isoDate: string, homeTz: string, now: DateTime = DateTime.utc()): boolean {
  return isoDate < todayIso(homeTz, now);
}

export type Urgency = "overdue" | "urgent" | "soon" | "later";
export function urgency(daysLeft: number): Urgency {
  if (daysLeft < 0) return "overdue";
  if (daysLeft < 2) return "urgent";
  if (daysLeft < 7) return "soon";
  return "later";
}
```

`src/domain/money.ts`:
```ts
import type { Comp, Settings } from "./types";

export function normalizeAmount(amount: number, currency: string, settings: Pick<Settings, "displayCurrency" | "fxRates">): number | null {
  if (currency === settings.displayCurrency) return amount;
  const rate = settings.fxRates[currency];
  if (!rate || rate <= 0) return null;
  return Math.round(amount * rate);
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}

export function formatCompRange(comp: Comp | undefined): string {
  if (!comp || (comp.min == null && comp.max == null)) return "—";
  const min = comp.min != null ? formatMoney(comp.min, comp.currency) : null;
  const max = comp.max != null ? formatMoney(comp.max, comp.currency) : null;
  const range = min && max ? `${min}–${max}` : (min ?? max) as string;
  return `${range} / ${comp.period}`;
}
```

`src/domain/migrate.ts`:
```ts
import { SCHEMA_VERSION } from "./defaults";
import type { Settings } from "./types";

export interface Migration {
  to: number;
  apply: (settings: Settings) => Settings;
}

/** Add one entry per schema bump, ascending by `to`. */
export const MIGRATIONS: Migration[] = [];

export function migrateSettings(settings: Settings, migrations: Migration[] = MIGRATIONS, target: number = SCHEMA_VERSION): Settings {
  let current = settings;
  for (const m of migrations) {
    if (m.to > current.schemaVersion && m.to <= target) current = { ...m.apply(current), schemaVersion: m.to };
  }
  return current;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain && npm run typecheck`
Expected: PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dates.ts src/domain/money.ts src/domain/migrate.ts tests/domain/dates.test.ts tests/domain/money.test.ts tests/domain/migrate.test.ts
git commit -m "feat(domain): timezone-aware dates, money normalization, settings migration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Capability layer: types, fake db, fake downloads, error text, resolver

**Files:**
- Create: `src/capabilities/types.ts`, `src/capabilities/fakeDb.ts`, `src/capabilities/fakeDownloads.ts`, `src/capabilities/errors.ts`, `src/capabilities/resolve.ts`
- Test: `tests/capabilities/fakeDb.test.ts`, `tests/capabilities/resolve.test.ts`, `tests/capabilities/errors.test.ts`
- Already present (do not edit): `src/types/claude/{claude,db,assets,downloads,sample}.d.ts` — global ambient types `DB`, `DocumentReference`, `CollectionReference`, `Query`, `DocumentSnapshot`, `QuerySnapshot`, `DocumentChange`, `SnapshotMetadata`, `Unsubscribe`, `DbError`, `DbErrorCode`, `AcquireOptions`, `AcquireResult`, `Claude.Assets`, `Claude.downloads`, `Claude.sample`, `ClaudeCapabilityMap`, `Window.claude`.

**Interfaces:**
- Produces: `DbLike = DB`; `AssetsLike = Claude.Assets`; `DownloadsLike = typeof Claude.downloads`; `SampleLike = typeof Claude.sample`; `Capabilities {db, assets, downloads, sample}` each a `Promise<X | null>`; `absentCapabilities()`; `createFakeDb(opts?): FakeDb` (a `DB` plus `_dump()`, `_load(docs)`, `_reset()`); `createAnchorDownloads(): DownloadsLike`; `describeDbError(e): string`; `isTransient(e): boolean`; `errorCode(e): string | undefined`; `createCapabilities(): Capabilities`.

- [ ] **Step 1: Write the failing tests**

`tests/capabilities/fakeDb.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";

const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe("path grammar", () => {
  const db = createFakeDb();
  it("rejects odd document paths and even collection paths", () => {
    expect(() => db.doc("tasks")).toThrow(TypeError);
    expect(() => db.collection("tasks/t1")).toThrow(TypeError);
    expect(() => db.doc("tasks/../t1")).toThrow(TypeError);
  });
  it("accepts nested paths", () => {
    expect(db.doc("boards/b1/columns/c2").path).toBe("boards/b1/columns/c2");
    expect(db.collection("boards/b1/columns").path).toBe("boards/b1/columns");
  });
});

describe("documents", () => {
  it("set/get/delete round-trip; missing docs read as not existing", async () => {
    const db = createFakeDb();
    const ref = db.doc("tasks/t1");
    expect((await ref.get()).exists).toBe(false);
    await ref.set({ title: "a", tags: ["x"] });
    const snap = await ref.get();
    expect(snap.exists).toBe(true);
    expect(snap.id).toBe("t1");
    expect(snap.data()).toEqual({ title: "a", tags: ["x"] });
    expect(Object.isFrozen(snap.data())).toBe(true);
    await ref.delete();
    expect((await ref.get()).exists).toBe(false);
  });

  it("update merges nested objects, replaces arrays, and requires existence", async () => {
    const db = createFakeDb();
    const ref = db.doc("tasks/t1");
    await expect(ref.update({ a: 1 })).rejects.toMatchObject({ code: "invalid_argument" });
    await ref.set({ nested: { a: 1, b: 2 }, list: [1, 2] });
    await ref.update({ nested: { b: 3 }, list: [9] });
    expect((await ref.get()).data()).toEqual({ nested: { a: 1, b: 3 }, list: [9] });
  });

  it("set rejects non-object bodies", async () => {
    const db = createFakeDb();
    await expect(db.doc("tasks/t1").set([] as unknown as Record<string, unknown>)).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("onSnapshot fires initially and on every change until unsubscribed", async () => {
    const db = createFakeDb();
    const seen: boolean[] = [];
    const off = db.doc("tasks/t1").onSnapshot((s) => seen.push(s.exists));
    await tick();
    await db.doc("tasks/t1").set({ x: 1 });
    off();
    await db.doc("tasks/t1").set({ x: 2 });
    expect(seen).toEqual([false, true]);
  });
});

describe("collections and queries", () => {
  async function seeded() {
    const db = createFakeDb();
    await db.doc("apps/a1").set({ title: "b", rank: 2, tags: ["ca"] });
    await db.doc("apps/a2").set({ title: "a", rank: 5, tags: ["us", "ca"] });
    await db.doc("apps/a3").set({ title: "c", tags: [] });
    await db.doc("other/o1").set({ title: "z" });
    return db;
  }

  it("lists direct children ordered by id", async () => {
    const db = await seeded();
    const snap = await db.collection("apps").get();
    expect(snap.docs.map((d) => d.id)).toEqual(["a1", "a2", "a3"]);
    expect(snap.size).toBe(3);
  });

  it("filters with where operators", async () => {
    const db = await seeded();
    expect((await db.collection("apps").where("rank", ">=", 3).get()).docs.map((d) => d.id)).toEqual(["a2"]);
    expect((await db.collection("apps").where("tags", "array-contains", "ca").get()).docs.map((d) => d.id)).toEqual(["a1", "a2"]);
    expect((await db.collection("apps").where("title", "in", ["a", "c"]).get()).docs.map((d) => d.id)).toEqual(["a2", "a3"]);
    expect((await db.collection("apps").where("rank", "==", 2).get()).docs.map((d) => d.id)).toEqual(["a1"]);
  });

  it("orders with missing fields last and applies limit", async () => {
    const db = await seeded();
    expect((await db.collection("apps").orderBy("rank", "desc").get()).docs.map((d) => d.id)).toEqual(["a2", "a1", "a3"]);
    expect((await db.collection("apps").orderBy("title").limit(2).get()).docs.map((d) => d.id)).toEqual(["a2", "a1"]);
  });

  it("add mints an id and doc() without id mints one too", async () => {
    const db = createFakeDb();
    const ref = await db.collection("apps").add({ title: "n" });
    expect(ref.path.startsWith("apps/")).toBe(true);
    expect((await ref.get()).exists).toBe(true);
    expect(db.collection("apps").doc().id.length).toBeGreaterThan(4);
  });

  it("onSnapshot reports added, modified and removed changes", async () => {
    const db = await seeded();
    const events: string[][] = [];
    const off = db.collection("apps").onSnapshot((snap) => events.push(snap.docChanges().map((c) => `${c.type}:${c.doc.id}`)));
    await tick();
    await db.doc("apps/a1").set({ title: "b2" });
    await db.doc("apps/a3").delete();
    off();
    expect(events[0]).toEqual(["added:a1", "added:a2", "added:a3"]);
    expect(events[1]).toEqual(["modified:a1"]);
    expect(events[2]).toEqual(["removed:a3"]);
  });
});

describe("acquire", () => {
  it("grants the first holder, refuses a second while live, renews the same holder", async () => {
    const db = createFakeDb();
    const ref = db.doc("settings/main");
    const a = await ref.acquire({ holder: "A", ttlMs: 5000 });
    expect(a.acquired).toBe(true);
    const b = await ref.acquire({ holder: "B", ttlMs: 5000 });
    expect(b.acquired).toBe(false);
    expect(b.expiresAt).toBeDefined();
    const again = await ref.acquire({ holder: "A", ttlMs: 5000 });
    expect(again.acquired).toBe(true);
    expect((await ref.get()).exists).toBe(false);
  });
});

describe("persistence", () => {
  it("reloads documents from the provided storage", async () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const db1 = createFakeDb({ persistKey: "t", storage });
    await db1.doc("apps/a1").set({ title: "persisted" });
    const db2 = createFakeDb({ persistKey: "t", storage });
    expect((await db2.doc("apps/a1").get()).data()).toEqual({ title: "persisted" });
    expect(db2._dump()).toEqual({ "apps/a1": { title: "persisted" } });
  });

  it("_load replaces everything and notifies listeners", async () => {
    const db = createFakeDb();
    const seen: number[] = [];
    db.collection("apps").onSnapshot((s) => seen.push(s.size));
    await tick();
    db._load({ "apps/x": { title: "x" }, "apps/y": { title: "y" } });
    expect(seen).toEqual([0, 2]);
    db._reset();
    expect(seen).toEqual([0, 2, 0]);
  });
});
```

`tests/capabilities/errors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { describeDbError, isTransient, errorCode } from "../../src/capabilities/errors";

describe("db error helpers", () => {
  it("maps known codes to user text", () => {
    expect(describeDbError({ code: "quota_exceeded", message: "x" })).toMatch(/full/i);
    expect(describeDbError({ code: "resource_exhausted", message: "x" })).toMatch(/wait/i);
    expect(describeDbError({ code: "revoked", message: "x" })).toMatch(/reload/i);
    expect(describeDbError(new Error("boom"))).toMatch(/could not save/i);
  });
  it("flags only unavailable as transient", () => {
    expect(isTransient({ code: "unavailable", message: "" })).toBe(true);
    expect(isTransient({ code: "quota_exceeded", message: "" })).toBe(false);
    expect(errorCode("nope")).toBeUndefined();
  });
});
```

`tests/capabilities/resolve.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { createCapabilities } from "../../src/capabilities/resolve";

describe("createCapabilities", () => {
  afterEach(() => {
    delete (window as unknown as { claude?: unknown }).claude;
  });

  it("uses window.claude.use when present", async () => {
    const calls: string[] = [];
    (window as unknown as { claude: unknown }).claude = { use: async (name: string) => { calls.push(name); return name === "db" ? { marker: "real" } : null; } };
    const caps = createCapabilities();
    expect(await caps.db).toEqual({ marker: "real" });
    expect(await caps.sample).toBeNull();
    expect(calls.sort()).toEqual(["assets", "db", "downloads", "sample"]);
  });

  it("falls back to a persistent fake db and anchor downloads without window.claude", async () => {
    const caps = createCapabilities();
    const db = await caps.db;
    expect(db).not.toBeNull();
    expect(typeof db!.doc("a/b").set).toBe("function");
    expect(await caps.downloads).not.toBeNull();
    expect(await caps.assets).toBeNull();
    expect(await caps.sample).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/capabilities`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/capabilities/types.ts`:
```ts
// The ambient contracts live in src/types/claude/*.d.ts (global declarations).
export type DbLike = DB;
export type AssetsLike = Claude.Assets;
export type DownloadsLike = typeof Claude.downloads;
export type SampleLike = typeof Claude.sample;

export interface Capabilities {
  db: Promise<DbLike | null>;
  assets: Promise<AssetsLike | null>;
  downloads: Promise<DownloadsLike | null>;
  sample: Promise<SampleLike | null>;
}

export function absentCapabilities(): Capabilities {
  return {
    db: Promise.resolve(null),
    assets: Promise.resolve(null),
    downloads: Promise.resolve(null),
    sample: Promise.resolve(null),
  };
}
```

`src/capabilities/errors.ts`:
```ts
export function errorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return undefined;
}

export function isTransient(e: unknown): boolean {
  return errorCode(e) === "unavailable";
}

export function describeDbError(e: unknown): string {
  switch (errorCode(e)) {
    case "quota_exceeded":
      return "Storage is full. Delete some records before adding more.";
    case "resource_exhausted":
      return "Too many changes at once. Wait a moment and try again.";
    case "unavailable":
      return "Storage is temporarily unavailable. Try again.";
    case "revoked":
      return "Access to storage was withdrawn. Reload the page.";
    case "invalid_argument":
      return "That change was rejected as invalid.";
    case "read_only":
      return "Storage is unavailable in this view, so changes cannot be saved.";
    default:
      return "Could not save. Try again.";
  }
}
```

`src/capabilities/fakeDb.ts`:
```ts
/* In-memory implementation of the platform `db` contract (see src/types/claude/db.d.ts).
   Used for local development (persisted to localStorage) and for tests. */

type Body = Record<string, unknown>;
type Listener = () => void;
interface Filter { field: string; op: string; value: unknown }
interface Order { field: string; dir: "asc" | "desc" }

export interface FakeDbOptions {
  persistKey?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface FakeDb extends DB {
  _dump(): Record<string, Body>;
  _load(docs: Record<string, Body>): void;
  _reset(): void;
}

function dbError(code: DbErrorCode, message: string): DbError {
  return { code, message };
}

const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;
function segments(path: string): string[] {
  const parts = path.split("/");
  for (const p of parts) {
    if (p === "" || p === "." || p === ".." || !SEGMENT.test(p)) throw new TypeError(`invalid path segment in "${path}"`);
  }
  return parts;
}
function assertDocPath(path: string): void {
  if (segments(path).length % 2 !== 0) throw new TypeError(`document path needs an even number of segments: "${path}"`);
}
function assertCollectionPath(path: string): void {
  if (segments(path).length % 2 !== 1) throw new TypeError(`collection path needs an odd number of segments: "${path}"`);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
function isPlainObject(v: unknown): v is Body {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function deepMerge(base: Body, patch: Body): Body {
  const out: Body = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k] as Body, v) : v;
  }
  return out;
}
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const lastOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function matches(body: Body, f: Filter): boolean {
  const v = body[f.field];
  if (v === undefined) return false;
  switch (f.op) {
    case "==": return v === f.value;
    case "!=": return v !== f.value;
    case "<": return compare(v, f.value) < 0;
    case "<=": return compare(v, f.value) <= 0;
    case ">": return compare(v, f.value) > 0;
    case ">=": return compare(v, f.value) >= 0;
    case "in": return Array.isArray(f.value) && f.value.includes(v);
    case "not-in": return Array.isArray(f.value) && !f.value.includes(v);
    case "array-contains": return Array.isArray(v) && v.includes(f.value);
    default: throw dbError("invalid_argument", `unknown operator ${f.op}`);
  }
}

export function createFakeDb(opts: FakeDbOptions = {}): FakeDb {
  const storage = opts.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  let docs = new Map<string, Body>();
  const leases = new Map<string, { holder: string; expiresAt: number }>();
  const versions = new Map<string, number>();
  const docListeners = new Map<string, Set<Listener>>();
  const collListeners = new Map<string, Set<Listener>>();
  const metadata: SnapshotMetadata = { fromCache: false, hasPendingWrites: false };

  if (opts.persistKey && storage) {
    try {
      const raw = storage.getItem(opts.persistKey);
      if (raw) docs = new Map(Object.entries(JSON.parse(raw) as Record<string, Body>));
    } catch {
      /* corrupt or unavailable storage: start empty */
    }
  }

  function persist(): void {
    if (!opts.persistKey || !storage) return;
    try {
      storage.setItem(opts.persistKey, JSON.stringify(Object.fromEntries(docs)));
    } catch {
      /* quota or private mode */
    }
  }
  function fire(map: Map<string, Set<Listener>>, key: string): void {
    map.get(key)?.forEach((fn) => fn());
  }
  function notify(path: string): void {
    persist();
    fire(docListeners, path);
    fire(collListeners, parentOf(path));
  }
  function notifyAll(): void {
    persist();
    for (const set of docListeners.values()) set.forEach((fn) => fn());
    for (const set of collListeners.values()) set.forEach((fn) => fn());
  }
  function addListener(map: Map<string, Set<Listener>>, key: string, fn: Listener): Unsubscribe {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }
  function bump(path: string): void {
    versions.set(path, (versions.get(path) ?? 0) + 1);
  }

  function snapshotOf(path: string): DocumentSnapshot {
    const body = docs.get(path);
    const frozen = body === undefined ? undefined : deepFreeze(clone(body));
    return { id: lastOf(path), exists: body !== undefined, data: () => frozen, metadata };
  }

  function docRef(path: string): DocumentReference {
    assertDocPath(path);
    return {
      id: lastOf(path),
      path,
      async get() {
        return snapshotOf(path);
      },
      async set(data) {
        if (!isPlainObject(data)) throw dbError("invalid_argument", "document body must be a plain object");
        docs.set(path, clone(data));
        bump(path);
        notify(path);
      },
      async update(data) {
        const current = docs.get(path);
        if (current === undefined) throw dbError("invalid_argument", `update requires an existing document: ${path}`);
        if (!isPlainObject(data)) throw dbError("invalid_argument", "patch must be a plain object");
        docs.set(path, deepMerge(current, clone(data)));
        bump(path);
        notify(path);
      },
      async delete() {
        if (docs.delete(path)) notify(path);
      },
      async acquire({ holder, ttlMs, data }) {
        const now = Date.now();
        const ttl = Math.min(600000, Math.max(1000, ttlMs || 30000));
        const current = leases.get(path);
        if (current && current.expiresAt > now && current.holder !== holder) {
          return { acquired: false, expiresAt: new Date(current.expiresAt).toISOString() };
        }
        const expiresAt = now + ttl;
        leases.set(path, { holder, expiresAt });
        if (data) {
          docs.set(path, deepMerge(docs.get(path) ?? {}, clone(data)));
          bump(path);
          notify(path);
        }
        return { acquired: true, version: versions.get(path) ?? 0, expiresAt: new Date(expiresAt).toISOString(), holder };
      },
      onSnapshot(next) {
        const fn = () => next(snapshotOf(path));
        const off = addListener(docListeners, path, fn);
        queueMicrotask(fn);
        return off;
      },
      collection(sub) {
        return collRef(`${path}/${sub}`);
      },
    };
  }

  function runQuery(coll: string, filters: Filter[], order?: Order, max?: number): DocumentSnapshot[] {
    let rows: { path: string; body: Body }[] = [];
    for (const [path, body] of docs) if (parentOf(path) === coll) rows.push({ path, body });
    rows = rows.filter((r) => filters.every((f) => matches(r.body, f)));
    if (order) {
      rows.sort((a, b) => {
        const av = a.body[order.field];
        const bv = b.body[order.field];
        if (av === undefined && bv === undefined) return compare(lastOf(a.path), lastOf(b.path));
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        const c = compare(av, bv);
        return order.dir === "desc" ? -c : c;
      });
    } else {
      rows.sort((a, b) => compare(lastOf(a.path), lastOf(b.path)));
    }
    if (max !== undefined) rows = rows.slice(0, max);
    return rows.map((r) => snapshotOf(r.path));
  }

  function makeQuery(coll: string, filters: Filter[], order?: Order, max?: number): Query {
    const build = (): QuerySnapshot => {
      const list = runQuery(coll, filters, order, max);
      return {
        docs: list,
        size: list.length,
        empty: list.length === 0,
        docChanges: () => list.map((doc, i) => ({ type: "added" as const, doc, oldIndex: -1, newIndex: i })),
        metadata,
      };
    };
    return {
      where(field, op, value) {
        if (filters.length >= 10) throw dbError("invalid_argument", "at most 10 filters");
        return makeQuery(coll, [...filters, { field, op, value }], order, max);
      },
      orderBy(field, dir = "asc") {
        return makeQuery(coll, filters, { field, dir }, max);
      },
      limit(n) {
        if (n < 1 || n > 1000) throw dbError("invalid_argument", "limit must be between 1 and 1000");
        return makeQuery(coll, filters, order, n);
      },
      async get() {
        return build();
      },
      onSnapshot(next) {
        let previous = new Map<string, string>();
        const fn = () => {
          const snap = build();
          const current = new Map(snap.docs.map((d) => [d.id, JSON.stringify(d.data())] as const));
          const changes: DocumentChange[] = [];
          snap.docs.forEach((doc, i) => {
            const before = previous.get(doc.id);
            if (before === undefined) changes.push({ type: "added", doc, oldIndex: -1, newIndex: i });
            else if (before !== current.get(doc.id)) changes.push({ type: "modified", doc, oldIndex: i, newIndex: i });
          });
          for (const [id, body] of previous) {
            if (!current.has(id)) {
              const last = deepFreeze(JSON.parse(body) as Body);
              changes.push({ type: "removed", doc: { id, exists: true, data: () => last, metadata }, oldIndex: -1, newIndex: -1 });
            }
          }
          previous = current;
          next({ ...snap, docChanges: () => changes });
        };
        const off = addListener(collListeners, coll, fn);
        queueMicrotask(fn);
        return off;
      },
    };
  }

  function collRef(path: string): CollectionReference {
    assertCollectionPath(path);
    const ref: CollectionReference = {
      ...makeQuery(path, []),
      path,
      doc(id?: string) {
        const child = id ?? `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        return docRef(`${path}/${child}`);
      },
      async add(data) {
        const r = ref.doc();
        await r.set(data);
        return r;
      },
    };
    return ref;
  }

  return {
    doc: docRef,
    collection: collRef,
    _dump: () => Object.fromEntries([...docs].map(([k, v]) => [k, clone(v)])),
    _load: (all) => {
      docs = new Map(Object.entries(clone(all)));
      notifyAll();
    },
    _reset: () => {
      docs = new Map();
      leases.clear();
      notifyAll();
    },
  };
}
```

`src/capabilities/fakeDownloads.ts`:
```ts
import type { DownloadsLike } from "./types";

/** Local-dev stand-in: triggers a browser download through a temporary anchor. */
export function createAnchorDownloads(): DownloadsLike {
  return {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { status: "saved" as const };
    },
  } as DownloadsLike;
}
```

`src/capabilities/resolve.ts`:
```ts
import type { Capabilities } from "./types";
import { createFakeDb } from "./fakeDb";
import { createAnchorDownloads } from "./fakeDownloads";

export const DEV_PERSIST_KEY = "job-hunt-hq-dev";

/** Real capabilities inside the claude.ai viewer; localStorage-backed fakes for local development. */
export function createCapabilities(): Capabilities {
  const w = window as Window & { claude?: Claude };
  if (w.claude && typeof w.claude.use === "function") {
    return {
      db: w.claude.use("db"),
      assets: w.claude.use("assets"),
      downloads: w.claude.use("downloads"),
      sample: w.claude.use("sample"),
    };
  }
  return {
    db: Promise.resolve(createFakeDb({ persistKey: DEV_PERSIST_KEY })),
    assets: Promise.resolve(null),
    downloads: Promise.resolve(createAnchorDownloads()),
    sample: Promise.resolve(null),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/capabilities && npm run typecheck`
Expected: PASS; typecheck 0. If `typecheck` complains that `Window.claude` is required (the platform d.ts declares it non-optional), keep the `w.claude &&` guard: the cast to `Window & { claude?: Claude }` makes it optional for our check.

- [ ] **Step 5: Commit**

```bash
git add src/capabilities src/types tests/capabilities
git commit -m "feat(capabilities): typed capability layer with fake db and dev downloads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Store, sync, repository, context

**Files:**
- Create: `src/store/store.ts`, `src/store/sync.ts`, `src/store/repository.ts`, `src/store/context.tsx`
- Test: `tests/store/sync.test.ts`, `tests/store/repository.test.ts`

**Interfaces:**
- Consumes: `DbLike` (Task 5), `createFakeDb` (tests), `COLLECTIONS`, `EntityMap`, `Settings`, `Profile` (Task 2), `defaultSettings`/`defaultProfile` (Task 2), `migrateSettings` (Task 4), `applyStatusChange`/`appendActivity`/`findStatus` (Task 3), `buildApplication`/`buildCompany` (Task 2), `describeDbError`/`isTransient` (Task 5).
- Produces: `StoreState`, `Store {getState, setState, subscribe}`, `createStore(initial?)`, `emptyState()`, `useStoreState(store)`; `startSync(db, store, {homeTz, now?, onError?}): {stop(), ready}`; `Repository` with `readOnly`, `get(collection, id)`, `create(collection, doc)`, `update(collection, id, patch)`, `remove(collection, id)`, `saveSettings(settings)`, `saveProfile(profile)`, `createCompany(input)`, `createApplication(input)`, `changeStatus(appId, statusId, note?)`, `logActivity(appId, entry)`; `RepoError {code, message}`; `stripUndefined(value)`; `AppContext`, `AppServices {store, repo, caps}`, `useApp()`, `useAppState()`, `useSettings()`, `useProfile()`.

- [ ] **Step 1: Write the failing tests**

`tests/store/sync.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { defaultSettings } from "../../src/domain/defaults";
import { createStore } from "../../src/store/store";
import { startSync } from "../../src/store/sync";

const NOW = "2026-09-11T00:00:00.000Z";

describe("startSync", () => {
  it("seeds settings and profile on an empty store and becomes ready", async () => {
    const db = createFakeDb();
    const store = createStore();
    const h = startSync(db, store, { homeTz: "Asia/Seoul", now: () => NOW });
    await h.ready;
    const s = store.getState();
    expect(s.ready).toBe(true);
    expect(s.readOnly).toBe(false);
    expect(s.settings?.homeTz).toBe("Asia/Seoul");
    expect(s.settings?.pickLists.statuses).toHaveLength(13);
    expect(s.profile?.workAuth.KR).toBeDefined();
    expect((await db.doc("settings/main").get()).exists).toBe(true);
    expect((await db.doc("profile/main").get()).exists).toBe(true);
    h.stop();
  });

  it("keeps existing settings and mirrors collection changes live", async () => {
    const db = createFakeDb();
    await db.doc("settings/main").set({ ...defaultSettings("UTC", NOW), homeTz: "America/Toronto" } as unknown as Record<string, unknown>);
    const store = createStore();
    const h = startSync(db, store, { homeTz: "Asia/Seoul", now: () => NOW });
    await h.ready;
    expect(store.getState().settings?.homeTz).toBe("America/Toronto");
    await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify" });
    expect(store.getState().companies.co_1?.name).toBe("Shopify");
    await db.doc("companies/co_1").delete();
    expect(store.getState().companies.co_1).toBeUndefined();
    h.stop();
    await db.doc("companies/co_2").set({ id: "co_2", name: "After stop" });
    expect(store.getState().companies.co_2).toBeUndefined();
  });

  it("marks the store read-only on a terminal subscription error", async () => {
    const db = createFakeDb();
    const broken = {
      ...db,
      collection: (path: string) => {
        const real = db.collection(path);
        return { ...real, onSnapshot: (_next: unknown, error?: (e: DbError) => void) => { error?.({ code: "revoked", message: "gone" }); return () => {}; } } as unknown as CollectionReference;
      },
    } as unknown as DB;
    const store = createStore();
    const errors: string[] = [];
    const h = startSync(broken, store, { homeTz: "UTC", onError: (e) => errors.push(e.code) });
    await h.ready;
    expect(store.getState().readOnly).toBe(true);
    expect(errors).toContain("revoked");
    h.stop();
  });
});
```

`tests/store/repository.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { buildCompany } from "../../src/domain/factories";
import { createStore } from "../../src/store/store";
import { startSync } from "../../src/store/sync";
import { Repository, RepoError, stripUndefined } from "../../src/store/repository";

const NOW = "2026-09-11T00:00:00.000Z";

async function boot() {
  const db = createFakeDb();
  const store = createStore();
  const h = startSync(db, store, { homeTz: "UTC", now: () => NOW });
  await h.ready;
  return { db, store, repo: new Repository(db, store, () => NOW), h };
}

describe("stripUndefined", () => {
  it("drops undefined keys recursively", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: "x" } })).toEqual({ a: 1, c: { e: "x" } });
  });
});

describe("Repository", () => {
  it("createCompany writes a document the store mirrors", async () => {
    const { repo, store } = await boot();
    const co = await repo.createCompany({ name: "Shopify" });
    expect(co.id).toMatch(/^co_/);
    expect(store.getState().companies[co.id]?.name).toBe("Shopify");
  });

  it("createApplication takes maxStageRank from its status", async () => {
    const { repo } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied" });
    expect(app.maxStageRank).toBe(3);
    expect(app.createdAt).toBe(NOW);
  });

  it("createApplication rejects an unknown status", async () => {
    const { repo } = await boot();
    await expect(repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "nope" })).rejects.toBeInstanceOf(RepoError);
  });

  it("update merges a patch, stamps updatedAt, and clears keys set to undefined", async () => {
    const { repo, db } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved", city: "Toronto" });
    await repo.update("applications", app.id, { city: undefined, title: "New title" });
    const stored = (await db.doc(`applications/${app.id}`).get()).data();
    expect(stored).not.toHaveProperty("city");
    expect(stored?.title).toBe("New title");
    expect(stored?.updatedAt).toBe(NOW);
  });

  it("update of a missing record throws not_found", async () => {
    const { repo } = await boot();
    await expect(repo.update("companies", "co_missing", { name: "x" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("changeStatus appends activity, closes and reopens", async () => {
    const { repo, store } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied" });
    await repo.changeStatus(app.id, "interviewing", "phone screen booked");
    let cur = store.getState().applications[app.id];
    expect(cur.statusId).toBe("interviewing");
    expect(cur.maxStageRank).toBe(6);
    expect(cur.activity.at(-1)).toMatchObject({ type: "status", from: "applied", to: "interviewing", text: "phone screen booked" });
    await repo.changeStatus(app.id, "rejected");
    cur = store.getState().applications[app.id];
    expect(cur.closedAt).toBe(NOW);
    await repo.changeStatus(app.id, "applied");
    cur = store.getState().applications[app.id];
    expect(cur.closedAt).toBeUndefined();
    expect(cur.activity).toHaveLength(3);
  });

  it("logActivity appends a note", async () => {
    const { repo, store } = await boot();
    const app = await repo.createApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "saved" });
    await repo.logActivity(app.id, { type: "note", text: "emailed recruiter" });
    expect(store.getState().applications[app.id].activity).toEqual([{ at: NOW, type: "note", text: "emailed recruiter" }]);
  });

  it("remove deletes the record", async () => {
    const { repo, store } = await boot();
    const co = await repo.createCompany({ name: "Gone" });
    await repo.remove("companies", co.id);
    expect(store.getState().companies[co.id]).toBeUndefined();
  });

  it("saveSettings and saveProfile replace the singletons", async () => {
    const { repo, store } = await boot();
    await repo.saveSettings({ ...store.getState().settings!, displayCurrency: "KRW" });
    expect(store.getState().settings?.displayCurrency).toBe("KRW");
    await repo.saveProfile({ ...store.getState().profile!, name: "Ada" });
    expect(store.getState().profile?.name).toBe("Ada");
  });

  it("a read-only repository rejects writes with code read_only", async () => {
    const repo = new Repository(null, createStore());
    expect(repo.readOnly).toBe(true);
    await expect(repo.createCompany({ name: "x" })).rejects.toMatchObject({ code: "read_only" });
  });

  it("retries once on a transient unavailable error", async () => {
    const db = createFakeDb();
    let calls = 0;
    const flaky = {
      ...db,
      doc: (path: string) => {
        const real = db.doc(path);
        return { ...real, set: async (body: Record<string, unknown>) => { calls++; if (calls === 1) throw { code: "unavailable", message: "blip" }; return real.set(body); } };
      },
    } as unknown as DB;
    const store = createStore();
    const repo = new Repository(flaky, store, () => NOW);
    await repo.create("companies", buildCompany({ name: "Retry" }, "co_r", NOW));
    expect(calls).toBe(2);
    expect((await db.doc("companies/co_r").get()).exists).toBe(true);
  });

  it("wraps a permanent error in RepoError with user text", async () => {
    const db = createFakeDb();
    const full = { ...db, doc: (path: string) => ({ ...db.doc(path), set: async () => { throw { code: "quota_exceeded", message: "cap" }; } }) } as unknown as DB;
    const repo = new Repository(full, createStore(), () => NOW);
    await expect(repo.create("companies", buildCompany({ name: "x" }, "co_x", NOW))).rejects.toMatchObject({ code: "quota_exceeded", message: expect.stringMatching(/full/i) });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/store`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/store/store.ts`:
```ts
import { useSyncExternalStore } from "react";
import type { Answer, Application, AssetDoc, Company, Contact, Interview, PrepItem, Profile, Settings } from "../domain/types";

export interface StoreState {
  ready: boolean;
  readOnly: boolean;
  settings: Settings | null;
  profile: Profile | null;
  applications: Record<string, Application>;
  companies: Record<string, Company>;
  contacts: Record<string, Contact>;
  assets: Record<string, AssetDoc>;
  answers: Record<string, Answer>;
  interviews: Record<string, Interview>;
  prep: Record<string, PrepItem>;
}

export type StorePatch = Partial<StoreState> | ((state: StoreState) => Partial<StoreState>);

export interface Store {
  getState(): StoreState;
  setState(patch: StorePatch): void;
  subscribe(listener: () => void): () => void;
}

export function emptyState(): StoreState {
  return { ready: false, readOnly: false, settings: null, profile: null, applications: {}, companies: {}, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} };
}

export function createStore(initial: Partial<StoreState> = {}): Store {
  let state: StoreState = { ...emptyState(), ...initial };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStoreState(store: Store): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
```

`src/store/sync.ts`:
```ts
import type { DbLike } from "../capabilities/types";
import { defaultProfile, defaultSettings } from "../domain/defaults";
import { nowIso } from "../domain/ids";
import { migrateSettings } from "../domain/migrate";
import { COLLECTIONS, type Profile, type Settings } from "../domain/types";
import type { Store, StoreState } from "./store";

export interface SyncOptions {
  homeTz: string;
  now?: () => string;
  onError?: (e: DbError) => void;
}
export interface SyncHandle {
  stop(): void;
  ready: Promise<void>;
}

export const SETTINGS_PATH = "settings/main";
export const PROFILE_PATH = "profile/main";

function hasSchema(snap: DocumentSnapshot): boolean {
  return snap.exists && typeof snap.data()?.schemaVersion === "number";
}
function hasUpdatedAt(snap: DocumentSnapshot): boolean {
  return snap.exists && typeof snap.data()?.updatedAt === "string";
}

/** Subscribe the store to every collection plus the two singletons; seed defaults once when missing. */
export function startSync(db: DbLike, store: Store, opts: SyncOptions): SyncHandle {
  const now = opts.now ?? nowIso;
  const unsubs: Unsubscribe[] = [];
  const pending = new Set<string>([...COLLECTIONS, "settings", "profile"]);
  let stopped = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const markReady = (key: string) => {
    pending.delete(key);
    if (pending.size === 0 && !store.getState().ready) {
      store.setState({ ready: true });
      resolveReady();
    }
  };
  const fail = (e: DbError) => {
    opts.onError?.(e);
    store.setState({ readOnly: true, ready: true });
    resolveReady();
  };

  async function seed(path: string, build: () => Record<string, unknown>): Promise<void> {
    const ref = db.doc(path);
    const lease = await ref.acquire({ holder: `seed-${Math.random().toString(36).slice(2)}`, ttlMs: 5000 });
    if (!lease.acquired) return;
    const snap = await ref.get();
    const seeded = path === SETTINGS_PATH ? hasSchema(snap) : hasUpdatedAt(snap);
    if (!seeded) await ref.set(build());
  }

  unsubs.push(
    db.doc(SETTINGS_PATH).onSnapshot((snap) => {
      if (stopped) return;
      if (!hasSchema(snap)) {
        void seed(SETTINGS_PATH, () => defaultSettings(opts.homeTz, now()) as unknown as Record<string, unknown>).catch(fail);
        return;
      }
      const raw = snap.data() as unknown as Settings;
      const migrated = migrateSettings(raw);
      store.setState({ settings: migrated });
      if (migrated !== raw) void db.doc(SETTINGS_PATH).set(migrated as unknown as Record<string, unknown>).catch(fail);
      markReady("settings");
    }, fail),
  );

  unsubs.push(
    db.doc(PROFILE_PATH).onSnapshot((snap) => {
      if (stopped) return;
      if (!hasUpdatedAt(snap)) {
        void seed(PROFILE_PATH, () => defaultProfile(now()) as unknown as Record<string, unknown>).catch(fail);
        return;
      }
      store.setState({ profile: snap.data() as unknown as Profile });
      markReady("profile");
    }, fail),
  );

  for (const name of COLLECTIONS) {
    unsubs.push(
      db.collection(name).onSnapshot((snap) => {
        if (stopped) return;
        const map: Record<string, unknown> = {};
        for (const d of snap.docs) map[d.id] = d.data();
        store.setState({ [name]: map } as unknown as Partial<StoreState>);
        markReady(name);
      }, fail),
    );
  }

  return {
    stop() {
      stopped = true;
      unsubs.forEach((u) => u());
    },
    ready,
  };
}
```

`src/store/repository.ts`:
```ts
import { describeDbError, errorCode, isTransient } from "../capabilities/errors";
import type { DbLike } from "../capabilities/types";
import { buildApplication, buildCompany, type NewApplication, type NewCompany } from "../domain/factories";
import { ID_PREFIX, newId, nowIso } from "../domain/ids";
import { appendActivity, applyStatusChange, findStatus } from "../domain/status";
import type { ActivityEntry, Application, CollectionName, Company, EntityMap, Profile, Settings } from "../domain/types";
import type { Store } from "./store";
import { PROFILE_PATH, SETTINGS_PATH } from "./sync";

export class RepoError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RepoError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** JSON has no `undefined`; a full `set` must not carry such keys, so drop them recursively. */
export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRepoError(e: unknown): RepoError {
  if (e instanceof RepoError) return e;
  return new RepoError(errorCode(e) ?? "unknown", describeDbError(e));
}

export class Repository {
  constructor(
    private readonly db: DbLike | null,
    private readonly store: Store,
    private readonly now: () => string = nowIso,
  ) {}

  get readOnly(): boolean {
    return this.db === null;
  }

  private requireDb(): DbLike {
    if (!this.db) throw new RepoError("read_only", describeDbError({ code: "read_only", message: "" }));
    return this.db;
  }

  private requireSettings(): Settings {
    const s = this.store.getState().settings;
    if (!s) throw new RepoError("not_ready", "Settings are not loaded yet.");
    return s;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RepoError) throw e;
      if (isTransient(e)) {
        await sleep(200 + Math.random() * 300);
        try {
          return await fn();
        } catch (e2) {
          throw toRepoError(e2);
        }
      }
      throw toRepoError(e);
    }
  }

  private async write<K extends CollectionName>(collection: K, doc: EntityMap[K]): Promise<EntityMap[K]> {
    const db = this.requireDb();
    const clean = stripUndefined(doc);
    await this.guard(() => db.doc(`${collection}/${doc.id}`).set(clean as unknown as Record<string, unknown>));
    return clean;
  }

  get<K extends CollectionName>(collection: K, id: string): EntityMap[K] | undefined {
    return (this.store.getState()[collection] as Record<string, EntityMap[K]>)[id];
  }

  async create<K extends CollectionName>(collection: K, doc: EntityMap[K]): Promise<EntityMap[K]> {
    return this.write(collection, doc);
  }

  async update<K extends CollectionName>(collection: K, id: string, patch: Partial<EntityMap[K]>): Promise<EntityMap[K]> {
    const current = this.get(collection, id);
    if (!current) throw new RepoError("not_found", `No ${collection} record ${id}.`);
    const next = { ...current, ...patch, updatedAt: this.now() } as EntityMap[K];
    return this.write(collection, next);
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    const db = this.requireDb();
    await this.guard(() => db.doc(`${collection}/${id}`).delete());
  }

  async saveSettings(settings: Settings): Promise<void> {
    const db = this.requireDb();
    const next = stripUndefined({ ...settings, updatedAt: this.now() });
    await this.guard(() => db.doc(SETTINGS_PATH).set(next as unknown as Record<string, unknown>));
  }

  async saveProfile(profile: Profile): Promise<void> {
    const db = this.requireDb();
    const next = stripUndefined({ ...profile, updatedAt: this.now() });
    await this.guard(() => db.doc(PROFILE_PATH).set(next as unknown as Record<string, unknown>));
  }

  async createCompany(input: NewCompany): Promise<Company> {
    return this.create("companies", buildCompany(input, newId(ID_PREFIX.companies), this.now()));
  }

  async createApplication(input: NewApplication): Promise<Application> {
    const status = findStatus(this.requireSettings(), input.statusId);
    if (!status) throw new RepoError("invalid", `Unknown status ${input.statusId}.`);
    const doc = buildApplication({ maxStageRank: status.stageRank, ...input }, newId(ID_PREFIX.applications), this.now());
    return this.create("applications", doc);
  }

  async changeStatus(appId: string, statusId: string, note?: string): Promise<Application> {
    const app = this.get("applications", appId);
    if (!app) throw new RepoError("not_found", `No application ${appId}.`);
    const status = findStatus(this.requireSettings(), statusId);
    if (!status) throw new RepoError("invalid", `Unknown status ${statusId}.`);
    const next = applyStatusChange(app, status, this.now(), note);
    if (next === app) return app;
    return this.write("applications", next);
  }

  async logActivity(appId: string, entry: Omit<ActivityEntry, "at">): Promise<Application> {
    const app = this.get("applications", appId);
    if (!app) throw new RepoError("not_found", `No application ${appId}.`);
    return this.write("applications", appendActivity(app, entry, this.now()));
  }
}
```

`src/store/context.tsx`:
```tsx
import { createContext, useContext } from "react";
import type { Capabilities } from "../capabilities/types";
import type { Profile, Settings } from "../domain/types";
import type { Repository } from "./repository";
import { useStoreState, type Store, type StoreState } from "./store";

export interface AppServices {
  store: Store;
  repo: Repository;
  caps: Capabilities;
}

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext is missing");
  return v;
}

export function useAppState(): StoreState {
  return useStoreState(useApp().store);
}

export function useSettings(): Settings {
  const s = useAppState().settings;
  if (!s) throw new Error("settings are not loaded");
  return s;
}

export function useProfile(): Profile {
  const p = useAppState().profile;
  if (!p) throw new Error("profile is not loaded");
  return p;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/store && npm run typecheck`
Expected: PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/store tests/store
git commit -m "feat(store): live store, sync with seeding, repository with retries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: App shell: router, boot, nav, banner, toasts, dashboard counts

**Files:**
- Create: `src/app/router.ts`, `src/app/routes.tsx`, `src/app/Shell.tsx`, `src/app/DashboardPage.tsx`, `src/ui/Toast.tsx`
- Modify: `src/app/App.tsx` (replace), `src/main.tsx` (pass capabilities), `src/styles/app.css` (append)
- Test: `tests/app/router.test.ts`, `tests/app/App.test.tsx`

**Interfaces:**
- Consumes: `Capabilities`, `createCapabilities` (Task 5); `createStore`, `startSync`, `Repository`, `AppContext`, `useAppState`, `useSettings` (Task 6); `defaultSettings`, `defaultProfile`, `browserTimeZone`, `nowIso` (Task 2).
- Produces: `parseHash(hash): Route {path, parts, query}`, `navigate(to)`, `useRoute()`; `PageProps {parts, query}`, `NAV: NavItem[]` and `PAGES: Record<string, ComponentType<PageProps>>` (later tasks push entries into both); `App({capabilities})`; `Shell`; `ToastProvider`, `useToast().show(message, kind?)`.

- [ ] **Step 1: Write the failing tests**

`tests/app/router.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseHash } from "../../src/app/router";

describe("parseHash", () => {
  it("parses empty and root hashes to the dashboard", () => {
    expect(parseHash("")).toMatchObject({ path: "/", parts: [] });
    expect(parseHash("#/")).toMatchObject({ path: "/", parts: [] });
  });
  it("splits parts and query", () => {
    const r = parseHash("#/applications/app_1?tab=notes");
    expect(r.parts).toEqual(["applications", "app_1"]);
    expect(r.path).toBe("/applications/app_1");
    expect(r.query.get("tab")).toBe("notes");
  });
});
```

`tests/app/App.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";
import { absentCapabilities } from "../../src/capabilities/types";
import { createFakeDb } from "../../src/capabilities/fakeDb";

describe("App", () => {
  it("renders read-only with a banner when db is absent", async () => {
    render(<App capabilities={absentCapabilities()} />);
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/unavailable/i);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("connects to a db and shows pipeline cards without a banner", async () => {
    const caps = { ...absentCapabilities(), db: Promise.resolve(createFakeDb()) };
    render(<App capabilities={caps} />);
    expect(await screen.findByText("Total")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Interviewing")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app`
Expected: FAIL (router module missing; App does not accept capabilities).

- [ ] **Step 3: Implement**

`src/app/router.ts`:
```ts
import { useEffect, useState } from "react";

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  return { path: "/" + parts.join("/"), parts, query: new URLSearchParams(queryPart) };
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith("#") ? to : `#${to}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
```

`src/ui/Toast.tsx`:
```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";
interface ToastItem { id: number; message: string; kind: ToastKind }
export interface ToastApi { show(message: string, kind?: ToastKind): void }

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastContext);
  if (!v) throw new Error("ToastProvider is missing");
  return v;
}
```

`src/app/routes.tsx`:
```tsx
import type { ComponentType } from "react";
import { DashboardPage } from "./DashboardPage";

export interface PageProps {
  parts: string[];
  query: URLSearchParams;
}
export interface NavItem {
  key: string;
  to: string;
  label: string;
}

/** Later tasks push into these two registries; the key is the first hash segment. */
export const NAV: NavItem[] = [{ key: "", to: "/", label: "Dashboard" }];
export const PAGES: Record<string, ComponentType<PageProps>> = { "": DashboardPage };
```

`src/app/DashboardPage.tsx`:
```tsx
import { useMemo } from "react";
import { useAppState, useSettings } from "../store/context";

export function DashboardPage() {
  const { applications } = useAppState();
  const settings = useSettings();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of Object.values(applications)) m.set(a.statusId, (m.get(a.statusId) ?? 0) + 1);
    return m;
  }, [applications]);
  const open = settings.pickLists.statuses.filter((s) => s.group === "open" && !s.archived);
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
          <div className="card-value">{Object.keys(applications).length}</div>
        </div>
      </div>
    </section>
  );
}
```

`src/app/Shell.tsx`:
```tsx
import { useAppState } from "../store/context";
import { useRoute } from "./router";
import { NAV, PAGES } from "./routes";

export function Shell() {
  const state = useAppState();
  const route = useRoute();
  const key = route.parts[0] ?? "";
  const Page = PAGES[key];
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">Job Hunt HQ</div>
        {NAV.map((n) => (
          <a key={n.key} href={`#${n.to}`} className={key === n.key ? "nav-item active" : "nav-item"}>
            {n.label}
          </a>
        ))}
      </nav>
      <main className="main">
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

`src/app/App.tsx` (replace the file):
```tsx
import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities/types";
import { browserTimeZone, defaultProfile, defaultSettings } from "../domain/defaults";
import { nowIso } from "../domain/ids";
import { AppContext, type AppServices } from "../store/context";
import { Repository } from "../store/repository";
import { createStore } from "../store/store";
import { startSync, type SyncHandle } from "../store/sync";
import { ToastProvider } from "../ui/Toast";
import { Shell } from "./Shell";

export function App({ capabilities }: { capabilities: Capabilities }) {
  const [services, setServices] = useState<AppServices | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: SyncHandle | undefined;
    const store = createStore();
    void capabilities.db.then((db) => {
      if (cancelled) return;
      const repo = new Repository(db, store);
      if (db) {
        handle = startSync(db, store, { homeTz: browserTimeZone() });
      } else {
        const now = nowIso();
        store.setState({ readOnly: true, ready: true, settings: defaultSettings(browserTimeZone(), now), profile: defaultProfile(now) });
      }
      setServices({ store, repo, caps: capabilities });
    });
    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, [capabilities]);

  if (!services) return <div className="boot">Loading…</div>;
  return (
    <AppContext.Provider value={services}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AppContext.Provider>
  );
}
```

`src/main.tsx` (replace):
```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createCapabilities } from "./capabilities/resolve";
import "./styles/tokens.css";
import "./styles/app.css";

const el = document.getElementById("root");
if (!el) throw new Error("root element missing");
createRoot(el).render(<App capabilities={createCapabilities()} />);
```

Append to `src/styles/app.css`:
```css
/* layout */
.shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
.nav { background: var(--surface); border-right: 1px solid var(--border); padding: 12px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100vh; }
.brand { font-weight: 700; padding: 8px 10px 14px; }
.nav-item { color: var(--text); text-decoration: none; padding: 8px 10px; border-radius: var(--radius); }
.nav-item:hover { background: var(--surface-2); }
.nav-item.active { background: var(--accent); color: var(--accent-text); }
.main { padding: 20px 24px; min-width: 0; }
.boot { padding: 40px; color: var(--text-muted); }
.empty { padding: 40px; color: var(--text-muted); text-align: center; }
.banner { padding: 10px 14px; border-radius: var(--radius); margin-bottom: 16px; }
.banner-warn { background: var(--chip-amber); color: var(--chip-amber-text); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.card-label { color: var(--text-muted); font-size: 12px; }
.card-value { font-size: 24px; font-weight: 600; }
.toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 50; }
.toast { background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); border-radius: var(--radius); padding: 10px 14px; max-width: 360px; }
.toast-error { border-color: var(--danger); }
.toast-success { border-color: var(--ok); }
@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .nav { position: fixed; top: auto; bottom: 0; left: 0; right: 0; height: auto; flex-direction: row; overflow-x: auto; border-right: 0; border-top: 1px solid var(--border); padding: 6px; z-index: 40; }
  .brand { display: none; }
  .nav-item { white-space: nowrap; font-size: 13px; }
  .main { padding: 14px; padding-bottom: 72px; }
}
```

- [ ] **Step 4: Run the tests, typecheck, and view it in a browser**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all PASS; build succeeds.

Then run `npm run dev` in the background and open `http://localhost:5173/dev.html` (the orchestrating session uses the browser pane). Expected: nav with "Dashboard", pipeline cards all zero, no banner (the dev fake db is active). Stop the dev server afterwards.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): hash router, boot sequence, shell with nav and banner, toasts, dashboard counts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Shared UI kit: fields, chips, table, drawer, confirm, autosave

**Files:**
- Create: `src/ui/fields.tsx`, `src/ui/Chip.tsx`, `src/ui/sortRows.ts`, `src/ui/Table.tsx`, `src/ui/Drawer.tsx`, `src/ui/Confirm.tsx`, `src/ui/useSaver.ts`
- Modify: `src/app/App.tsx` (wrap in `ConfirmProvider`), `src/styles/app.css` (append)
- Test: `tests/ui/sortRows.test.ts`, `tests/ui/fields.test.tsx`, `tests/ui/Confirm.test.tsx`

**Interfaces:**
- Produces: `Field`, `TextField`, `TextArea`, `NumberField`, `SelectField`, `DateField`, `RatingField`, `TagInput`, `TriStateField`; `Chip({color, children})`, `PickChip({list, id})`; `Column<T>`, `SortDir`, `sortRows(rows, column, dir)`, `Table<T>`; `Drawer({open, title, onClose, children, footer?})`; `ConfirmProvider`, `useConfirm()` → `confirm({title, message, confirmLabel?, danger?, typed?}): Promise<boolean>`; `useSaver()` → `{status, run(fn)}`, `SaveIndicator({status})`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/sortRows.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sortRows, type Column } from "../../src/ui/sortRows";

interface Row { id: string; n: number | null; s: string }
const rows: Row[] = [
  { id: "a", n: 3, s: "banana" },
  { id: "b", n: null, s: "apple" },
  { id: "c", n: 1, s: "" },
];
const byN: Column<Row> = { key: "n", header: "N", render: (r) => r.n, sortValue: (r) => r.n };
const byS: Column<Row> = { key: "s", header: "S", render: (r) => r.s, sortValue: (r) => r.s };

describe("sortRows", () => {
  it("sorts numbers with nulls last in both directions", () => {
    expect(sortRows(rows, byN, "asc").map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortRows(rows, byN, "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts strings with empty last", () => {
    expect(sortRows(rows, byS, "asc").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("returns the input order without a sortable column", () => {
    expect(sortRows(rows, undefined, "asc")).toBe(rows);
  });
});
```

`tests/ui/fields.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextField, TagInput, RatingField, TriStateField, NumberField } from "../../src/ui/fields";

describe("TextField", () => {
  it("commits on blur only when changed, and on Enter", () => {
    const onCommit = vi.fn();
    render(<TextField label="Title" value="old" onCommit={onCommit} />);
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new");
  });
});

describe("NumberField", () => {
  it("commits numbers and null for empty", () => {
    const onCommit = vi.fn();
    render(<NumberField label="Min" value={5} onCommit={onCommit} />);
    const input = screen.getByLabelText("Min") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(null);
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(42);
  });
});

describe("TagInput", () => {
  it("adds on Enter, ignores duplicates, removes via button", () => {
    const onChange = vi.fn();
    render(<TagInput label="Tags" value={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("RatingField", () => {
  it("sets a rating and clears when the same value is clicked", () => {
    const onChange = vi.fn();
    render(<RatingField label="Desire" value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Desire 5" }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Desire 3" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("TriStateField", () => {
  it("maps select values to boolean or null", () => {
    const onChange = vi.fn();
    render(<TriStateField label="Sponsorship needed" value={null} onChange={onChange} />);
    const select = screen.getByLabelText("Sponsorship needed") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "yes" } });
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(select, { target: { value: "no" } });
    expect(onChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(select, { target: { value: "unknown" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
```

`tests/ui/Confirm.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "../../src/ui/Confirm";

function Harness({ typed, onResult }: { typed?: string; onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return <button onClick={() => void confirm({ title: "Delete?", message: "Gone forever.", confirmLabel: "Delete", typed }).then(onResult)}>open</button>;
}

describe("useConfirm", () => {
  it("resolves true on confirm and false on cancel", async () => {
    const results: boolean[] = [];
    render(<ConfirmProvider><Harness onResult={(v) => results.push(v)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual([true, false]);
  });

  it("keeps the confirm button disabled until the typed phrase matches", async () => {
    render(<ConfirmProvider><Harness typed="REPLACE" onResult={() => {}} /></ConfirmProvider>);
    fireEvent.click(screen.getByText("open"));
    const button = (await screen.findByRole("button", { name: "Delete" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/type REPLACE/i), { target: { value: "REPLACE" } });
    expect(button.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/ui/fields.tsx`:
```tsx
import { useEffect, useId, useState, type ReactNode } from "react";
import type { PickEntry, Rating } from "../domain/types";

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "email";
  disabled?: boolean;
}
export function TextField({ label, value, onCommit, placeholder, type = "text", disabled }: TextProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}

interface TextAreaProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}
export function TextArea({ label, value, onCommit, rows = 4, placeholder, disabled }: TextAreaProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label={label} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </Field>
  );
}

interface NumberProps {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}
export function NumberField({ label, value, onCommit, min, max, step, disabled }: NumberProps) {
  const id = useId();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && Number.isNaN(next)) return;
    if (next !== value) onCommit(next);
  };
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </Field>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: PickEntry[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}
export function SelectField({ label, value, options, onChange, allowEmpty = true, emptyLabel = "—", disabled }: SelectProps) {
  const id = useId();
  const visible = options.filter((o) => !o.archived || o.id === value);
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {visible.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

interface DateProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}
export function DateField({ label, value, onCommit, disabled }: DateProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="date" value={value} disabled={disabled} onChange={(e) => onCommit(e.target.value)} />
    </Field>
  );
}

interface RatingProps {
  label: string;
  value: Rating | null;
  onChange: (value: Rating | null) => void;
}
export function RatingField({ label, value, onChange }: RatingProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="rating" role="group" aria-label={label}>
        {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
          <button key={n} type="button" aria-label={`${label} ${n}`} aria-pressed={value === n}
            className={value != null && n <= value ? "rating-dot on" : "rating-dot"}
            onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TagProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}
export function TagInput({ label, value, onChange, placeholder = "Add and press Enter", suggestions }: TagProps) {
  const id = useId();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  };
  return (
    <Field label={label} htmlFor={id}>
      <div className="tags">
        {value.map((t) => (
          <span key={t} className="chip chip-gray">
            {t}
            <button type="button" className="chip-x" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
          </span>
        ))}
        <input id={id} value={draft} placeholder={placeholder} list={suggestions ? listId : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            else if (e.key === "Backspace" && draft === "" && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={add} />
        {suggestions ? <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist> : null}
      </div>
    </Field>
  );
}

interface TriProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
}
export function TriStateField({ label, value, onChange, yesLabel = "Yes", noLabel = "No" }: TriProps) {
  const id = useId();
  const current = value === null ? "unknown" : value ? "yes" : "no";
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} value={current} onChange={(e) => onChange(e.target.value === "unknown" ? null : e.target.value === "yes")}>
        <option value="unknown">Unknown</option>
        <option value="yes">{yesLabel}</option>
        <option value="no">{noLabel}</option>
      </select>
    </Field>
  );
}
```

`src/ui/Chip.tsx`:
```tsx
import type { ReactNode } from "react";
import type { ColorToken, PickEntry } from "../domain/types";

export function Chip({ color = "gray", children, title }: { color?: ColorToken; children: ReactNode; title?: string }) {
  return <span className={`chip chip-${color}`} title={title}>{children}</span>;
}

export function PickChip({ list, id }: { list: PickEntry[]; id: string | undefined }) {
  if (!id) return <span className="muted">—</span>;
  const entry = list.find((e) => e.id === id);
  return <Chip color={entry?.color ?? "gray"}>{entry?.label ?? id}</Chip>;
}
```

`src/ui/sortRows.ts`:
```ts
import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  width?: string;
  align?: "left" | "right";
}

/** Stable sort; empty values (null, undefined, "") always sort last regardless of direction. */
export function sortRows<T>(rows: T[], column: Column<T> | undefined, dir: SortDir): T[] {
  const sv = column?.sortValue;
  if (!sv) return rows;
  const empty = (v: unknown) => v == null || v === "";
  return [...rows].sort((a, b) => {
    const av = sv(a);
    const bv = sv(b);
    if (empty(av) && empty(bv)) return 0;
    if (empty(av)) return 1;
    if (empty(bv)) return -1;
    const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "asc" ? c : -c;
  });
}
```

`src/ui/Table.tsx`:
```tsx
import { sortRows, type Column, type SortDir } from "./sortRows";

interface TableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  selectedId?: string;
}

export function Table<T extends { id: string }>({ rows, columns, sortKey, sortDir = "asc", onSort, onRowClick, emptyText = "Nothing here yet.", selectedId }: TableProps<T>) {
  const column = columns.find((c) => c.key === sortKey);
  const sorted = sortRows(rows, column, sortDir);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align ?? "left" }}>
                {c.sortValue && onSort ? (
                  <button type="button" className="th-sort" onClick={() => onSort(c.key)} aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.header}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty">{emptyText}</td></tr>
          ) : sorted.map((row) => (
            <tr key={row.id} className={[onRowClick ? "clickable" : "", selectedId === row.id ? "selected" : ""].join(" ").trim()} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/ui/Drawer.tsx`:
```tsx
import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Drawer({ open, title, onClose, children, footer, wide }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className={wide ? "drawer wide" : "drawer"} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}
```

`src/ui/Confirm.tsx`:
```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the viewer types this exact phrase. */
  typed?: string;
}
type ConfirmFn = (req: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ req: ConfirmRequest; resolve: (v: boolean) => void } | null>(null);
  const [typed, setTyped] = useState("");
  const confirm = useCallback<ConfirmFn>((req) => new Promise((resolve) => { setTyped(""); setPending({ req, resolve }); }), []);
  const finish = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  const value = useMemo(() => confirm, [confirm]);
  const locked = !!pending?.req.typed && typed !== pending.req.typed;
  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div className="modal-backdrop" onClick={() => finish(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title">{pending.req.title}</h2>
            <p>{pending.req.message}</p>
            {pending.req.typed ? (
              <label className="field">
                <span className="field-label">Type {pending.req.typed} to continue</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </label>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => finish(false)}>Cancel</button>
              <button type="button" className={pending.req.danger === false ? "btn primary" : "btn danger"} disabled={locked} onClick={() => finish(true)}>
                {pending.req.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const v = useContext(ConfirmContext);
  if (!v) throw new Error("ConfirmProvider is missing");
  return v;
}
```

`src/ui/useSaver.ts`:
```ts
import { useCallback, useRef, useState } from "react";
import { useToast } from "./Toast";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

/** Runs a write, tracks its status for an indicator, and toasts failures with the repository's message. */
export function useSaver() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      setStatus("saving");
      try {
        await fn();
        setStatus("saved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus("idle"), 1500);
        return true;
      } catch (e) {
        setStatus("failed");
        toast.show(e instanceof Error ? e.message : "Could not save.", "error");
        return false;
      }
    },
    [toast],
  );
  return { status, run };
}

export function saveLabel(status: SaveStatus): string {
  switch (status) {
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "failed": return "Failed, retry";
    default: return "";
  }
}
```

Add to `src/ui/Confirm.tsx`'s sibling, a tiny component in `src/ui/useSaver.ts` is not possible (it is .ts); create `src/ui/SaveIndicator.tsx`:
```tsx
import { saveLabel, type SaveStatus } from "./useSaver";

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = saveLabel(status);
  return <span className={`save-indicator save-${status}`} aria-live="polite">{text}</span>;
}
```

Modify `src/app/App.tsx`: import `ConfirmProvider` from `../ui/Confirm` and wrap:
```tsx
      <ToastProvider>
        <ConfirmProvider>
          <Shell />
        </ConfirmProvider>
      </ToastProvider>
```

Append to `src/styles/app.css`:
```css
/* controls */
input, select, textarea { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 9px; width: 100%; }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
textarea { resize: vertical; }
.btn { font: inherit; padding: 7px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
.btn:hover { background: var(--surface-2); }
.btn.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn.ghost { border-color: transparent; background: transparent; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field-label { font-size: 12px; color: var(--text-muted); }
.field-hint { font-size: 12px; color: var(--text-muted); }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 16px; }
.muted { color: var(--text-muted); }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.toolbar { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; margin-bottom: 12px; }
.toolbar .field { margin-bottom: 0; min-width: 140px; }
.section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 14px; }
/* chips */
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.chip-gray { background: var(--chip-gray); color: var(--chip-gray-text); }
.chip-blue { background: var(--chip-blue); color: var(--chip-blue-text); }
.chip-purple { background: var(--chip-purple); color: var(--chip-purple-text); }
.chip-green { background: var(--chip-green); color: var(--chip-green-text); }
.chip-red { background: var(--chip-red); color: var(--chip-red-text); }
.chip-amber { background: var(--chip-amber); color: var(--chip-amber-text); }
.chip-x { border: 0; background: transparent; cursor: pointer; color: inherit; padding: 0 2px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 6px; background: var(--surface); }
.tags input { border: 0; padding: 4px; min-width: 120px; flex: 1; }
.tags input:focus { outline: none; }
.rating { display: flex; gap: 4px; }
.rating-dot { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 12px; }
.rating-dot.on { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
/* table */
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.table th { font-size: 12px; color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.th-sort { font: inherit; color: inherit; background: transparent; border: 0; padding: 0; cursor: pointer; }
.table tr.clickable { cursor: pointer; }
.table tr.clickable:hover { background: var(--surface-2); }
.table tr.selected { background: var(--surface-2); }
/* drawer & modal */
.drawer-backdrop, .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 30; display: flex; justify-content: flex-end; }
.modal-backdrop { align-items: center; justify-content: center; z-index: 60; }
.drawer { width: min(640px, 100%); height: 100%; background: var(--bg); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: var(--shadow); }
.drawer.wide { width: min(880px, 100%); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
.drawer-title { font-weight: 600; }
.drawer-body { padding: 16px; overflow-y: auto; flex: 1; }
.drawer-foot { padding: 12px 16px; border-top: 1px solid var(--border); background: var(--surface); display: flex; gap: 8px; justify-content: space-between; align-items: center; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; width: min(440px, 92vw); box-shadow: var(--shadow); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.save-indicator { font-size: 12px; color: var(--text-muted); min-width: 80px; }
.save-failed { color: var(--danger); }
.save-saved { color: var(--ok); }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.tab { font: inherit; background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 8px 10px; cursor: pointer; color: var(--text-muted); }
.tab.active { color: var(--text); border-bottom-color: var(--accent); }
@media (max-width: 720px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): form fields, chips, sortable table, drawer, confirm dialog, autosave indicator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Pick-list reducers, Settings page, pick-list editor

**Files:**
- Create: `src/domain/pickLists.ts`, `src/ui/timeZones.ts`, `src/features/settings/SettingsPage.tsx`, `src/features/settings/PickListEditor.tsx`
- Modify: `src/app/routes.tsx` (register `settings`), `vitest.config.ts` (add `globals: true` so Testing Library auto-cleans between tests)
- Test: `tests/domain/pickLists.test.ts`, `tests/features/settings.test.tsx`

**Interfaces:**
- Consumes: `useApp`, `useAppState`, `useSettings` (Task 6); `useSaver`, `SaveIndicator`, `useConfirm`, `NumberField`, `TextField`, `Field` (Task 8); `defaultSettings`, `nowIso` (Task 2); `PAGES`, `NAV` (Task 7).
- Produces: `slugId(label, existing)`, `addEntry(list, entry)`, `updateEntry(list, id, patch)`, `moveEntry(list, index, delta)`, `removeEntry(list, id)`, `referencedPickIds(records, name): Set<string>`, `PICK_LIST_LABELS`; `allTimeZones(): string[]`; `SettingsPage`; `PickListEditor`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/pickLists.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { addEntry, moveEntry, referencedPickIds, removeEntry, slugId, updateEntry } from "../../src/domain/pickLists";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { emptyState } from "../../src/store/store";
import type { PickEntry } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
const list: PickEntry[] = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];

describe("slugId", () => {
  it("slugs ascii, keeps Korean letters, and de-duplicates", () => {
    expect(slugId("Hacker News", [])).toBe("hacker-news");
    expect(slugId("  Cold   Email! ", [])).toBe("cold-email");
    expect(slugId("잡플래닛", [])).toBe("잡플래닛");
    expect(slugId("A", list)).toBe("a-2");
    expect(slugId("!!!", [])).toBe("item");
  });
});

describe("list reducers", () => {
  it("addEntry appends and rejects duplicates or blank labels", () => {
    expect(addEntry(list, { id: "d", label: "D" }).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(() => addEntry(list, { id: "a", label: "Again" })).toThrow(/duplicate/i);
    expect(() => addEntry(list, { id: "e", label: "  " })).toThrow(/label/i);
  });
  it("updateEntry patches one entry without mutating", () => {
    const out = updateEntry(list, "b", { label: "Bee", color: "blue" });
    expect(out[1]).toEqual({ id: "b", label: "Bee", color: "blue" });
    expect(list[1].label).toBe("B");
  });
  it("moveEntry swaps neighbours and ignores out-of-range moves", () => {
    expect(moveEntry(list, 0, 1).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(moveEntry(list, 0, -1)).toBe(list);
    expect(moveEntry(list, 2, 1)).toBe(list);
  });
  it("removeEntry drops by id", () => {
    expect(removeEntry(list, "b").map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("referencedPickIds", () => {
  it("collects ids used by records for statuses, channels and countries", () => {
    const state = emptyState();
    state.applications.app_1 = buildApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW);
    state.companies.co_1 = buildCompany({ name: "x", sponsorship: { KR: { policy: "yes" } } }, "co_1", NOW);
    expect([...referencedPickIds(state, "statuses")]).toEqual(["applied"]);
    expect([...referencedPickIds(state, "channels")]).toEqual(["linkedin"]);
    expect([...referencedPickIds(state, "countries")].sort()).toEqual(["CA", "KR"]);
    expect(referencedPickIds(state, "roundTypes").size).toBe(0);
  });
});
```

`tests/features/settings.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import type { Settings } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string, seed?: (db: ReturnType<typeof createFakeDb>) => Promise<void>) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Settings" });
  return db;
}

describe("SettingsPage", () => {
  it("saves a cadence change on blur", async () => {
    const db = await open("#/settings");
    const input = screen.getByLabelText("Follow-up cadence (days)");
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    await waitFor(async () => expect((await db.doc("settings/main").get()).data()?.followUpCadenceDays).toBe(10));
  });

  it("adds an exchange rate", async () => {
    const db = await open("#/settings");
    fireEvent.change(screen.getByLabelText("Currency code"), { target: { value: "usd" } });
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "1.36" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    await waitFor(async () => expect(((await db.doc("settings/main").get()).data() as unknown as Settings).fxRates.USD).toBe(1.36));
  });

  it("adds a pick-list entry with a slug id", async () => {
    const db = await open("#/settings");
    fireEvent.change(screen.getByLabelText("List"), { target: { value: "channels" } });
    fireEvent.change(screen.getByLabelText("New entry"), { target: { value: "Hacker News" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(async () => {
      const s = (await db.doc("settings/main").get()).data() as unknown as Settings;
      expect(s.pickLists.channels.some((c) => c.id === "hacker-news" && c.label === "Hacker News")).toBe(true);
    });
  });

  it("blocks deleting a status that records use", async () => {
    await open("#/settings", async (db) => {
      await db.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    const del = screen.getByRole("button", { name: "Delete applied" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    const free = screen.getByRole("button", { name: "Delete ghosted" }) as HTMLButtonElement;
    expect(free.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/pickLists.test.ts tests/features/settings.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`vitest.config.ts` (replace):
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

`src/domain/pickLists.ts`:
```ts
import type { StoreState } from "../store/store";
import type { PickEntry, PickListName } from "./types";

export const PICK_LIST_LABELS: Record<PickListName, string> = {
  statuses: "Statuses",
  channels: "Channels",
  countries: "Countries",
  workModes: "Work modes",
  employmentTypes: "Employment types",
  hiringTracks: "Hiring tracks",
  levels: "Levels",
  roleFamilies: "Role families",
  roundTypes: "Interview round types",
  contactRelationships: "Contact relationships",
  assetKinds: "Asset kinds",
  answerKinds: "Answer kinds",
  answerThemes: "Answer themes",
  prepKinds: "Prep kinds",
  closedReasons: "Closed reasons",
};

/** Lower-case, letters and digits of any script, hyphen-joined, unique within `existing`. */
export function slugId(label: string, existing: PickEntry[]): string {
  const base = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "item";
  const taken = new Set(existing.map((e) => e.id));
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export function addEntry<T extends PickEntry>(list: T[], entry: T): T[] {
  if (list.some((e) => e.id === entry.id)) throw new Error(`Duplicate id "${entry.id}"`);
  if (!entry.label.trim()) throw new Error("Label is required");
  return [...list, entry];
}

export function updateEntry<T extends PickEntry>(list: T[], id: string, patch: Partial<Omit<T, "id">>): T[] {
  return list.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

export function moveEntry<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export function removeEntry<T extends PickEntry>(list: T[], id: string): T[] {
  return list.filter((e) => e.id !== id);
}

type Records = Pick<StoreState, "applications" | "companies" | "contacts" | "assets" | "answers" | "interviews" | "prep">;

/** Ids of a pick list that existing records point at. Such entries may be archived but not deleted. */
export function referencedPickIds(records: Records, name: PickListName): Set<string> {
  const ids = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === "string" && v) ids.add(v);
    else if (Array.isArray(v)) v.forEach(add);
  };
  const apps = Object.values(records.applications);
  const assets = Object.values(records.assets);
  switch (name) {
    case "statuses": apps.forEach((a) => add(a.statusId)); break;
    case "channels": apps.forEach((a) => add(a.channelId)); break;
    case "countries":
      apps.forEach((a) => add(a.countryId));
      assets.forEach((x) => add(x.targetCountryIds));
      Object.values(records.companies).forEach((c) => add(Object.keys(c.sponsorship)));
      break;
    case "workModes": apps.forEach((a) => add(a.workModeId)); break;
    case "employmentTypes": apps.forEach((a) => add(a.employmentTypeId)); break;
    case "hiringTracks": apps.forEach((a) => add(a.hiringTrackId)); break;
    case "levels": apps.forEach((a) => add(a.levelId)); break;
    case "roleFamilies":
      apps.forEach((a) => add(a.roleFamilyId));
      assets.forEach((x) => add(x.targetRoleFamilyIds));
      break;
    case "roundTypes": Object.values(records.interviews).forEach((i) => add(i.roundTypeId)); break;
    case "contactRelationships": Object.values(records.contacts).forEach((c) => add(c.relationshipId)); break;
    case "assetKinds": assets.forEach((x) => add(x.kindId)); break;
    case "answerKinds": Object.values(records.answers).forEach((x) => add(x.kindId)); break;
    case "answerThemes": Object.values(records.answers).forEach((x) => add(x.themeIds)); break;
    case "prepKinds": Object.values(records.prep).forEach((x) => add(x.kindId)); break;
    case "closedReasons": apps.forEach((a) => add(a.closedReasonId)); break;
  }
  return ids;
}
```

`src/ui/timeZones.ts`:
```ts
const COMMON = ["America/Toronto", "America/Vancouver", "America/New_York", "America/Los_Angeles", "America/Chicago", "Asia/Seoul", "UTC"];
let cache: string[] | null = null;

/** Common zones first, then every zone the runtime knows. */
export function allTimeZones(): string[] {
  if (cache) return cache;
  const known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  cache = [...COMMON, ...known.filter((z) => !COMMON.includes(z))];
  return cache;
}
```

`src/features/settings/PickListEditor.tsx`:
```tsx
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
  const list = settings.pickLists[name] as PickEntry[];
  const used = referencedPickIds(state, name);
  const isStatus = name === "statuses";

  const commit = (next: PickEntry[]) => run(() => repo.saveSettings({ ...settings, pickLists: { ...settings.pickLists, [name]: next } }));
  const editStatus = (id: string, patch: Partial<Omit<StatusEntry, "id">>) => commit(updateEntry(list as StatusEntry[], id, patch));

  const add = () => {
    const text = label.trim();
    if (!text) return;
    const id = slugId(text, list);
    const entry: PickEntry = isStatus
      ? ({ id, label: text, color: "gray", group: "open", stageRank: Math.max(0, ...(list as StatusEntry[]).filter((s) => s.group === "open").map((s) => s.stageRank)) + 1 } satisfies StatusEntry)
      : { id, label: text, color: "gray" };
    void commit(addEntry(list, entry));
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
                <tr key={e.id}>
                  <td>
                    <input aria-label={`Label ${e.id}`} defaultValue={e.label}
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
                        <input aria-label={`Rank ${e.id}`} type="number" style={{ width: 70 }} defaultValue={s.stageRank}
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
```

`src/features/settings/SettingsPage.tsx`:
```tsx
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

export function SettingsPage() {
  const { repo } = useApp();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [fxCurrency, setFxCurrency] = useState("");
  const [fxRate, setFxRate] = useState("");
  const w = settings.priorityWeights;

  const save = (patch: Partial<Settings>) => run(() => repo.saveSettings({ ...settings, ...patch }));
  const setWeight = (key: keyof Settings["priorityWeights"], v: number | null) => void save({ priorityWeights: { ...w, [key]: v ?? 0 } });
  const addFx = () => {
    const cur = fxCurrency.trim().toUpperCase();
    const rate = Number(fxRate);
    if (!cur || !(rate > 0)) return;
    void save({ fxRates: { ...settings.fxRates, [cur]: rate } });
    setFxCurrency("");
    setFxRate("");
  };
  const removeFx = (cur: string) => {
    const next = { ...settings.fxRates };
    delete next[cur];
    void save({ fxRates: next });
  };
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
          <TextField label="Display currency" value={settings.displayCurrency} onCommit={(v) => void save({ displayCurrency: v.trim().toUpperCase() || "CAD" })} />
          <NumberField label="Follow-up cadence (days)" value={settings.followUpCadenceDays} min={1} onCommit={(v) => void save({ followUpCadenceDays: v ?? 7 })} />
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
      </div>

      <div className="section">
        <h2>Pick lists</h2>
        <p className="muted">Rename freely: records reference entries by id. Archive an entry to hide it from new selections. Entries in use cannot be deleted.</p>
        <PickListEditor />
      </div>

      <div className="section">
        <h2>Reset</h2>
        <button type="button" className="btn danger" onClick={() => void reset()} disabled={repo.readOnly}>Reset settings to defaults</button>
      </div>
    </section>
  );
}
```

Modify `src/app/routes.tsx`: add `import { SettingsPage } from "../features/settings/SettingsPage";`, push `{ key: "settings", to: "/settings", label: "Settings" }` into `NAV`, and add `settings: SettingsPage` to `PAGES`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): general settings, FX rates, and pick-list editor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Companies page and editor

**Files:**
- Create: `src/features/companies/CompaniesPage.tsx`, `src/features/companies/CompanyEditor.tsx`
- Modify: `src/app/routes.tsx` (register `companies`)
- Test: `tests/features/companies.test.tsx`

**Interfaces:**
- Consumes: `PageProps` (Task 7), `navigate` (Task 7), `Table`, `Column`, `SortDir`, `Chip`, `Drawer`, `TextField`, `TextArea`, `TagInput`, `Field`, `useSaver`, `SaveIndicator`, `useConfirm` (Task 8), `useApp`/`useAppState`/`useSettings` (Task 6), `Repository.createCompany/update/remove` (Task 6).
- Produces: `CompaniesPage({parts})`, `CompanyEditor({id, onClose})`.

- [ ] **Step 1: Write the failing test**

`tests/features/companies.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string, seed?: (db: ReturnType<typeof createFakeDb>) => Promise<void>) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Companies" });
  return db;
}

describe("Companies", () => {
  it("creates a company and opens its editor", async () => {
    const db = await open("#/companies");
    fireEvent.change(screen.getByLabelText("New company"), { target: { value: "Shopify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Shopify");
    await waitFor(async () => expect((await db.collection("companies").get()).size).toBe(1));
    expect(window.location.hash).toMatch(/^#\/companies\/co_/);
  });

  it("renames from the editor and blocks deletion while applications reference it", async () => {
    const db = await open("#/companies/co_1", async (d) => {
      await d.doc("companies/co_1").set(buildCompany({ name: "Old Name" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await d.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "saved" }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "New Name" } });
    fireEvent.blur(name);
    await waitFor(async () => expect((await db.doc("companies/co_1").get()).data()?.name).toBe("New Name"));
    const del = screen.getByRole("button", { name: "Delete company" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(screen.getByText("SWE")).toBeTruthy();
  });

  it("deletes an unreferenced company after confirmation", async () => {
    const db = await open("#/companies/co_2", async (d) => {
      await d.doc("companies/co_2").set(buildCompany({ name: "Lonely" }, "co_2", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete company" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.doc("companies/co_2").get()).exists).toBe(false));
    expect(window.location.hash).toBe("#/companies");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/features/companies.test.tsx`
Expected: FAIL (no "Companies" heading; page not registered).

- [ ] **Step 3: Implement**

`src/features/companies/CompanyEditor.tsx`:
```tsx
import { useState } from "react";
import type { Company, SponsorshipPolicy } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { Field, TagInput, TextArea, TextField } from "../../ui/fields";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";

export function CompanyEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [newSource, setNewSource] = useState({ label: "", url: "" });
  const company = state.companies[id];

  if (!company) {
    return (
      <Drawer open title="Company not found" onClose={onClose}>
        <p className="muted">This company no longer exists.</p>
      </Drawer>
    );
  }

  const linked = Object.values(state.applications).filter((a) => a.companyId === id);
  const patch = (p: Partial<Company>) => void run(() => repo.update("companies", id, p));
  const setPolicy = (countryId: string, p: Partial<SponsorshipPolicy>) =>
    patch({ sponsorship: { ...company.sponsorship, [countryId]: { policy: "unknown", ...company.sponsorship[countryId], ...p } } });
  const remove = async () => {
    if (linked.length) return;
    const ok = await confirm({ title: `Delete ${company.name}?`, message: "Notes and sponsorship info on this company are removed. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("companies", id)))) onClose();
  };

  return (
    <Drawer
      open
      title={company.name}
      onClose={onClose}
      footer={
        <>
          <SaveIndicator status={status} />
          <button type="button" className="btn danger" disabled={linked.length > 0 || repo.readOnly}
            title={linked.length ? "Reassign or delete its applications first" : undefined} onClick={() => void remove()}>
            Delete company
          </button>
        </>
      }
    >
      <div className="grid-2">
        <TextField label="Name" value={company.name} onCommit={(v) => { if (v.trim()) patch({ name: v.trim() }); }} />
        <TextField label="Website" type="url" value={company.website ?? ""} onCommit={(v) => patch({ website: v || undefined })} />
        <TextField label="Industry" value={company.industry ?? ""} onCommit={(v) => patch({ industry: v || undefined })} />
        <TextField label="Size" value={company.size ?? ""} onCommit={(v) => patch({ size: v || undefined })} />
        <TextField label="HQ" value={company.hq ?? ""} onCommit={(v) => patch({ hq: v || undefined })} />
      </div>
      <TagInput label="Office cities" value={company.cities} onChange={(v) => patch({ cities: v })} />
      <TagInput label="Tech stack" value={company.techStack} onChange={(v) => patch({ techStack: v })} />

      <h3>Sponsorship by country</h3>
      {settings.pickLists.countries.map((co) => {
        const p = company.sponsorship[co.id];
        return (
          <div className="grid-2" key={co.id}>
            <Field label={`${co.label} sponsorship`} htmlFor={`sp-${co.id}`}>
              <select id={`sp-${co.id}`} value={p?.policy ?? "unknown"} onChange={(e) => setPolicy(co.id, { policy: e.target.value as SponsorshipPolicy["policy"] })}>
                <option value="unknown">Unknown</option>
                <option value="yes">Sponsors</option>
                <option value="no">Does not sponsor</option>
              </select>
            </Field>
            <TextField label={`${co.label} note`} value={p?.note ?? ""} onCommit={(v) => setPolicy(co.id, { note: v || undefined })} />
          </div>
        );
      })}

      <TextArea label="Interview process" rows={6} value={company.interviewProcess} onCommit={(v) => patch({ interviewProcess: v })}
        placeholder="Rounds, formats, what people report on Blind / Glassdoor / 잡플래닛" />

      <h3>Sources</h3>
      {company.sources.length ? (
        <ul>
          {company.sources.map((s, i) => (
            <li key={`${s.url}-${i}`}>
              <a href={s.url} target="_blank" rel="noreferrer">{s.label || s.url}</a>{" "}
              <button type="button" className="btn ghost" aria-label={`Remove source ${s.label || s.url}`} onClick={() => patch({ sources: company.sources.filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <input placeholder="Label" aria-label="Source label" value={newSource.label} onChange={(e) => setNewSource({ ...newSource, label: e.target.value })} />
        <input placeholder="https://" aria-label="Source URL" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
        <button type="button" className="btn" onClick={() => {
          if (!newSource.url.trim()) return;
          patch({ sources: [...company.sources, { label: newSource.label.trim(), url: newSource.url.trim() }] });
          setNewSource({ label: "", url: "" });
        }}>Add source</button>
      </div>

      <TextArea label="Notes" rows={6} value={company.notes} onCommit={(v) => patch({ notes: v })} />

      <h3>Applications ({linked.length})</h3>
      {linked.length === 0 ? <p className="muted">None yet.</p> : (
        <ul>{linked.map((a) => <li key={a.id}><a href={`#/applications/${a.id}`}>{a.title}</a></li>)}</ul>
      )}
    </Drawer>
  );
}
```

`src/features/companies/CompaniesPage.tsx`:
```tsx
import { useState } from "react";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import type { Company } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column, SortDir } from "../../ui/sortRows";
import { useSaver } from "../../ui/useSaver";
import { CompanyEditor } from "./CompanyEditor";

export function CompaniesPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { run } = useSaver();
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const appCount = (id: string) => Object.values(state.applications).filter((a) => a.companyId === id).length;
  const needle = q.trim().toLowerCase();
  const rows = Object.values(state.companies).filter((c) => !needle || c.name.toLowerCase().includes(needle));

  const columns: Column<Company>[] = [
    { key: "name", header: "Company", render: (c) => <strong>{c.name}</strong>, sortValue: (c) => c.name },
    { key: "hq", header: "HQ", render: (c) => c.hq ?? <span className="muted">—</span>, sortValue: (c) => c.hq ?? null },
    { key: "industry", header: "Industry", render: (c) => c.industry ?? <span className="muted">—</span>, sortValue: (c) => c.industry ?? null },
    { key: "apps", header: "Applications", align: "right", render: (c) => appCount(c.id), sortValue: (c) => appCount(c.id) },
    {
      key: "sponsorship", header: "Sponsorship",
      render: (c) => (
        <span className="row">
          {settings.pickLists.countries.map((co) => {
            const p = c.sponsorship[co.id]?.policy ?? "unknown";
            return <Chip key={co.id} color={p === "yes" ? "green" : p === "no" ? "red" : "gray"} title={c.sponsorship[co.id]?.note}>{co.id}: {p}</Chip>;
          })}
        </span>
      ),
    },
    { key: "updated", header: "Updated", render: (c) => c.updatedAt.slice(0, 10), sortValue: (c) => c.updatedAt },
  ];

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      const c = await repo.createCompany({ name });
      setNewName("");
      navigate(`/companies/${c.id}`);
    });
  };

  return (
    <section>
      <h1>Companies</h1>
      <div className="toolbar">
        <label className="field">
          <span className="field-label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name" />
        </label>
        <label className="field">
          <span className="field-label">New company</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
        </label>
        <button type="button" className="btn primary" onClick={create} disabled={repo.readOnly}>Add company</button>
      </div>
      <Table rows={rows} columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
        onRowClick={(c) => navigate(`/companies/${c.id}`)} selectedId={parts[0]}
        emptyText="No companies yet. Add one above, or create an application and its company is created for you." />
      {parts[0] ? <CompanyEditor id={parts[0]} onClose={() => navigate("/companies")} /> : null}
    </section>
  );
}
```

Modify `src/app/routes.tsx`: import `CompaniesPage` from `../features/companies/CompaniesPage`, push `{ key: "companies", to: "/companies", label: "Companies" }` into `NAV` **before** the settings entry, and add `companies: CompaniesPage` to `PAGES`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(companies): list, create, editor with sponsorship matrix and linked applications

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Applications: filters, table, quick-add, final navigation order

**Files:**
- Create: `src/domain/applicationFilters.ts`, `src/features/applications/ApplicationsPage.tsx`, `src/features/applications/QuickAdd.tsx`
- Modify: `src/app/routes.tsx` (rewrite with final order)
- Test: `tests/domain/applicationFilters.test.ts`, `tests/features/applications.test.tsx`

**Interfaces:**
- Consumes: `formatForHome`, `daysUntil`, `urgency`, `isPastDate` (Task 4); `priorityScore` (Task 3); `Table`, `Column`, `SortDir`, `Chip`, `PickChip`, `Drawer`, `Field`, `useSaver` (Task 8); `Repository.createCompany/createApplication` (Task 6).
- Produces: `AppFilter`, `emptyFilter()`, `filterApplications(apps, filter, {companies, settings})`; `ApplicationsPage({parts})`; `QuickAdd({open, onClose})`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/applicationFilters.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { emptyFilter, filterApplications } from "../../src/domain/applicationFilters";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";
const settings = defaultSettings("UTC", NOW);
const companies = { co_1: buildCompany({ name: "Shopify" }, "co_1", NOW), co_2: buildCompany({ name: "Kakao" }, "co_2", NOW) };
const apps = [
  buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", tier: "A", tags: ["remote-ok"] }, "a1", NOW),
  buildApplication({ companyId: "co_2", title: "백엔드 개발자", countryId: "KR", channelId: "wanted", statusId: "rejected" }, "a2", NOW),
  buildApplication({ companyId: "co_1", title: "Data Engineer", countryId: "US", channelId: "referral", statusId: "interviewing", city: "Austin" }, "a3", NOW),
];
const ctx = { companies, settings };

describe("filterApplications", () => {
  it("hides closed applications unless includeClosed or a closed status is chosen", () => {
    expect(filterApplications(apps, emptyFilter(), ctx).map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), includeClosed: true }, ctx)).toHaveLength(3);
    expect(filterApplications(apps, { ...emptyFilter(), statusId: "rejected" }, ctx).map((a) => a.id)).toEqual(["a2"]);
  });
  it("matches text against company, title, city, tags, case-insensitively", () => {
    expect(filterApplications(apps, { ...emptyFilter(), text: "shop" }, ctx).map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), text: "austin" }, ctx).map((a) => a.id)).toEqual(["a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), text: "remote-ok" }, ctx).map((a) => a.id)).toEqual(["a1"]);
    expect(filterApplications(apps, { ...emptyFilter(), text: "백엔드", includeClosed: true }, ctx).map((a) => a.id)).toEqual(["a2"]);
  });
  it("filters by country, tier and channel", () => {
    expect(filterApplications(apps, { ...emptyFilter(), countryId: "US" }, ctx).map((a) => a.id)).toEqual(["a3"]);
    expect(filterApplications(apps, { ...emptyFilter(), tier: "A" }, ctx).map((a) => a.id)).toEqual(["a1"]);
    expect(filterApplications(apps, { ...emptyFilter(), channelId: "referral" }, ctx).map((a) => a.id)).toEqual(["a3"]);
  });
});
```

`tests/features/applications.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Applications" });
  return db;
}

describe("Applications", () => {
  it("shows the final navigation order", async () => {
    await open("#/applications");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["Dashboard", "Applications", "Companies", "Settings"]);
  });

  it("quick-adds an application, creating the company, and opens it", async () => {
    const db = await open("#/applications");
    fireEvent.click(screen.getByRole("button", { name: "New application" }));
    fireEvent.change(await screen.findByLabelText("Role title"), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Shopify" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "CA" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(async () => expect((await db.collection("applications").get()).size).toBe(1));
    expect((await db.collection("companies").get()).docs[0].data()?.name).toBe("Shopify");
    expect(window.location.hash).toMatch(/^#\/applications\/app_/);
    expect(await screen.findByText("Backend Engineer")).toBeTruthy();
  });

  it("filters rows by text", async () => {
    const db = await open("#/applications");
    await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", createdAt: NOW, updatedAt: NOW });
    await db.doc("applications/app_1").set({ id: "app_1", companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", tier: null, desire: null, fit: null, likelihood: null, needsSponsorship: null, sponsorshipOffered: null, answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 3, createdAt: NOW, updatedAt: NOW });
    expect(await screen.findByText("Backend Engineer")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzz" } });
    expect(await screen.findByText(/No applications match/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/applicationFilters.test.ts tests/features/applications.test.tsx`
Expected: FAIL, modules not found / heading missing.

- [ ] **Step 3: Implement**

`src/domain/applicationFilters.ts`:
```ts
import type { Application, Company, Settings, Tier } from "./types";

export interface AppFilter {
  text: string;
  countryId: string;
  statusId: string;
  tier: "" | Tier;
  channelId: string;
  includeClosed: boolean;
}
export const emptyFilter = (): AppFilter => ({ text: "", countryId: "", statusId: "", tier: "", channelId: "", includeClosed: false });

export interface FilterContext {
  companies: Record<string, Company>;
  settings: Settings;
}

export function filterApplications(apps: Application[], f: AppFilter, ctx: FilterContext): Application[] {
  const text = f.text.trim().toLowerCase();
  const statusById = new Map(ctx.settings.pickLists.statuses.map((s) => [s.id, s] as const));
  return apps.filter((a) => {
    const status = statusById.get(a.statusId);
    if (!f.includeClosed && !f.statusId && status && status.group !== "open") return false;
    if (f.countryId && a.countryId !== f.countryId) return false;
    if (f.statusId && a.statusId !== f.statusId) return false;
    if (f.tier && a.tier !== f.tier) return false;
    if (f.channelId && a.channelId !== f.channelId) return false;
    if (text) {
      const company = ctx.companies[a.companyId]?.name ?? "";
      const hay = `${company} ${a.title} ${a.city ?? ""} ${a.reqId ?? ""} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
```

`src/features/applications/QuickAdd.tsx`:
```tsx
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
  const blank = () => ({ title: "", company: "", url: "", countryId: pl.countries[0]?.id ?? "", channelId: pl.channels[0]?.id ?? "", statusId: "saved" });
  const [form, setForm] = useState(blank);
  const companies = Object.values(state.companies);
  const openStatuses = pl.statuses.filter((s) => s.group === "open" && !s.archived);
  const canSubmit = form.title.trim() !== "" && form.company.trim() !== "" && status !== "saving";

  const submit = () => {
    if (!canSubmit) return;
    const title = form.title.trim();
    const name = form.company.trim();
    void run(async () => {
      const existing = companies.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const company = existing ?? (await repo.createCompany({ name }));
      const statusId = openStatuses.some((s) => s.id === form.statusId) ? form.statusId : openStatuses[0].id;
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
            {pl.countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Channel" htmlFor="qa-channel">
          <select id="qa-channel" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })}>
            {pl.channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
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
```

`src/features/applications/ApplicationsPage.tsx`:
```tsx
import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { navigate } from "../../app/router";
import type { PageProps } from "../../app/routes";
import { emptyFilter, filterApplications, type AppFilter } from "../../domain/applicationFilters";
import { daysUntil, formatForHome, isPastDate, urgency, type Urgency } from "../../domain/dates";
import { priorityScore } from "../../domain/scoring";
import type { Application, ColorToken } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { Chip, PickChip } from "../../ui/Chip";
import { Table } from "../../ui/Table";
import type { Column, SortDir } from "../../ui/sortRows";
import { QuickAdd } from "./QuickAdd";

const URGENCY_COLOR: Record<Urgency, ColorToken> = { overdue: "red", urgent: "red", soon: "amber", later: "gray" };

export function ApplicationsPage({ parts }: PageProps) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const [filter, setFilter] = useState<AppFilter>(emptyFilter());
  const [sortKey, setSortKey] = useState("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [adding, setAdding] = useState(false);
  const pl = settings.pickLists;
  const tz = settings.homeTz;

  const rows = useMemo(
    () => filterApplications(Object.values(state.applications), filter, { companies: state.companies, settings }),
    [state.applications, state.companies, settings, filter],
  );

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

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const set = (p: Partial<AppFilter>) => setFilter({ ...filter, ...p });

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Applications</h1>
        <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={repo.readOnly}>New application</button>
      </div>
      <div className="toolbar">
        <label className="field"><span className="field-label">Search</span><input value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder="Company, title, city, tag" /></label>
        <label className="field"><span className="field-label">Country</span>
          <select value={filter.countryId} onChange={(e) => set({ countryId: e.target.value })}>
            <option value="">All</option>{pl.countries.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Status</span>
          <select value={filter.statusId} onChange={(e) => set({ statusId: e.target.value })}>
            <option value="">All open</option>{pl.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Tier</span>
          <select value={filter.tier} onChange={(e) => set({ tier: e.target.value as AppFilter["tier"] })}>
            <option value="">Any</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <label className="field"><span className="field-label">Channel</span>
          <select value={filter.channelId} onChange={(e) => set({ channelId: e.target.value })}>
            <option value="">Any</option>{pl.channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={filter.includeClosed} onChange={(e) => set({ includeClosed: e.target.checked })} /> Include closed</label>
        <span className="muted">{rows.length} shown</span>
      </div>
      <Table rows={rows} columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort}
        onRowClick={(a) => navigate(`/applications/${a.id}`)} selectedId={parts[0]}
        emptyText="No applications match. Add one with “New application”." />
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
```

`src/app/routes.tsx` (replace with the final registry):
```tsx
import type { ComponentType } from "react";
import { ApplicationsPage } from "../features/applications/ApplicationsPage";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { DashboardPage } from "./DashboardPage";

export interface PageProps {
  parts: string[];
  query: URLSearchParams;
}
export interface NavItem {
  key: string;
  to: string;
  label: string;
}

export const NAV: NavItem[] = [
  { key: "", to: "/", label: "Dashboard" },
  { key: "applications", to: "/applications", label: "Applications" },
  { key: "companies", to: "/companies", label: "Companies" },
  { key: "settings", to: "/settings", label: "Settings" },
];

export const PAGES: Record<string, ComponentType<PageProps>> = {
  "": DashboardPage,
  applications: ApplicationsPage,
  companies: CompaniesPage,
  settings: SettingsPage,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(applications): filterable table, quick-add, final navigation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Application detail: header, overview, activity, notes, delete

**Files:**
- Create: `src/features/applications/ApplicationDetail.tsx`, `src/features/applications/OverviewTab.tsx`, `src/features/applications/ActivityTab.tsx`, `src/features/applications/NotesTab.tsx`, `src/features/applications/DeadlineField.tsx`
- Modify: `src/features/applications/ApplicationsPage.tsx` (render the detail when `parts[0]` is set), `src/styles/app.css` (activity list)
- Test: `tests/features/applicationDetail.test.tsx`

**Interfaces:**
- Consumes: `makeDeadline`, `toLocalInputValue`, `formatForHome`, `formatInstant` (Task 4); `normalizeAmount`, `formatMoney` (Task 4); `priorityScore`, `suggestedTier` (Task 3); `allTimeZones` (Task 9); all fields, `Drawer`, `useConfirm`, `useSaver`, `SaveIndicator` (Task 8); `Repository.update/changeStatus/logActivity/remove` (Task 6).
- Produces: `ApplicationDetail({id, onClose})`, `OverviewTab({app, patch})`, `ActivityTab({app})`, `NotesTab({app, patch})`, `DeadlineField({value, homeTz, onCommit})`.

- [ ] **Step 1: Write the failing test**

`tests/features/applicationDetail.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { Application } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open() {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  await db.doc("profile/main").set(defaultProfile(NOW) as unknown as Record<string, unknown>);
  await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
  await db.doc("applications/app_1").set(
    buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) as unknown as Record<string, unknown>,
  );
  window.location.hash = "#/applications/app_1";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("dialog");
  const stored = async () => (await db.doc("applications/app_1").get()).data() as unknown as Application | undefined;
  return { db, stored };
}

describe("ApplicationDetail", () => {
  it("changes status from the header and shows it in the activity tab", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "interviewing" } });
    await waitFor(async () => expect((await stored())?.statusId).toBe("interviewing"));
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(await screen.findByText(/Applied → Interviewing/)).toBeTruthy();
  });

  it("edits fields on the overview tab, including clearing one", async () => {
    const { stored } = await open();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Senior Backend Engineer" } });
    fireEvent.blur(title);
    await waitFor(async () => expect((await stored())?.title).toBe("Senior Backend Engineer"));
    const city = screen.getByLabelText("City");
    fireEvent.change(city, { target: { value: "Toronto" } });
    fireEvent.blur(city);
    await waitFor(async () => expect((await stored())?.city).toBe("Toronto"));
    fireEvent.change(city, { target: { value: "" } });
    fireEvent.blur(city);
    await waitFor(async () => expect(await stored()).not.toHaveProperty("city"));
    fireEvent.click(screen.getByRole("button", { name: "Desire 4" }));
    await waitFor(async () => expect((await stored())?.desire).toBe(4));
  });

  it("sets a date-only deadline in the chosen zone", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Deadline timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Deadline date"), { target: { value: "2026-10-01" } });
    await waitFor(async () => expect((await stored())?.deadline).toEqual({ at: "2026-10-01T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true }));
  });

  it("logs a note and deletes after confirmation", async () => {
    const { stored } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "emailed recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(async () => expect((await stored())?.activity.at(-1)?.text).toBe("emailed recruiter"));
    fireEvent.click(screen.getByRole("button", { name: "Delete application" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await stored()).toBeUndefined());
    expect(window.location.hash).toBe("#/applications");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/features/applicationDetail.test.tsx`
Expected: FAIL (no dialog rendered for `#/applications/app_1`).

- [ ] **Step 3: Implement**

`src/features/applications/DeadlineField.tsx`:
```tsx
import { useEffect, useState } from "react";
import { formatForHome, makeDeadline, toLocalInputValue } from "../../domain/dates";
import type { Deadline } from "../../domain/types";
import { allTimeZones } from "../../ui/timeZones";

interface Props {
  value: Deadline | undefined;
  homeTz: string;
  onCommit: (deadline: Deadline | undefined) => void;
}

/** Date or date-time input plus a source timezone; stores UTC with the zone (spec §4 Timezones). */
export function DeadlineField({ value, homeTz, onCommit }: Props) {
  const [tz, setTz] = useState(value?.tz ?? homeTz);
  const [dateOnly, setDateOnly] = useState(value?.dateOnly ?? true);
  const [draft, setDraft] = useState(value ? toLocalInputValue(value.at, value.tz, value.dateOnly) : "");

  useEffect(() => {
    setTz(value?.tz ?? homeTz);
    setDateOnly(value?.dateOnly ?? true);
    setDraft(value ? toLocalInputValue(value.at, value.tz, value.dateOnly) : "");
  }, [value, homeTz]);

  const commit = (d: string, z: string, only: boolean) => {
    if (!d) {
      if (value) onCommit(undefined);
      return;
    }
    try {
      onCommit(makeDeadline(d, z, only));
    } catch {
      /* partial input while typing; keep the draft */
    }
  };

  const shown = value ? formatForHome(value, homeTz) : null;
  return (
    <div className="field">
      <span className="field-label">Deadline</span>
      <div className="row">
        <input aria-label={dateOnly ? "Deadline date" : "Deadline date and time"} type={dateOnly ? "date" : "datetime-local"} value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value, tz, dateOnly); }} />
        <select aria-label="Deadline timezone" value={tz} onChange={(e) => { setTz(e.target.value); commit(draft, e.target.value, dateOnly); }}>
          {allTimeZones().map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <label className="row">
          <input type="checkbox" checked={dateOnly} onChange={(e) => {
            const only = e.target.checked;
            const next = draft ? (only ? draft.slice(0, 10) : draft.length <= 10 ? `${draft}T23:59` : draft) : "";
            setDateOnly(only);
            setDraft(next);
            commit(next, tz, only);
          }} />
          Date only
        </label>
        {value ? <button type="button" className="btn ghost" onClick={() => onCommit(undefined)}>Clear</button> : null}
      </div>
      {shown ? <span className="field-hint">{shown.home}{shown.source ? ` · source ${shown.source}` : ""}</span> : null}
    </div>
  );
}
```

`src/features/applications/OverviewTab.tsx`:
```tsx
import { formatMoney, normalizeAmount } from "../../domain/money";
import type { Application, Comp, Rating, Settings } from "../../domain/types";
import { useAppState, useSettings } from "../../store/context";
import { DateField, NumberField, RatingField, SelectField, TagInput, TextArea, TextField, TriStateField } from "../../ui/fields";
import { DeadlineField } from "./DeadlineField";

const PERIODS = [{ id: "year", label: "per year" }, { id: "month", label: "per month" }, { id: "hour", label: "per hour" }];

function normalizedText(comp: Comp, settings: Settings): string | null {
  if (comp.currency === settings.displayCurrency) return null;
  const lo = comp.min != null ? normalizeAmount(comp.min, comp.currency, settings) : null;
  const hi = comp.max != null ? normalizeAmount(comp.max, comp.currency, settings) : null;
  if (lo == null && hi == null) return null;
  const f = (n: number | null) => (n == null ? "?" : formatMoney(n, settings.displayCurrency));
  return `${f(lo)} – ${f(hi)}`;
}

export function OverviewTab({ app, patch }: { app: Application; patch: (p: Partial<Application>) => unknown }) {
  const state = useAppState();
  const settings = useSettings();
  const pl = settings.pickLists;
  const companies = Object.values(state.companies).map((c) => ({ id: c.id, label: c.name }));
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const comp: Comp = app.comp ?? { currency: settings.displayCurrency, period: "year" };
  const setComp = (p: Partial<Comp>) => patch({ comp: { ...comp, ...p } });
  const closed = pl.statuses.find((s) => s.id === app.statusId)?.group !== "open";
  const hasAmounts = comp.min != null || comp.max != null;
  const normalized = normalizedText(comp, settings);

  return (
    <div>
      <div className="section">
        <h3>Role</h3>
        <div className="grid-2">
          <SelectField label="Company" value={app.companyId} options={companies} onChange={(v) => { if (v) patch({ companyId: v }); }} allowEmpty={false} />
          <TextField label="Title" value={app.title} onCommit={(v) => { if (v.trim()) patch({ title: v.trim() }); }} />
          <TextField label="Req ID" value={app.reqId ?? ""} onCommit={(v) => patch({ reqId: opt(v) })} />
          <TextField label="Posting URL" type="url" value={app.url ?? ""} onCommit={(v) => patch({ url: opt(v) })} />
          <TextField label="Team" value={app.team ?? ""} onCommit={(v) => patch({ team: opt(v) })} />
          <SelectField label="Level" value={app.levelId ?? ""} options={pl.levels} onChange={(v) => patch({ levelId: opt(v) })} />
          <SelectField label="Role family" value={app.roleFamilyId ?? ""} options={pl.roleFamilies} onChange={(v) => patch({ roleFamilyId: opt(v) })} />
          <SelectField label="Employment type" value={app.employmentTypeId ?? ""} options={pl.employmentTypes} onChange={(v) => patch({ employmentTypeId: opt(v) })} />
          <SelectField label="Hiring track" value={app.hiringTrackId ?? ""} options={pl.hiringTracks} onChange={(v) => patch({ hiringTrackId: opt(v) })} />
          <SelectField label="Work mode" value={app.workModeId ?? ""} options={pl.workModes} onChange={(v) => patch({ workModeId: opt(v) })} />
        </div>
      </div>

      <div className="section">
        <h3>Where and how</h3>
        <div className="grid-2">
          <SelectField label="Country" value={app.countryId} options={pl.countries} onChange={(v) => { if (v) patch({ countryId: v }); }} allowEmpty={false} />
          <TextField label="City" value={app.city ?? ""} onCommit={(v) => patch({ city: opt(v) })} />
          <SelectField label="Channel" value={app.channelId} options={pl.channels} onChange={(v) => { if (v) patch({ channelId: v }); }} allowEmpty={false} />
          <TextField label="Source note" value={app.sourceNote ?? ""} onCommit={(v) => patch({ sourceNote: opt(v) })} placeholder="Who referred, which recruiter, which posting" />
        </div>
      </div>

      <div className="section">
        <h3>Timeline</h3>
        <DeadlineField value={app.deadline} homeTz={settings.homeTz} onCommit={(d) => patch({ deadline: d })} />
        <div className="grid-3">
          <DateField label="Applied on" value={app.appliedAt ?? ""} onCommit={(v) => patch({ appliedAt: opt(v) })} />
          <TextField label="Next action" value={app.nextAction ?? ""} onCommit={(v) => patch({ nextAction: opt(v) })} placeholder="Follow up with recruiter" />
          <DateField label="Next action due" value={app.nextActionDue ?? ""} onCommit={(v) => patch({ nextActionDue: opt(v) })} />
        </div>
      </div>

      <div className="section">
        <h3>Priority</h3>
        <div className="grid-3">
          <RatingField label="Desire" value={app.desire} onChange={(v) => patch({ desire: v as Rating | null })} />
          <RatingField label="Fit" value={app.fit} onChange={(v) => patch({ fit: v as Rating | null })} />
          <RatingField label="Likelihood" value={app.likelihood} onChange={(v) => patch({ likelihood: v as Rating | null })} />
        </div>
      </div>

      <div className="section">
        <h3>Compensation</h3>
        <div className="grid-3">
          <NumberField label="Min" value={comp.min ?? null} onCommit={(v) => setComp({ min: v ?? undefined })} />
          <NumberField label="Max" value={comp.max ?? null} onCommit={(v) => setComp({ max: v ?? undefined })} />
          <TextField label="Currency" value={comp.currency} onCommit={(v) => setComp({ currency: v.trim().toUpperCase() || settings.displayCurrency })} />
          <SelectField label="Period" value={comp.period} options={PERIODS} onChange={(v) => { if (v) setComp({ period: v as Comp["period"] }); }} allowEmpty={false} />
          <TextField label="Comp note" value={comp.note ?? ""} onCommit={(v) => setComp({ note: opt(v) })} />
          <div className="field">
            <span className="field-label">In {settings.displayCurrency}</span>
            <span>{normalized ?? (comp.currency !== settings.displayCurrency && hasAmounts ? <span className="muted">Set a rate for {comp.currency} in Settings</span> : <span className="muted">—</span>)}</span>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Work authorization</h3>
        <div className="grid-2">
          <TriStateField label="Sponsorship needed" value={app.needsSponsorship} onChange={(v) => patch({ needsSponsorship: v })} />
          <TriStateField label="Sponsorship offered" value={app.sponsorshipOffered} onChange={(v) => patch({ sponsorshipOffered: v })} />
        </div>
      </div>

      {closed ? (
        <div className="section">
          <h3>Closed</h3>
          <SelectField label="Closed reason" value={app.closedReasonId ?? ""} options={pl.closedReasons} onChange={(v) => patch({ closedReasonId: opt(v) })} />
          <p className="muted">Closed on {app.closedAt?.slice(0, 10) ?? "—"}</p>
        </div>
      ) : null}

      <div className="section">
        <h3>Tags and job description</h3>
        <TagInput label="Tags" value={app.tags} onChange={(v) => patch({ tags: v })} />
        <TextArea label="Job description" rows={10} value={app.jobDescription ?? ""} onCommit={(v) => patch({ jobDescription: opt(v) })}
          placeholder="Paste the posting here. AI drafting and requirement extraction use it in a later plan." />
      </div>
    </div>
  );
}
```

`src/features/applications/ActivityTab.tsx`:
```tsx
import { useState } from "react";
import { formatInstant } from "../../domain/dates";
import type { Application } from "../../domain/types";
import { useApp, useSettings } from "../../store/context";
import { useSaver } from "../../ui/useSaver";

export function ActivityTab({ app }: { app: Application }) {
  const { repo } = useApp();
  const settings = useSettings();
  const { run, status } = useSaver();
  const [note, setNote] = useState("");
  const label = (id?: string) => settings.pickLists.statuses.find((s) => s.id === id)?.label ?? id ?? "";
  const add = () => {
    const text = note.trim();
    if (!text) return;
    void run(async () => {
      await repo.logActivity(app.id, { type: "note", text });
      setNote("");
    });
  };
  const entries = [...app.activity].reverse();
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input aria-label="New note" value={note} placeholder="Log a note (emailed recruiter, got the OA link…)"
          onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" className="btn" onClick={add} disabled={status === "saving" || repo.readOnly}>Add note</button>
      </div>
      {entries.length === 0 ? (
        <p className="muted">No activity yet. Status changes and notes appear here.</p>
      ) : (
        <ul className="activity">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="muted">{formatInstant(e.at, settings.homeTz)}</span>{" "}
              {e.type === "status" ? `${label(e.from)} → ${label(e.to)}${e.text ? ` · ${e.text}` : ""}` : e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/features/applications/NotesTab.tsx`:
```tsx
import type { Application } from "../../domain/types";
import { TextArea } from "../../ui/fields";

export function NotesTab({ app, patch }: { app: Application; patch: (p: Partial<Application>) => unknown }) {
  return (
    <TextArea label="Notes" rows={18} value={app.notes} onCommit={(v) => patch({ notes: v })}
      placeholder="Anything about this application: people, impressions, questions to ask, offer details." />
  );
}
```

`src/features/applications/ApplicationDetail.tsx`:
```tsx
import { useState } from "react";
import { priorityScore, suggestedTier } from "../../domain/scoring";
import type { Application, Tier } from "../../domain/types";
import { useApp, useAppState, useSettings } from "../../store/context";
import { useConfirm } from "../../ui/Confirm";
import { Drawer } from "../../ui/Drawer";
import { SaveIndicator } from "../../ui/SaveIndicator";
import { useSaver } from "../../ui/useSaver";
import { ActivityTab } from "./ActivityTab";
import { NotesTab } from "./NotesTab";
import { OverviewTab } from "./OverviewTab";

type Tab = "overview" | "activity" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
];

export function ApplicationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo } = useApp();
  const state = useAppState();
  const settings = useSettings();
  const { status, run } = useSaver();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("overview");
  const app = state.applications[id];

  if (!app) {
    return (
      <Drawer open title="Application not found" onClose={onClose}>
        <p className="muted">This application no longer exists.</p>
      </Drawer>
    );
  }

  const company = state.companies[app.companyId];
  const patch = (p: Partial<Application>) => run(() => repo.update("applications", id, p));
  const score = priorityScore(app, settings.priorityWeights);
  const remove = async () => {
    const ok = await confirm({ title: `Delete ${app.title} at ${company?.name ?? "?"}?`, message: "Interviews linked to it lose their link. This cannot be undone.", confirmLabel: "Delete" });
    if (ok && (await run(() => repo.remove("applications", id)))) onClose();
  };

  return (
    <Drawer open wide onClose={onClose}
      title={<span>{company?.name ?? "?"} <span className="muted">·</span> {app.title}</span>}
      footer={<><SaveIndicator status={status} /><button type="button" className="btn danger" onClick={() => void remove()} disabled={repo.readOnly}>Delete application</button></>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Status</span>
          <select aria-label="Status" value={app.statusId} onChange={(e) => void run(() => repo.changeStatus(id, e.target.value))}>
            {settings.pickLists.statuses.filter((s) => !s.archived || s.id === app.statusId).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Tier</span>
          <select aria-label="Tier" value={app.tier ?? ""} onChange={(e) => void patch({ tier: (e.target.value || null) as Tier | null })}>
            <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Score</span>
          <span>{score ?? "—"}{score != null ? <span className="muted"> (suggests {suggestedTier(score)})</span> : null}</span>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === "overview" ? <OverviewTab app={app} patch={patch} /> : tab === "activity" ? <ActivityTab app={app} /> : <NotesTab app={app} patch={patch} />}
    </Drawer>
  );
}
```

Modify `src/features/applications/ApplicationsPage.tsx`: add `import { ApplicationDetail } from "./ApplicationDetail";` and, right after `<QuickAdd … />`, render:
```tsx
      {parts[0] ? <ApplicationDetail id={parts[0]} onClose={() => navigate("/applications")} /> : null}
```

Append to `src/styles/app.css`:
```css
.activity { list-style: none; padding: 0; margin: 0; }
.activity li { padding: 6px 0; border-bottom: 1px solid var(--border); }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS; typecheck 0; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(applications): detail panel with overview, activity log, notes, and delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Publish v1 and smoke-test it (performed by the orchestrating session)

**Files:**
- Read: `dist/index.html`, `dist/app.js`, `dist/app.css` (build output)
- Modify: `README.md` (create)

**Interfaces:**
- Consumes: the whole build. Produces: the published artifact URL, recorded in `README.md`.

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: every suite PASS; `dist/` contains `index.html`, `dev.html`, `app.js`, `app.css`.

- [ ] **Step 2: Local browser smoke test**

Run `npm run dev` in the background, open `http://localhost:5173/dev.html` in the browser pane, and check: nav order Dashboard / Applications / Companies / Settings; create an application via quick-add; change its status; see the activity entry; set a deadline in Asia/Seoul and confirm the hint shows the home-zone time; edit a pick list; reload and confirm data persisted (dev fake db in localStorage). Emulate a 375 px viewport and confirm the nav becomes a bottom bar and tables scroll horizontally. Stop the dev server.

- [ ] **Step 3: Publish**

Load the `artifact-design` skill (required before writing/publishing an artifact) and confirm the page follows its guidance; then call the Artifact tool:
- `file_path`: `dist/index.html`
- `files`: `{"app.js": "dist/app.js", "app.css": "dist/app.css"}`
- `capabilities`: `{"db": {}, "assets": {}, "downloads": true, "sample": {}}`
- `favicon`: `🧭`
- `description`: `Private job-search tracker: applications, companies, deadlines and prep across Canada, the US and Korea.`
Expected: a private artifact URL.

- [ ] **Step 4: Published smoke test**

Open the artifact URL in the browser pane. Expected: no read-only banner (the real `db` resolved); create a company and an application; reload and confirm they persist; check light and dark rendering.

- [ ] **Step 5: Record and commit**

Create `README.md`:
```markdown
# Job Hunt HQ

Private job-search tracker for a multi-market search (Canada, US, Korea), published as a claude.ai artifact.

- Spec: `docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md`
- Plans: `docs/superpowers/plans/`
- Published page: <paste the artifact URL here>

## Develop

    npm install
    npm run dev        # http://localhost:5173/dev.html (localStorage-backed fake store)
    npm test
    npm run typecheck
    npm run build      # dist/index.html (artifact fragment) + dist/app.js + dist/app.css

## Publish

Artifact tool: `file_path: dist/index.html`, `files: {"app.js": "dist/app.js", "app.css": "dist/app.css"}`,
`capabilities: {db: {}, assets: {}, downloads: true, sample: {}}`.
```

```bash
git add -A
git commit -m "docs: README with publish instructions and artifact URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git tag v0.1.0
```
