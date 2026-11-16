# Company Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public company dataset: sponsorship tables from the US LCA and PERM files and Canada's positive LMIA list, hand-reviewed company profiles, validation, and weekly GitHub Actions jobs that publish static JSON to GitHub Pages and flag changed sources.

**Architecture:** A TypeScript pipeline in `pipeline/` streams government spreadsheets into typed records (dropping every personal column at read time), assigns each filing a role and a place, accumulates per-owner year blocks with small-cell roll-up, and writes versioned static JSON into `site/data/v1/`. Hand-written profiles in `data/companies/*.yaml` are validated by a zod schema and matched exactly to employers by FEIN or normalised name. Three workflows: build and deploy (weekly), source re-check (weekly), and validation on every pull request.

**Tech Stack:** Node 24, TypeScript (strict), tsx (CLI runner), exceljs (streaming XLSX), yaml, zod 4, Vitest, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-14-company-dataset-design.md`

## Global Constraints

- Small-cell threshold: 3 certified filings (LCA, PERM) or 3 approved LMIAs (Canada).
- Coverage per source: the three most recent complete years plus the current year to date.
- Profile summaries: at most 280 characters each, English and Korean counted separately.
- Personal columns never pass the loader: `EMPLOYER_POC_*`, `EMP_POC_*`, `AGENT_ATTORNEY_*`, `ATTY_AG_*`, `LAWFIRM_*`, `PREPARER_*`, phone fields, street address lines. Loaders select allowed columns by name.
- FEINs of unprofiled employers never appear in published files.
- Sizes: no output file over 50 MB; each index shard at most 2 MB gzipped; each reverse file at most 1 MB gzipped; committed summaries grow under 50 MB a year.
- The build finishes in about 30 minutes on GitHub Actions, and the same inputs produce byte-identical outputs (sorted keys and arrays).
- A build that fails a check exits non-zero and is never deployed; the live data stays.
- Published schema is `v1`; changes inside it are additive only.
- Licences: code MIT; profile content CC BY 4.0; US-derived tables are a US government work (public domain); Canada-derived tables carry the attribution "Contains information licensed under the Open Government Licence – Canada."
- HTTP: respect robots.txt, at most 1 request per second per host, user agent `job-hunt-hq-dataset/1 (+https://github.com/hjun-escape/job-hunt-hq)` unless Task 1 records a different standard client user agent for a host. Never a personal name or email.
- Test-first with Vitest. Every pipeline test file starts with `// @vitest-environment node`.
- Documentation uses no em dashes (house style).
- Steps marked **Needs the user** stop and ask before acting: large downloads, pushing a branch, changing repository settings.

**Refinements of the spec decided in this plan** (raise in the handoff):

1. Metro areas come from the worksite county, which both US files carry, through the OMB delineation file. Postal codes are not read at all.
2. Source fingerprints live in `data/fingerprints.json`, keyed by URL and written by the weekly job, so profile files stay purely hand-written.
3. A company ID is the registrable domain of its website (`about.gitlab.com` becomes `gitlab.com`, `aws.amazon.com` becomes `amazon.com`).
4. Pay statistics are rounded to the nearest 1,000. A filing's pay is excluded from statistics (still counted as a filing) when the hourly rate is over 1,000 or the annualised pay is under 15,000 or over 1,500,000.
5. The comparison with the government's own published totals produces warnings in the build report, not failures, because their definitions may not match ours exactly.

## Review Focus

1. Spreadsheets with title rows above the header, stray spaces or case differences in header names, and footnote rows at the end: the loader finds the header and skips non-data rows. Tests in Task 3 and Task 9.
2. Cumulative quarterly files: reading Q2 and Q4 of the same fiscal year would double count; only the latest quarter per year is used. Test in Task 1.
3. LCA rows with a blank FEIN still get a stable ID, distinct from FEIN-based IDs. Tests in Task 4 and Task 8.
4. One FEIN filed under several spellings becomes one employer, shown under its most frequent spelling. Test in Task 10.
5. Accented French names normalise consistently (`Société Générale Ltée` to `SOCIETE GENERALE`, `Montréal` to the Montréal CMA). Tests in Task 4 and Task 6.

## File Structure

```
pipeline/
  sources.ts            source registry, URL builders, expected columns, year selection
  http.ts               politeFetch, robots.txt check
  types.ts              internal record types (UsFiling, CaApproval, Place, ...)
  schema/profile.ts     zod profile schema and types
  schema/published.ts   zod schemas and types for every published file
  load/rows.ts          streaming XLSX/CSV reader with header detection
  load/us.ts            LCA and PERM row mappers
  load/ca.ts            positive-LMIA row mapper
  normalize/names.ts    name normalisation, person-name test, IDs
  normalize/us.ts       amounts, annual pay, fiscal dates, statuses, wage levels
  normalize/places.ts   place index (CBSA, CMA), Canadian address parsing
  normalize/roles.ts    role classifier
  aggregate/cells.ts    roll-up and pay statistics
  aggregate/accumulate.ts  per-owner year blocks
  aggregate/trend.ts    year-over-year trends
  profiles/load.ts, profiles/validate.ts
  match/entities.ts, match/report.ts
  publish/write.ts, publish/copy.ts
  check/totals.ts, check/sizes.ts, check/text.ts, check/recheck.ts
  build.ts              runBuild orchestration
  cli/download.ts, inspect.ts, reference.ts, validate.ts, find.ts, build.ts, recheck.ts
data/
  companies/<domain>.yaml   profiles
  seed.yaml                 launch seed list
  roles.yaml                role categories
  reference/us-counties-cbsa.csv, reference/ca-csd-cma.csv
  summary/<program>-<year>.csv   committed by the build workflow
  fingerprints.json         written by the re-check workflow
site-static/index.html      placeholder page deployed with the data
tests/pipeline/...          one test file per module
.github/workflows/ci.yml, dataset-build.yml, dataset-recheck.yml
docs/dataset/RUNBOOK.md, CONTRIBUTING.md, DATA-LICENSE.md
```

---

### Task 1: Tooling, source registry and download check

**Files:**
- Modify: `package.json` (devDependencies `tsx`, `exceljs`, `yaml`, `zod@^4`; scripts `dataset:download`, `dataset:inspect`, `dataset:reference`, `dataset:validate`, `dataset:find`, `dataset:build`, `dataset:recheck`, each `tsx pipeline/cli/<name>.ts`), `tsconfig.json` (add `"pipeline"` to `include`), `.gitignore` (add `.cache`, `site`, `build-problems.md`, `recheck.md`)
- Create: `pipeline/sources.ts`, `pipeline/http.ts`, `pipeline/cli/download.ts`, `pipeline/cli/inspect.ts`, `.github/workflows/dataset-download-check.yml`
- Test: `tests/pipeline/sources.test.ts`, `tests/pipeline/http.test.ts`

**Interfaces:**
- Produces:
  - `currentFiscalYear(date: Date): number` (US fiscal year, October to September)
  - `type YearSelection = { complete: number[]; partial?: { year: number; through: 1 | 2 | 3 } }`
  - `selectYears(maxQuarterByYear: Record<number, 0 | 1 | 2 | 3 | 4>): YearSelection` (at most 3 complete years, the most recent ones; the latest year with quarters 1 to 3 is partial)
  - `latestQuarterFiles<T extends { year: number; quarter: number }>(found: T[]): T[]` (one per year, highest quarter, sorted by year)
  - `lcaUrl(fy: number, q: number): string`, `permUrl(fy: number, q: number): string`, constants `LMIA_PACKAGE_API`, `CBSA_DELINEATION_URL`, `STATCAN_GAF_URL`
  - `EXPECTED_COLUMNS: { lca: string[]; perm: string[]; lmia: string[] }` (allowed columns only)
  - `DOL_DOWNLOAD_MODE: "direct" | "release"`, `USER_AGENTS: Record<string, string>` (host to user agent, default above)
  - `type SourceFile = { source: "lca" | "perm" | "lmia" | "cbsa" | "gaf"; year?: number; quarter?: number; url: string; path: string; sha256: string; bytes: number; fetchedAt: string }`; manifest at `<cache>/manifest.json` is `SourceFile[]`
  - `politeFetch(url: string, init?: RequestInit): Promise<Response>` (user agent per host, 1 request per second per host, 3 retries with backoff on 5xx and network errors)
  - `isAllowedByRobots(robotsTxt: string, path: string): boolean` (rules under `User-agent: *` only)

Allowed columns to start from (Step 8 confirms them against the real files):
- LCA: `CASE_STATUS, DECISION_DATE, VISA_CLASS, JOB_TITLE, SOC_CODE, TOTAL_WORKER_POSITIONS, NEW_EMPLOYMENT, CONTINUED_EMPLOYMENT, CHANGE_PREVIOUS_EMPLOYMENT, NEW_CONCURRENT_EMPLOYMENT, CHANGE_EMPLOYER, AMENDED_PETITION, EMPLOYER_NAME, TRADE_NAME_DBA, EMPLOYER_STATE, EMPLOYER_FEIN, WORKSITE_COUNTY, WORKSITE_STATE, WAGE_RATE_OF_PAY_FROM, WAGE_UNIT_OF_PAY, PW_WAGE_LEVEL`
- PERM: `CASE_STATUS, DECISION_DATE, EMP_BUSINESS_NAME, EMP_TRADE_NAME, EMP_FEIN, EMP_STATE, JOB_TITLE, PWD_SOC_CODE, JOB_OPP_WAGE_FROM, JOB_OPP_WAGE_PER, PRIMARY_WORKSITE_COUNTY, PRIMARY_WORKSITE_STATE`
- LMIA (header names to confirm): `Province/Territory, Program Stream, Employer, Address, Occupation, Approved LMIAs, Approved Positions`

- [ ] **Step 1: Install the dependencies and wire the config.** Run `npm run typecheck && npm test`. Expected: both pass as before.
- [ ] **Step 2: Write the failing tests**

```ts
// tests/pipeline/sources.test.ts
expect(currentFiscalYear(new Date("2026-11-14"))).toBe(2027);
expect(currentFiscalYear(new Date("2026-09-30"))).toBe(2026);
expect(selectYears({ 2023: 4, 2024: 4, 2025: 4, 2026: 3 })).toEqual({ complete: [2023, 2024, 2025], partial: { year: 2026, through: 3 } });
expect(selectYears({ 2022: 4, 2023: 4, 2024: 4, 2025: 4, 2026: 4, 2027: 0 })).toEqual({ complete: [2024, 2025, 2026] });
expect(selectYears({ 2025: 4, 2026: 1 })).toEqual({ complete: [2025], partial: { year: 2026, through: 1 } });
// "uses only the latest quarter of each year (quarterly files are cumulative)"
expect(latestQuarterFiles([{ year: 2026, quarter: 2 }, { year: 2026, quarter: 3 }, { year: 2025, quarter: 4 }]))
  .toEqual([{ year: 2025, quarter: 4 }, { year: 2026, quarter: 3 }]);

// tests/pipeline/http.test.ts
const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private";
expect(isAllowedByRobots(robots, "/private/x")).toBe(false);
expect(isAllowedByRobots(robots, "/data/file.xlsx")).toBe(true);
expect(isAllowedByRobots("", "/anything")).toBe(true);
```

- [ ] **Step 3: Run the tests to see them fail.** Run `npx vitest run tests/pipeline`. Expected: FAIL, modules not found.
- [ ] **Step 4: Implement `pipeline/sources.ts` and `pipeline/http.ts`.**
- [ ] **Step 5: Run the tests to see them pass.** Run `npx vitest run tests/pipeline`. Expected: PASS.
- [ ] **Step 6: Implement the download CLI** `npm run dataset:download -- [--only lca,perm,lmia,cbsa,gaf] [--cache .cache/dataset]`. For LCA and PERM it probes years from `currentFiscalYear(today)` back 5 years, quarters 4 down to 1, with HEAD requests; feeds the result to `selectYears`; downloads the latest quarter of each selected year. For LMIA it reads the dataset's resources from `LMIA_PACKAGE_API` (CKAN `package_show`), keeps the English XLSX or CSV resources, and selects calendar years with the same `selectYears` rule. It skips a file already in the manifest with a matching sha256 on disk, and writes the manifest.
- [ ] **Step 7: Implement the inspect CLI** `npm run dataset:inspect -- <file>`. It prints sheet names, the detected header row and the number of data rows, and never prints row values.
- [ ] **Step 8: Needs the user (several hundred MB of downloads).** Download one LCA file, one PERM file, the latest LMIA quarter, the CBSA delineation file and the StatCan geographic attribute file; run inspect on each. Record in `sources.ts`: the URL patterns that worked, `EXPECTED_COLUMNS` from the real headers (allowed set only), the LMIA header names, and which user agent each host accepted. Expected: the LCA header contains every allowed LCA column above.
- [ ] **Step 9: Needs the user (push a branch).** Push the branch and run `dataset-download-check` (workflow_dispatch: checkout, `npm ci`, `npm run dataset:download -- --only lca`, print the manifest). Expected: one manifest entry with `bytes` over 10 MB. If dol.gov refuses GitHub's servers: add `--from-release <tag>` to the download CLI (fetches the files with `gh release download <tag> --dir <cache>` and builds the manifest from them) and `scripts/upload-dataset-sources.sh <tag>` (downloads locally, uploads with `gh release upload`), and set `DOL_DOWNLOAD_MODE = "release"`.
- [ ] **Step 10: Commit.** `git add package.json package-lock.json tsconfig.json .gitignore pipeline tests/pipeline .github/workflows/dataset-download-check.yml && git commit -m "feat(dataset): source registry and download check"`

### Task 2: Schemas and shared types

**Files:**
- Create: `pipeline/types.ts`, `pipeline/schema/profile.ts`, `pipeline/schema/published.ts`
- Test: `tests/pipeline/schema.test.ts`

**Interfaces:**
- Produces (internal, `pipeline/types.ts`):
  - `type Country = "US" | "CA"`, `type CaseStatus = "certified" | "denied" | "withdrawn"`, `type WageLevel = "I" | "II" | "III" | "IV" | "N/A"`
  - `type Place = { metro: string | null; region: string }` (metro `cbsa:<code>` or `cma:<code>`; region `US-<ST>`, `CA-<PR>`, or `US` / `CA` when unknown)
  - `type UsFiling = { program: "lca" | "perm"; year: number; month: number; status: CaseStatus; employer: { fein: string | null; name: string; tradeName: string | null; state: string | null }; role: string; place: Place; annualPay: number | null; lca?: { visaClass: string; workers: number; newHires: number; changeEmployer: number; continuing: number; level: WageLevel } }`
  - `type CaApproval = { year: number; quarter: 1 | 2 | 3 | 4; employer: { name: string; province: string }; stream: string; role: string; place: Place; lmias: number; positions: number }`
  - `type LoadStats = { read: number; kept: number; skippedPerson: number; skippedInvalid: number }`
- Produces (`pipeline/schema/profile.ts`): `ProfileSchema` (strict) and `type Profile`, with:
  - `SourceRef = { url: https URL; seen: ISO date }`, `Text280 = { en: string (1..280); ko?: string (1..280) }`
  - `Fact<V> = { value: V; kind: "official" | "reported"; sources: SourceRef[] (min 1); checked: ISO date }`
  - Profile fields: `id`, `name`, `otherNames?: string[]`, `countries: ("US" | "CA" | "KR")[]` (min 1), `officialHosts?: string[]`, `wikidata?: /^Q\d+$/`, `dartCorpCode?: /^\d{8}$/`, `entities: { usFeins?: /^\d{9}$/[]; usNames?: string[]; caNames?: { name: string; province: /^[A-Z]{2}$/ }[] }`, `basics?: { industry?: Fact<string>; size?: Fact<string>; hq?: Fact<string> }`, `mission?: Fact<Text280>`, `values?: Fact<{ names: string[]; summary: Text280 }>`, `applicationRules?: Fact<Text280>[]`, `hiringProcess?: Fact<Text280>`, `reapplyWait?: Fact<{ after: "resume" | "phone" | "onsite" | "any"; wait: Text280 }>[]`, `links?: { label: string; url: https URL }[]`
  - `profileJsonSchema(): object` (via `z.toJSONSchema`)
- Produces (`pipeline/schema/published.ts`), zod schemas with matching types:
  - `PayStats = { n: number; p25: number; median: number; p75: number }`
  - `UsCell = { role: string; place: string; filings: number; denied: number; withdrawn: number; workers?: number; newHires?: number; changeEmployer?: number; continuing?: number; levels?: Record<WageLevel, number>; pay?: PayStats }` (place `all`, a region, or a metro; role `all` or a role id)
  - `CaCell = { role: string; place: string; lmias: number; positions: number; streams: Record<string, number> }`
  - `YearBlock<C> = { year: number; partial: boolean; through?: number; months?: number[]; total: C; cells: C[] } | { year: number; partial: boolean; through?: number; tooFew: true }`, as zod schemas `YearBlockUs` (cells `UsCell`) and `YearBlockCa` (cells `CaCell`)
  - `Trend = { from: number; to: number; period: "full" | "ytd"; through?: number; change: number }`, `TrendPair = { full: Trend | null; ytd: Trend | null }`
  - `Sponsorship = { lca?: YearBlock<UsCell>[]; perm?: YearBlock<UsCell>[]; lmia?: YearBlock<CaCell>[]; trends: { lca?: TrendPair; perm?: TrendPair; lmia?: TrendPair } }`
  - `IndexEntry = { id: string; name: string; also?: string[]; c: Country[]; h: number; p?: string }`
  - `EmployerFile = { id: string; name: string; also?: string[]; countries: Country[]; region?: string; sponsorship: Sponsorship }`
  - `CompanyFile = { profile: Profile; legalNames: string[]; sponsorship: Sponsorship }`
  - `ReverseFile = { country: Country; role: string; year: number; places: Record<string, { id: string; name: string; n: number }[]> }`
  - `Totals = Record<"lca" | "perm" | "lmia", Record<string, number>>`
  - `Report = { unprofiledTop: { id: string; name: string; headline: number }[]; proposals: { profile: string; id: string; name: string; headline: number }[] }`
  - `Meta = { schemaVersion: 1; builtAt: string; years: { lca: YearSelection; perm: YearSelection; lmia: YearSelection }; sources: Omit<SourceFile, "path">[]; totals: Totals; warnings: string[]; caveats: { lca: string; perm: string; lmia: string; general: string }; licences: { code: string; profiles: string; us: string; ca: string }; roles: Record<string, string>; places: Record<string, string> }`

- [ ] **Step 1: Write the failing tests**

```ts
const minimal = { id: "example.com", name: "Example", countries: ["US"], entities: {} };
expect(ProfileSchema.safeParse(minimal).success).toBe(true);
expect(ProfileSchema.safeParse({ ...minimal, extra: 1 }).success).toBe(false);
const fact = (en: string) => ({ value: { en }, kind: "official", sources: [{ url: "https://example.com/about", seen: "2026-11-14" }], checked: "2026-11-14" });
expect(ProfileSchema.safeParse({ ...minimal, mission: fact("x".repeat(280)) }).success).toBe(true);
expect(ProfileSchema.safeParse({ ...minimal, mission: fact("x".repeat(281)) }).success).toBe(false);
expect(ProfileSchema.safeParse({ ...minimal, mission: { ...fact("ok"), sources: [] } }).success).toBe(false);
expect(ProfileSchema.safeParse({ ...minimal, mission: { ...fact("ok"), sources: [{ url: "http://example.com", seen: "2026-11-14" }] } }).success).toBe(false);
expect(ProfileSchema.safeParse({ ...minimal, mission: { ...fact("ok"), checked: "2026-13-01" } }).success).toBe(false);
expect(ProfileSchema.safeParse({ ...minimal, entities: { usFeins: ["12-3456789"] } }).success).toBe(false);
expect(ProfileSchema.safeParse({ ...minimal, entities: { usFeins: ["123456789"] } }).success).toBe(true);
expect(YearBlockUs.safeParse({ year: 2025, partial: false, tooFew: true }).success).toBe(true);
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/pipeline/schema.test.ts` → FAIL.
- [ ] **Step 3: Implement the three files.**
- [ ] **Step 4: Run to see it pass.** Same command → PASS. Also `npm run typecheck` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): profile and published-file schemas"`

### Task 3: Spreadsheet row reader

**Files:**
- Create: `pipeline/load/rows.ts`
- Test: `tests/pipeline/rows.test.ts` (fixtures are generated with the exceljs writer into a temp directory inside the test)

**Interfaces:**
- Produces: `readRows(path: string, expected: string[], opts?: { sheet?: string; maxHeaderScan?: number }): AsyncIterable<Record<string, string>>` and `class HeaderMismatchError extends Error { file: string; missing: string[]; found: string[] }`.
- Behaviour: streams with exceljs's `stream.xlsx.WorkbookReader` (`.csv` files use a small RFC 4180 parser, no new dependency). The header row is the first row within `maxHeaderScan` (default 30) that contains every expected column after normalising both sides (trim, upper-case, collapse internal whitespace; underscores and spaces stay distinct). Yields objects with only the expected columns as keys; values are trimmed strings, `""` when empty, numbers as plain digits, dates as `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing tests**

```ts
it("finds the header below title rows and matches names ignoring case and stray spaces", async () => {
  // rows: ["Positive LMIA list"], ["Q2 2026"], [" case_status ", "JOB_TITLE", "EMPLOYER_POC_EMAIL"], ["Certified", "Engineer", "poc@example.com"]
  const rows = await collect(readRows(file, ["CASE_STATUS", "JOB_TITLE"]));
  expect(rows).toEqual([{ CASE_STATUS: "Certified", JOB_TITLE: "Engineer" }]);
});
it("never yields columns outside the expected list", ...);           // no EMPLOYER_POC_EMAIL key in any row
it("throws HeaderMismatchError naming the missing columns", ...);    // expected ["CASE_STATUS","SOC_CODE"] → missing ["SOC_CODE"]
it("formats dates as YYYY-MM-DD and numbers as plain digits", ...);  // Date(2026,2,31) → "2026-03-31"; 1000 → "1000"
it("reads CSV files the same way", ...);
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/pipeline/rows.test.ts` → FAIL.
- [ ] **Step 3: Implement `readRows` and `HeaderMismatchError`.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): streaming row reader with header detection"`

### Task 4: Names and IDs

**Files:**
- Create: `pipeline/normalize/names.ts`
- Test: `tests/pipeline/names.test.ts`

**Interfaces:**
- Produces: `normalizeName(raw: string): string`, `looksLikePersonName(raw: string): boolean`, `usEmployerId(fein: string | null, normName: string, state: string | null): string`, `caEmployerId(normName: string, province: string): string`, `companyIdFromUrl(urlOrHost: string): string`.
- Rules:
  - `normalizeName`: NFKD and strip accents; upper-case; `&` to ` AND `; delete `.`, `,`, `'`, `"`; other punctuation to space; collapse spaces; drop a leading `THE`; repeatedly drop trailing corporate tokens `INC INCORPORATED LLC L L C LTD LIMITED LTEE CORP CORPORATION CO COMPANY LP LLP PLLC PC PA GMBH SA ULC`.
  - `looksLikePersonName`: true when one of the last three tokens (dots removed) is `MD DDS DMD DO DPM OD DC DVM CPA ESQ PHD RN NP`; or when the raw name has no corporate token at all and is two or three alphabetic tokens, each a word or a single-letter initial.
  - IDs: `us-` plus the first 10 hex characters of sha256 of `fein:<fein>` when a FEIN exists, else of `name:<normName>|<state>`; `ca-` plus the first 10 hex of sha256 of `<normName>|<province>`.
  - `companyIdFromUrl`: lower-case host without `www.`, reduced to the registrable domain; two-label suffixes `co.kr or.kr ac.kr co.uk org.uk ac.uk com.au co.jp co.in com.br com.cn com.sg co.nz`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(normalizeName("Google LLC")).toBe("GOOGLE");
expect(normalizeName("GOOGLE, L.L.C.")).toBe("GOOGLE");
expect(normalizeName("The Boeing Company")).toBe("BOEING");
expect(normalizeName("Amazon.com Services LLC")).toBe("AMAZONCOM SERVICES");
expect(normalizeName("Société Générale Ltée")).toBe("SOCIETE GENERALE");
for (const n of ["JANE DOE MD PC", "John A. Smith", "Dr. Jane Doe, DDS", "KIM & LEE CPA LLP"]) expect(looksLikePersonName(n)).toBe(true);
for (const n of ["Palo Alto Networks, Inc.", "Amazon.com Services LLC", "Smith Dental Care PLLC", "Google LLC", "Do It Best Corp"]) expect(looksLikePersonName(n)).toBe(false);
expect(usEmployerId("123456789", "GOOGLE", "CA")).toBe(usEmployerId("123456789", "OTHER", "NY"));
expect(usEmployerId("123456789", "GOOGLE", "CA")).toMatch(/^us-[0-9a-f]{10}$/);
expect(usEmployerId(null, "ACME", "CA")).not.toBe(usEmployerId(null, "ACME", "NY"));
expect(caEmployerId("SHOPIFY", "ON")).toMatch(/^ca-[0-9a-f]{10}$/);
expect(companyIdFromUrl("https://about.gitlab.com/")).toBe("gitlab.com");
expect(companyIdFromUrl("aws.amazon.com")).toBe("amazon.com");
expect(companyIdFromUrl("https://www.toss.im")).toBe("toss.im");
expect(companyIdFromUrl("x.ai")).toBe("x.ai");
expect(companyIdFromUrl("https://www.samsung.co.kr/careers")).toBe("samsung.co.kr");
expect(companyIdFromUrl("HTTPS://WWW.Stripe.com")).toBe("stripe.com");
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): name normalisation, person-name test and IDs"`

### Task 5: Pay, dates and statuses

**Files:**
- Create: `pipeline/normalize/us.ts`
- Test: `tests/pipeline/us-normalize.test.ts`

**Interfaces:**
- Produces: `parseAmount(s: string): number | null`, `annualize(amount: number | null, unit: string): number | null`, `fiscalYearMonth(isoDate: string): { year: number; month: number }` (October is month 1), `lcaStatus(s: string): CaseStatus | null`, `permStatus(s: string): CaseStatus | null`, `wageLevel(s: string): WageLevel`. Units and statuses match case-insensitively.

- [ ] **Step 1: Write the failing tests**

```ts
expect(parseAmount("$120,000.00")).toBe(120000); expect(parseAmount("")).toBeNull();
expect(annualize(60, "Hour")).toBe(124800); expect(annualize(2000, "Week")).toBe(104000);
expect(annualize(2000, "Bi-Weekly")).toBe(52000); expect(annualize(10000, "Month")).toBe(120000);
expect(annualize(150000, "Year")).toBe(150000);
expect(annualize(1500, "Hour")).toBeNull(); expect(annualize(45, "Year")).toBeNull();
expect(annualize(2000000, "Year")).toBeNull(); expect(annualize(100, "Fortnight")).toBeNull();
expect(fiscalYearMonth("2025-10-01")).toEqual({ year: 2026, month: 1 });
expect(fiscalYearMonth("2026-03-15")).toEqual({ year: 2026, month: 6 });
expect(fiscalYearMonth("2026-09-30")).toEqual({ year: 2026, month: 12 });
expect(lcaStatus("Certified")).toBe("certified"); expect(lcaStatus("Certified-Withdrawn")).toBe("certified");
expect(lcaStatus("Denied")).toBe("denied"); expect(lcaStatus("Withdrawn")).toBe("withdrawn"); expect(lcaStatus("odd")).toBeNull();
expect(permStatus("Certified-Expired")).toBe("certified");
expect(wageLevel("II")).toBe("II"); expect(wageLevel("")).toBe("N/A");
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): pay, fiscal dates and status mapping"`

### Task 6: Places

**Files:**
- Create: `pipeline/normalize/places.ts`, `pipeline/cli/reference.ts`, generated `data/reference/us-counties-cbsa.csv`, `data/reference/ca-csd-cma.csv`
- Test: `tests/pipeline/places.test.ts` (small inline reference rows)

**Interfaces:**
- Consumes: manifest entries `cbsa` and `gaf` (Task 1).
- Produces:
  - `type UsCountyRow = { state: string; county: string; cbsa: string; title: string }` (metropolitan statistical areas only)
  - `type CaCsdRow = { province: string; csd: string; cma: string; title: string }` (census metropolitan areas only)
  - `createPlaceIndex(us: UsCountyRow[], ca: CaCsdRow[]): PlaceIndex`
  - `type PlaceIndex = { us(county: string | null, state: string | null): Place; ca(city: string | null, province: string | null): Place; label(key: string): string }`
  - `loadPlaceIndex(dir?: string): Promise<PlaceIndex>` (default `data/reference`)
  - `parseCaAddress(address: string): { city: string | null; province: string | null }`
- County matching normalises both sides: strip accents, upper-case, remove punctuation, `SAINT` to `ST`, drop trailing `COUNTY`, `PARISH`, `BOROUGH`, `CENSUS AREA`, `MUNICIPALITY`, `CITY AND BOROUGH`. City matching for Canada uses the same accent and case folding. Region labels are state and province names; metro labels are the reference titles.

- [ ] **Step 1: Write the failing tests**

```ts
const idx = createPlaceIndex(
  [{ state: "CA", county: "Santa Clara County", cbsa: "41940", title: "San Jose-Sunnyvale-Santa Clara, CA" },
   { state: "MO", county: "St. Louis County", cbsa: "41180", title: "St. Louis, MO-IL" }],
  [{ province: "ON", csd: "Toronto", cma: "535", title: "Toronto" }, { province: "ON", csd: "Mississauga", cma: "535", title: "Toronto" },
   { province: "QC", csd: "Montréal", cma: "462", title: "Montréal" }]);
expect(idx.us("Santa Clara County", "CA")).toEqual({ metro: "cbsa:41940", region: "US-CA" });
expect(idx.us("SANTA CLARA", "CA")).toEqual({ metro: "cbsa:41940", region: "US-CA" });
expect(idx.us("Saint Louis", "MO").metro).toBe("cbsa:41180");
expect(idx.us(null, "WA")).toEqual({ metro: null, region: "US-WA" });
expect(idx.us("Unknownia", "TX")).toEqual({ metro: null, region: "US-TX" });
expect(idx.us(null, null)).toEqual({ metro: null, region: "US" });
expect(idx.ca("Mississauga", "ON")).toEqual({ metro: "cma:535", region: "CA-ON" });
expect(idx.ca("Montreal", "QC").metro).toBe("cma:462");
expect(parseCaAddress("123 King St W, Toronto, ON M5V 1J2")).toEqual({ city: "Toronto", province: "ON" });
expect(parseCaAddress("Montréal, QC")).toEqual({ city: "Montréal", province: "QC" });
expect(parseCaAddress("")).toEqual({ city: null, province: null });
expect(idx.label("cbsa:41940")).toBe("San Jose-Sunnyvale-Santa Clara, CA");
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement `places.ts`.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Implement `npm run dataset:reference`**: reads the cached CBSA delineation XLSX (rows typed "Metropolitan Statistical Area") and the StatCan attribute file (CSDs that belong to a CMA; extract with `unzip` if zipped), writes both CSVs sorted by state or province, then name. Run it. Expected: it prints over 1,000 US county rows and over 500 Canadian CSD rows.
- [ ] **Step 6: Commit.** `git commit -m "feat(dataset): metro and region lookup with reference tables"`

### Task 7: Roles

**Files:**
- Create: `data/roles.yaml`, `pipeline/normalize/roles.ts`
- Test: `tests/pipeline/roles.test.ts`

**Interfaces:**
- Produces: `type RoleDef = { id: string; label: string; soc: string[]; titles: string[]; noc: string[] }`, `loadRoles(path?: string): RoleSet` (default `data/roles.yaml`), `type RoleSet = { us(title: string, soc: string): string; ca(noc: string): string; label(id: string): string; ids: string[] }`.
- US rule: normalise the title (lower-case, strip accents, non-alphanumerics to spaces, collapse); the first role in file order whose `soc` prefixes include the filing's SOC code and one of whose `titles` phrases appears on word boundaries wins; otherwise `soc-<first two digits>`; a missing SOC gives `soc-unknown`. Canada: the first role listing the 5-digit NOC code; otherwise `noc-<first digit>`; invalid gives `noc-unknown`. Fallback labels come from fixed maps in `roles.ts` (the 23 SOC major groups, the 10 NOC broad categories), formatted like `Computer and mathematical (other)`.
- `roles.yaml` lists these 31 categories in this order (specific before general): `data-engineer, ml-engineer, data-scientist, data-analyst, frontend-engineer, mobile-engineer, devops-sre, security-engineer, qa-engineer, embedded-engineer, engineering-manager, solutions-architect, sales-engineer, research-scientist, software-engineer, hardware-engineer, network-engineer, product-manager, program-manager, designer, business-analyst, financial-analyst, accountant, consultant, electrical-engineer, mechanical-engineer, civil-engineer, physician, nurse, professor, teacher`.

- [ ] **Step 1: Write the failing tests**

```ts
const r = loadRoles();
expect(r.us("Senior Software Engineer", "15-1252.00")).toBe("software-engineer");
expect(r.us("Data Engineer II", "15-1252")).toBe("data-engineer");
expect(r.us("Machine Learning Engineer", "15-1252")).toBe("ml-engineer");
expect(r.us("Data Scientist", "15-2051")).toBe("data-scientist");
expect(r.us("Product Manager", "11-2021")).toBe("product-manager");
expect(r.us("Registered Nurse", "29-1141")).toBe("nurse");
expect(r.us("Software Engineer", "29-1141")).toBe("soc-29");
expect(r.us("Anything", "")).toBe("soc-unknown");
expect(r.ca("21231")).toBe("software-engineer");
expect(r.ca("21211")).toBe("data-scientist");
expect(r.ca("63200")).toBe("noc-6");
expect(r.label("soc-15")).toBe("Computer and mathematical (other)");
expect(new Set(r.ids).size).toBe(31);
// every role id is kebab-case and has at least one soc prefix and one title phrase
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Write `roles.yaml` and implement `roles.ts`.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): role categories and classifier"`

### Task 8: US loaders

**Files:**
- Create: `pipeline/load/us.ts`
- Test: `tests/pipeline/us-load.test.ts`

**Interfaces:**
- Consumes: `readRows` (Task 3), `normalizeName`, `looksLikePersonName` (Task 4), Task 5 helpers, `PlaceIndex` (Task 6), `RoleSet` (Task 7), `EXPECTED_COLUMNS` (Task 1).
- Produces: `type LoadContext = { roles: RoleSet; places: PlaceIndex }`, `mapLcaRow(row: Record<string, string>, ctx: LoadContext): UsFiling | null`, `mapPermRow(row: Record<string, string>, ctx: LoadContext): UsFiling | null`, `loadUs(source: "lca" | "perm", path: string, ctx: LoadContext): { rows: AsyncIterable<UsFiling>; stats: LoadStats }`.
- Rules: null when the status is unknown, the decision date is missing, the LCA visa class is not H-1B, E-3 or H-1B1, or the employer looks like a person (counted in `skippedPerson`). FEIN keeps digits only and must be 9 digits, else null. LCA: `workers` = `TOTAL_WORKER_POSITIONS` (default 1); `newHires` = `NEW_EMPLOYMENT` + `NEW_CONCURRENT_EMPLOYMENT`; `changeEmployer` = `CHANGE_EMPLOYER`; `continuing` = `CONTINUED_EMPLOYMENT` + `CHANGE_PREVIOUS_EMPLOYMENT` + `AMENDED_PETITION` (blank counts as 0). PERM: no `lca` block; role from `JOB_TITLE` and `PWD_SOC_CODE`; pay from `JOB_OPP_WAGE_FROM` and `JOB_OPP_WAGE_PER`; place from `PRIMARY_WORKSITE_COUNTY` and `PRIMARY_WORKSITE_STATE`.

- [ ] **Step 1: Write the failing tests**

```ts
const f = mapLcaRow({ ...lcaRow, TOTAL_WORKER_POSITIONS: "3", NEW_EMPLOYMENT: "2", CHANGE_EMPLOYER: "1", CONTINUED_EMPLOYMENT: "0",
  WAGE_RATE_OF_PAY_FROM: "60", WAGE_UNIT_OF_PAY: "Hour", DECISION_DATE: "2026-03-15", EMPLOYER_FEIN: "12-3456789" }, ctx)!;
expect(f).toMatchObject({ program: "lca", year: 2026, month: 6, status: "certified", annualPay: 124800,
  employer: { fein: "123456789" }, lca: { workers: 3, newHires: 2, changeEmployer: 1, continuing: 0 } });
expect(mapLcaRow({ ...lcaRow, EMPLOYER_FEIN: "" }, ctx)!.employer.fein).toBeNull();
expect(mapLcaRow({ ...lcaRow, CASE_STATUS: "Withdrawn" }, ctx)!.status).toBe("withdrawn");
expect(mapLcaRow({ ...lcaRow, EMPLOYER_NAME: "JANE DOE MD PC" }, ctx)).toBeNull();
expect(mapPermRow(permRow, ctx)).toMatchObject({ program: "perm", status: "certified" });
expect(mapPermRow(permRow, ctx)!.lca).toBeUndefined();
it("never carries personal columns from the file into a filing", async () => {
  // generated LCA XLSX including EMPLOYER_POC_EMAIL "poc@example.com" and PREPARER_EMAIL "prep@example.com"
  expect(JSON.stringify(await collect(loadUs("lca", file, ctx).rows))).not.toContain("example.com");
});
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): LCA and PERM loaders"`

### Task 9: Canada loader

**Files:**
- Create: `pipeline/load/ca.ts`
- Test: `tests/pipeline/ca-load.test.ts`

**Interfaces:**
- Consumes: as Task 8, plus `parseCaAddress` (Task 6).
- Produces: `mapLmiaRow(row: Record<string, string>, ctx: LoadContext, period: { year: number; quarter: 1 | 2 | 3 | 4 }): CaApproval | null`, `loadCa(path: string, period, ctx): { rows: AsyncIterable<CaApproval>; stats: LoadStats }`, `lmiaPeriodFromName(name: string): { year: number; quarter: 1 | 2 | 3 | 4 } | null`.
- Rules: NOC is the first five digits in the occupation cell; province comes from the address, else from the province column (English and French names mapped to two-letter codes); the street line is discarded inside `mapLmiaRow`; rows with no employer, or with zero LMIAs and zero positions, return null (footnotes).

- [ ] **Step 1: Write the failing tests**

```ts
expect(mapLmiaRow(lmiaRow, ctx, { year: 2026, quarter: 2 })).toMatchObject({ year: 2026, quarter: 2, role: "software-engineer",
  employer: { name: "Shopify Inc.", province: "ON" }, place: { metro: "cma:505" }, lmias: 2, positions: 3 });
expect(mapLmiaRow({ ...lmiaRow, Occupation: "21231 - Software engineers and designers" }, ctx, p)!.role).toBe("software-engineer");
expect(mapLmiaRow({ "Province/Territory": "Note: positions include cancelled", Employer: "", Address: "", Occupation: "", "Program Stream": "", "Approved LMIAs": "", "Approved Positions": "" }, ctx, p)).toBeNull();
expect(mapLmiaRow({ ...lmiaRow, Address: "", "Province/Territory": "Québec" }, ctx, p)!.employer.province).toBe("QC");
expect(JSON.stringify(mapLmiaRow(lmiaRow, ctx, p))).not.toContain("King St");
expect(lmiaPeriodFromName("tfwp_2026q2_pos_en.xlsx")).toEqual({ year: 2026, quarter: 2 });
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): positive LMIA loader"`

### Task 10: Aggregation

**Files:**
- Create: `pipeline/aggregate/cells.ts`, `pipeline/aggregate/accumulate.ts`, `pipeline/aggregate/trend.ts`
- Test: `tests/pipeline/cells.test.ts`, `tests/pipeline/accumulate.test.ts`, `tests/pipeline/trend.test.ts`

**Interfaces:**
- Consumes: `UsFiling`, `CaApproval`, `YearSelection`, published types (Task 2).
- Produces:
  - `payStats(values: number[]): PayStats | undefined` (undefined below 3 values; linear interpolation between ranks; each figure rounded to the nearest 1,000)
  - `type RawCell = { role: string; metro: string | null; region: string; count: number }` (plus program-specific sums)
  - `rollUp<T extends RawCell>(cells: T[], merge: (a: T, b: T) => T, min?: number): T[]` (default `min` 3). Coarsening order: (role, metro) to (role, region) to (`all`, region); what is still under `min` appears only in the total. A null metro starts at (role, region).
  - `type YearPlans = { lca: YearSelection; perm: YearSelection; lmia: YearSelection }`
  - `type OwnerResult = { name: string; also: string[]; countries: Country[]; region: string | null; sponsorship: Sponsorship }`
  - `createAccumulator(): { addUs(owner: string, f: UsFiling): void; addCa(owner: string, a: CaApproval): void; finish(plan: YearPlans): { owners: Map<string, OwnerResult>; totals: Totals } }` (`totals`: certified filings per LCA and PERM year, approved LMIAs per Canadian year, across all owners, computed before any roll-up)
  - `trend(blocks: YearBlock<any>[], headline: (total: any) => number): TrendPair`
- Counting: `filings` counts certified filings; `denied` and `withdrawn` are separate counts; LCA sums (`workers`, `newHires`, `changeEmployer`, `continuing`) and `levels` cover certified filings only; pay values come from certified filings with non-null `annualPay`. Headlines: LCA `newHires + changeEmployer`; PERM `filings`; LMIA `positions`. `months` on the total holds the headline per fiscal month (US, 12 entries) or per quarter (Canada, 4 entries). An owner-year whose certified filings (US) or LMIAs (Canada) total under 3 becomes `{ year, partial, tooFew: true }`. Years outside the plan are ignored. Display name: the most frequent raw name, ties broken alphabetically; `also` holds the other raw names and trade names (at most 10, sorted).
- Trends: `full` compares the two latest complete years; `ytd` compares the partial year's first `through` months (or quarters) with the same months of the year before. Null when there is no earlier year, the earlier headline is 0, or either block is `tooFew`. `change` = (to − from) / from.

- [ ] **Step 1: Write the failing tests**

```ts
// cells.test.ts
expect(payStats([100000, 200000, 300000, 400000])).toEqual({ n: 4, p25: 175000, median: 250000, p75: 325000 });
expect(payStats([1, 2])).toBeUndefined();
expect(payStats([101400, 101500, 101600])!.median).toBe(102000);
const c = (role: string, metro: string | null, region: string, count: number) => ({ role, metro, region, count });
expect(rollUp([c("software-engineer", "cbsa:41940", "US-CA", 5), c("software-engineer", "cbsa:31080", "US-CA", 1), c("data-engineer", "cbsa:41940", "US-CA", 1)], add))
  .toEqual([c("software-engineer", "cbsa:41940", "US-CA", 5)]);
expect(rollUp([c("software-engineer", "cbsa:31080", "US-CA", 2), c("software-engineer", "cbsa:41940", "US-CA", 1)], add))
  .toEqual([c("software-engineer", null, "US-CA", 3)]);   // published with place "US-CA"

// accumulate.test.ts
// owner with 2 certified 2025 filings → its 2025 block is { year: 2025, partial: false, tooFew: true }
// owner filing as "GOOGLE LLC" x3 and "Google LLC" x1 → name "GOOGLE LLC", also ["Google LLC"]   (Review Focus 4)
// LCA total headline = newHires + changeEmployer; withdrawn filings add to withdrawn only, not filings
// a filing in a year outside the plan does not appear

// trend.test.ts
expect(trend([blk(2024, 100), blk(2025, 70)], h).full).toEqual({ from: 2024, to: 2025, period: "full", change: -0.3 });
expect(trend([blk(2025, 60, { months: Array(12).fill(5) }), blk(2026, 30, { partial: true, through: 3, months: [10, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0] })], h).ytd)
  .toEqual({ from: 2025, to: 2026, period: "ytd", through: 3, change: 1 });
expect(trend([tooFew(2024), blk(2025, 70)], h).full).toBeNull();
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): aggregation, small-cell roll-up and trends"`

### Task 11: Profiles, validation and contribution checks

**Files:**
- Create: `pipeline/profiles/load.ts`, `pipeline/profiles/validate.ts`, `pipeline/cli/validate.ts`, `data/companies/.gitkeep`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/request-company.yml`, `.github/CODEOWNERS` (`* @hjun-escape`), `.github/dependabot.yml` (npm and github-actions, weekly), `CONTRIBUTING.md`
- Test: `tests/pipeline/profiles.test.ts` with fixtures in `tests/pipeline/fixtures/companies/`

**Interfaces:**
- Consumes: `ProfileSchema` (Task 2), `companyIdFromUrl`, `normalizeName` (Task 4).
- Produces: `type Problem = { file: string; path: string; message: string }`, `validateProfiles(entries: { file: string; profile: unknown }[], today: Date): { profiles: Profile[]; problems: Problem[] }`, `loadProfiles(dir?: string, today?: Date): Promise<{ profiles: Profile[]; problems: Problem[] }>` (default `data/companies`, YAML files).
- Rules beyond the schema: `id` equals the file name stem and `companyIdFromUrl(id)`; every source of an official fact is on the company domain, a subdomain of it, or a host in `officialHosts`; reported facts may cite any host; no `checked` or `seen` date after today; no FEIN, normalised US name, or (normalised Canadian name, province) claimed by two profiles; a profile with `KR` in `countries` has a `ko` text in `mission` or `values`.

- [ ] **Step 1: Write the failing tests** (one per rule)

```ts
expect(messages("id-mismatch.yaml")).toContain("id must equal the file name");
expect(messages("official-from-reddit.yaml")).toContain("official fact cites a host outside the company");
expect(messages("reported-from-reddit.yaml")).toEqual([]);
expect(messages("future-date.yaml")).toContain("date is in the future");
expect(dupProblems).toEqual([expect.objectContaining({ message: expect.stringContaining("a.com.yaml") })]); // same FEIN in a.com and b.com
expect(messages("kr-without-ko.yaml")).toContain("Korean companies need a Korean summary");
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement load and validate, and the CLI** `npm run dataset:validate` (prints `file: path: message` per problem, exits 1 when any).
- [ ] **Step 4: Run to see it pass.** → PASS; `npm run dataset:validate` → exit 0 with an empty `data/companies`.
- [ ] **Step 5: Add the contribution files.** `ci.yml` runs on pull requests and pushes to `master`: checkout, setup-node 24 with npm cache, `npm ci`, `npm run typecheck`, `npm test`, `npm run dataset:validate`. `CONTRIBUTING.md` covers how to add or fix a profile, official versus reported facts, sources and dates on every fact, summaries of at most 280 characters in your own words, no copied pages, no personal data, links only for Glassdoor, Blind and Reddit. The pull request template asks for sources and those three confirmations. The issue form "Request a company" asks for the company name and website.
- [ ] **Step 6: Commit.** `git commit -m "feat(dataset): profile validation, CI and contribution guide"`

### Task 12: Matching and reports

**Files:**
- Create: `pipeline/match/entities.ts`, `pipeline/match/report.ts`, `pipeline/cli/find.ts`
- Test: `tests/pipeline/match.test.ts`

**Interfaces:**
- Consumes: `Profile`, `UsFiling`, `CaApproval`, `OwnerResult`, Task 4 IDs.
- Produces: `buildEntityMap(profiles: Profile[]): EntityMap`; `type EntityMap = { us(e: UsFiling["employer"]): string | undefined; ca(e: CaApproval["employer"]): string | undefined }` (US order: FEIN, then normalised legal name, then normalised trade name; Canada: normalised name and province); `ownerForUs(e, map): string` and `ownerForCa(e, map): string` (map hit, else `usEmployerId` / `caEmployerId`); `buildReport(owners: Map<string, OwnerResult>, profiles: Profile[]): Report` (`unprofiledTop`: 20 unprofiled owners with the highest latest-complete-year LCA headline; `proposals`: for each profile, up to 10 unprofiled owners whose normalised name starts with the profile's normalised name or an `otherNames` entry followed by a space, by headline).
- `npm run dataset:find -- "<text>"` scans the latest cached LCA and PERM files and prints distinct `EMPLOYER_NAME`, FEIN, state and certified count for names containing the normalised text. It prints no other column.

- [ ] **Step 1: Write the failing tests**

```ts
// FEIN beats name; legal-name hit without FEIN; trade-name hit; Canadian hit requires the province
expect(map.us({ fein: "123456789", name: "Unrelated LLC", tradeName: null, state: "CA" })).toBe("google.com");
expect(map.us({ fein: null, name: "Google LLC", tradeName: null, state: "CA" })).toBe("google.com");
expect(map.ca({ name: "Shopify Inc.", province: "BC" })).toBeUndefined();
expect(ownerForUs({ fein: null, name: "Acme LLC", tradeName: null, state: "CA" }, map)).toMatch(/^us-/);
expect(buildReport(owners, profiles).proposals).toContainEqual(expect.objectContaining({ profile: "google.com", name: "GOOGLE CLOUD SERVICES LLC" }));
expect(buildReport(owners, profiles).unprofiledTop.map((o) => o.id)).not.toContain("google.com");
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement, including the find CLI.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(dataset): exact entity matching and coverage report"`

### Task 13: Writers, licences and docs

**Files:**
- Create: `pipeline/publish/write.ts`, `pipeline/publish/copy.ts`, `site-static/index.html`, `DATA-LICENSE.md`
- Modify: `README.md` (new "Data" section)
- Test: `tests/pipeline/write.test.ts`

**Interfaces:**
- Consumes: `OwnerResult`, `Profile`, `YearPlans`, `SourceFile`, `Report`, `PlaceIndex.label`, `RoleSet.label`.
- Produces: `type SiteModel = { owners: Map<string, OwnerResult>; profiles: Map<string, Profile>; years: YearPlans; sources: SourceFile[]; report: Report; totals: Totals; warnings: string[]; roleLabels: Record<string, string>; placeLabels: Record<string, string>; builtAt: string }`, `type WrittenFile = { path: string; bytes: number; gzipBytes: number }`, `writeSite(outDir: string, model: SiteModel): Promise<WrittenFile[]>`, `summaryCsvs(model: SiteModel): Record<string, string>` (keys like `lca-2025.csv`).
- Layout under `outDir`: `index.html` (from `site-static`); `data/v1/meta.json`; `data/v1/index/<A..Z or 0>.json` (`IndexEntry[]` sorted by name; shard is the first character of `normalizeName(name)` when A to Z, else `0`); `data/v1/index/profiles.json`; `data/v1/companies/<domain>.json`; `data/v1/employers/<us|ca>/<characters 4 to 6 of the id>.json` (`Record<id, EmployerFile>`); `data/v1/reverse/<us|ca>/<role>.json` (top 50 per place for the latest complete year of LCA (US) or LMIA (Canada), sorted by headline then id); `data/v1/report.json`; `data/v1/schema/profile.json`.
- JSON is written with sorted keys and no indentation. Summary CSV columns `id,name,region,filings,headline`, rows for owners with at least 3 filings that year, sorted by id.
- Exact copy in `copy.ts` (also stored in `meta.caveats`):
  - lca: "A Labor Condition Application (LCA) is a step before an H-1B, H-1B1 or E-3 visa petition, not an approved visa. One LCA can cover several workers, and counts include renewals unless shown separately."
  - perm: "A certified PERM labour certification is one step toward a green card, not the green card itself."
  - lmia: "A positive LMIA is not a work permit. The list counts positions later cancelled by employers and leaves out businesses whose names include a person's name."
  - general: "These figures show past filings, not whether a company will sponsor you."
  - licences: code "MIT"; profiles "CC BY 4.0"; us "US government work, public domain"; ca "Contains information licensed under the Open Government Licence – Canada."

- [ ] **Step 1: Write the failing tests**

```ts
// model: profile google.com owning two employers' filings; one unprofiled employer with FEIN 987654321
expect(exists("data/v1/companies/google.com.json")).toBe(true);
expect(readJson(shardFor(unprofiledId))[unprofiledId].name).toBe("ACME ROBOTICS INC");
expect(readJson("data/v1/index/G.json")).toContainEqual(expect.objectContaining({ id: "google.com", p: "google.com" }));
expect(allOutputText()).not.toContain("987654321");
const first = await writeSite(a, model), second = await writeSite(b, model); // byte-identical trees
expect(readJson("data/v1/meta.json").caveats.general).toBe("These figures show past filings, not whether a company will sponsor you.");
expect(summaryCsvs(model)["lca-2025.csv"]).not.toContain("SMALL FIRM LLC"); // 2 filings
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement the writers and copy.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Write `DATA-LICENSE.md` and the README "Data" section**: what the dataset is; the base URL `https://hjun-escape.github.io/job-hunt-hq/data/v1/`; the file layout above; licences; the four caveats; how to request a company (the issue form); a pointer to `CONTRIBUTING.md`. `site-static/index.html` is a minimal page saying the same in a few lines with links.
- [ ] **Step 6: Commit.** `git commit -m "feat(dataset): static JSON writers, licences and data docs"`

### Task 14: Build command and safety checks

**Files:**
- Create: `pipeline/check/totals.ts`, `pipeline/check/sizes.ts`, `pipeline/build.ts`, `pipeline/cli/build.ts`
- Test: `tests/pipeline/totals.test.ts`, `tests/pipeline/sizes.test.ts`, `tests/pipeline/build.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `compareTotals(prev: Totals | null, next: Totals, plan: YearPlans): string[]` (a complete year present in both that moves more than 2% is a problem; a partial year that decreases is a problem; `prev` null gives none)
  - `compareWithPublished(next: Totals, published: Partial<Totals>): string[]` (more than 2% apart gives a warning line; `PUBLISHED_TOTALS` lives in `sources.ts`, filled by hand from the government's published statistics when available)
  - `checkSizes(files: WrittenFile[]): string[]` (raw over 50 MB; index shard over 2 MB gzipped; reverse file over 1 MB gzipped)
  - `runBuild(opts: { cacheDir: string; outDir: string; dataDir?: string; liveMetaUrl?: string; today: Date }): Promise<{ ok: boolean; problems: string[]; warnings: string[]; files: WrittenFile[] }>`
- Flow of `runBuild`: read the manifest; `selectYears` per source; load places, roles and profiles (profile problems are fatal); build the entity map; stream every file into the accumulator through `ownerForUs` / `ownerForCa` (a `HeaderMismatchError` becomes a problem naming the file and missing columns, and stops the build); finish, which gives the owners and `totals`; build the report; write the site; check sizes; fetch the previous `meta.json` from `liveMetaUrl` (404 means first build); compare totals; only when everything passes, write the summary CSVs into `<dataDir>/summary/`. The CLI `npm run dataset:build -- --out site [--live <url>]` writes `build-problems.md` and exits 1 when not ok.

- [ ] **Step 1: Write the failing tests**

```ts
expect(compareTotals({ lca: { "2025": 1000 }, perm: {}, lmia: {} }, { lca: { "2025": 1025 }, perm: {}, lmia: {} }, plan)).toHaveLength(1);
expect(compareTotals({ lca: { "2025": 1000 }, perm: {}, lmia: {} }, { lca: { "2025": 1010 }, perm: {}, lmia: {} }, plan)).toEqual([]);
expect(compareTotals({ lca: { "2026": 500 }, perm: {}, lmia: {} }, { lca: { "2026": 490 }, perm: {}, lmia: {} }, planPartial2026)).toHaveLength(1);
expect(compareTotals(null, next, plan)).toEqual([]);
expect(checkSizes([{ path: "data/v1/index/A.json", bytes: 9e6, gzipBytes: 3e6 }])).toHaveLength(1);
it("builds end to end from small generated files", async () => {
  // temp cache: LCA (with POC and preparer emails, a person-named employer, an employer with 2 filings,
  // Google under two entities), PERM, LMIA, manifest; temp data dir with google.com.yaml and reference CSVs
  const r = await runBuild({ cacheDir, outDir, dataDir, today: new Date("2026-11-14") });
  expect(r.ok).toBe(true);
  expect(readJson(outDir, "data/v1/companies/google.com.json").legalNames).toHaveLength(2);
  expect(allText(outDir)).not.toMatch(/example\.com|JANE DOE/);
  expect(blockFor(outDir, "SMALL FIRM LLC", 2025)).toEqual(expect.objectContaining({ tooFew: true }));
});
it("fails without writing summaries when a column is renamed", async () => {
  // LMIA fixture with "Approved Positions" renamed
  expect(r.ok).toBe(false); expect(r.problems.join()).toContain("Approved Positions");
  expect(existsSync(join(dataDir, "summary"))).toBe(false);
});
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Run a real local build** with the files from Task 1: `npm run dataset:build -- --out site`. Expected: exit 0; `site/data/v1/meta.json` lists the selected years; `checkSizes` passes; print the elapsed time.
- [ ] **Step 6: Commit.** `git commit -m "feat(dataset): build command with totals and size checks"`

### Task 15: Build-and-deploy workflow and runbook

**Files:**
- Create: `.github/workflows/dataset-build.yml`, `docs/dataset/RUNBOOK.md`
- Delete: `.github/workflows/dataset-download-check.yml`

**Interfaces:**
- Consumes: the `dataset:download` and `dataset:build` scripts.
- Produces: a weekly deployment at `https://hjun-escape.github.io/job-hunt-hq/`.

- [ ] **Step 1: Write the workflow.** Triggers: `schedule: "0 9 * * 1"` and `workflow_dispatch`; `concurrency: dataset-build` (no cancel). Job `build` (permissions `contents: write`, `issues: write`): checkout; setup-node 24 with npm cache; `npm ci`; `actions/cache` for `.cache/dataset`, key `dataset-${{ hashFiles('pipeline/sources.ts') }}-${{ github.run_id }}`, restore keys `dataset-${{ hashFiles('pipeline/sources.ts') }}-` and `dataset-`; `npm run dataset:download` (with `--from-release` when `DOL_DOWNLOAD_MODE` is `release`); `npm run dataset:build -- --out site --live https://hjun-escape.github.io/job-hunt-hq/data/v1/meta.json`; upload `site` with the Pages artifact action; commit `data/summary` when changed as the github-actions bot with message `data: refresh sponsorship summaries`; on failure, create or update the one open issue labelled `dataset-build` with `build-problems.md` as its body. Job `deploy` (needs `build`; permissions `pages: write`, `id-token: write`; environment `github-pages`): the deploy-pages action. Use each action's current major version.
- [ ] **Step 2: Write `docs/dataset/RUNBOOK.md`**: each workflow (what it does, when it runs, what its issue means, how to re-run it); the release fallback; adding a new source year (nothing to do: `selectYears` rolls the window); local commands; the weekly time budget from the spec; the build time measured in Step 4.
- [ ] **Step 3: Needs the user (repository setting).** Enable Pages with GitHub Actions as the source: `gh api -X POST repos/hjun-escape/job-hunt-hq/pages -f build_type=workflow`.
- [ ] **Step 4: Needs the user (merge and run).** Merge to `master`, run the workflow by hand. Expected: deploy succeeds; `curl -s https://hjun-escape.github.io/job-hunt-hq/data/v1/meta.json` shows `"schemaVersion":1`; the build job takes under 30 minutes. Run it again. Expected: no problems from `compareTotals`, and no new summary commit.
- [ ] **Step 5: Failure drill.** On a branch, rename one expected LMIA column in `sources.ts` and run the workflow by dispatch. Expected: the build fails, an issue labelled `dataset-build` appears, and the live `meta.json` keeps its old `builtAt`. Delete the branch and close the issue.
- [ ] **Step 6: Commit.** `git commit -m "ci(dataset): weekly build and Pages deploy, runbook"`

### Task 16: Seed profiles

**Files:**
- Create: `data/seed.yaml`, `data/companies/<id>.yaml` for each seed

**Interfaces:**
- Consumes: `npm run dataset:find` (Task 12), `npm run dataset:validate` (Task 11), `npm run dataset:build` (Task 14).
- Seed list (`data/seed.yaml`, in this order): `google.com, amazon.com, microsoft.com, meta.com, apple.com, nvidia.com, stripe.com, databricks.com, openai.com, anthropic.com, shopify.com, cohere.com, hootsuite.com, toss.im, daangn.com`.
- Format coverage the seed must show: several US legal entities in one profile (`amazon.com`); a Canadian Global Talent Stream employer (`shopify.com` or `cohere.com`, confirmed with `dataset:find` on the LMIA data); Korean companies with 인재상 and Korean summaries (`toss.im`, `daangn.com`); an official application rule (`google.com`: up to three applications in a rolling 30-day window, source `https://support.google.com/googlecareers/answer/6095391`); reported waiting periods with at least two sources (`google.com`).
- Every fact is written from public sources only; nothing comes from any private tracker.

- [ ] **Step 1: For each company,** find its legal entities and FEINs with `npm run dataset:find -- "<name>"`, then write the profile: identity, entities, basics, mission, values or 인재상, official application rules and hiring process from the company's own pages, reported facts with their sources, and links.
- [ ] **Step 2: Validate.** `npm run dataset:validate` → exit 0.
- [ ] **Step 3: Build locally.** `npm run dataset:build -- --out site`. Expected: a company file for each seed; each US sponsor (`google.com` through `anthropic.com` in the list) shows a latest-complete-year LCA headline above 0; review `report.json` proposals and add any genuine entities, then build again.
- [ ] **Step 4: Commit.** `git commit -m "data: seed company profiles"`

### Task 17: Weekly source re-check

**Files:**
- Create: `pipeline/check/text.ts`, `pipeline/check/recheck.ts`, `pipeline/cli/recheck.ts`, `data/fingerprints.json` (`{}`), `.github/workflows/dataset-recheck.yml`
- Test: `tests/pipeline/recheck.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Report`, `politeFetch`, `isAllowedByRobots`.
- Produces: `extractText(html: string): string` (drops `script`, `style`, `noscript`, `nav`, `header`, `footer`, `svg`; strips tags; decodes common entities; collapses whitespace); `fingerprint(text: string): string` (sha256 hex); `MIN_TEXT = 200`; `type FingerprintStore = Record<string, { hash: string; status: number; checked: string }>` (`hash` is `"manual"` for pages without usable text); `type Flag = { company: string; url: string; kind: "changed" | "gone" | "moved" | "manual" | "old"; facts: string[] }`; `recheck(profiles: Profile[], store: FingerprintStore, fetcher: (url: string) => Promise<{ status: number; finalUrl: string; body: string }>, today: Date): Promise<{ store: FingerprintStore; flags: Flag[] }>`; `issueBody(flags: Flag[], report: Report | null): string`.
- Rules: only official facts' source URLs are fetched; a URL seen for the first time is stored without a flag; text shorter than `MIN_TEXT`, or a path robots.txt disallows, is stored as `manual` and flagged once; status 404 or 410 flags `gone`; a final URL with a different path flags `moved`; a different hash flags `changed`; any fact whose `checked` date is more than 365 days before today flags `old`. `facts` lists fact paths such as `mission` or `applicationRules[0]`.
- Issue body headings, in order: "Changed sources", "Moved or gone", "Needs a manual check", "Not re-confirmed in 12 months", "Largest sponsors without a profile", "Possible matches to add". Grouped by company with links; an empty section says "None this week."

- [ ] **Step 1: Write the failing tests**

```ts
expect(extractText("<nav>Menu</nav><p>Our   mission</p><script>x()</script>")).toBe("Our mission");
// first sight: stored, no flags
// same URL, different text: one "changed" flag whose facts list both fact paths citing the URL
// 404: "gone"; short page: "manual" on the first run only
// reported fact checked 2025-11-13 with today 2026-11-14: "old"
expect(issueBody([], null)).toContain("Changed sources\n\nNone this week.");
```

- [ ] **Step 2: Run to see it fail.** → FAIL.
- [ ] **Step 3: Implement, including the CLI** `npm run dataset:recheck -- --issue-body recheck.md [--report <url>]` (reads and writes `data/fingerprints.json`; fetches the live `report.json` for the last two sections).
- [ ] **Step 4: Run to see it pass.** → PASS.
- [ ] **Step 5: Write the workflow:** `schedule: "0 10 * * 1"` and `workflow_dispatch`; permissions `contents: write`, `issues: write`; run the CLI; commit `data/fingerprints.json` when changed with message `data: update source fingerprints`; create or update the one open issue labelled `dataset-weekly` with `recheck.md`.
- [ ] **Step 6: Verify locally against the seed profiles.** Run the CLI twice. Expected: the first run stores fingerprints and flags only `manual` pages; the second run flags nothing.
- [ ] **Step 7: Commit.** `git commit -m "feat(dataset): weekly source re-check and issue"`
