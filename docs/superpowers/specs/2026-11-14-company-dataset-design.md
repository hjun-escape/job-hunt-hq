# Company dataset: design

Status: draft for review, 2026-11-14. First of four connected pieces: (1) this dataset, (2) a public lookup page, (3) a Claude skill, (4) a "Looked up" panel in the tracker. Pieces 2 to 4 get their own designs; this document fixes only what they need from the dataset.

## Intent

Job seekers, above all people who need a visa sponsored, make expensive decisions on thin information: which companies actually sponsor, for which roles, at what level and pay, and what each company says it looks for. The facts exist, but they are scattered across large government files, company careers pages and forum threads, and every copy someone makes goes stale.

This dataset is one free, public, dated source of those facts, kept in this repository and refreshed mostly by machines. It is the product; the page, the skill and the tracker are ways of reading it. The repository is public and the goal is wide use (and GitHub stars), so the first experience for a stranger matters more than any one maintainer's workflow.

Audience, in order: international candidates who need sponsorship in the US or Canada; applicants to Korean companies; anyone researching a company before applying.

## Goals

- Answer "does this company sponsor, for what roles, where, at what level and pay, and is it rising or falling?" for almost any US or Canadian employer that has filed, with the evidence one click away.
- Answer the reverse: "who sponsors this kind of role in this place?"
- For profiled companies, also give what the company publishes about itself (mission, values, 인재상, official application rules, hiring process) and what candidates report about unofficial rules (waiting periods after a rejection), each clearly labelled.
- Every fact carries its source and the date it was checked, so its age is always visible.
- Stay fresh with little human work: machines refresh government data and detect when a company's source page changes; humans only review what changed.
- Be easy to contribute to and safe to merge: one file per profiled company, validated automatically.
- Be reusable: served as static JSON with stable URLs, under clear licences.

## Non-goals

- Job openings. They change daily and come live from each company's job board; that is the sweep skill's job, not stored here.
- User accounts, servers, databases, analytics.
- Korean visa sponsorship data. No public source was found; Korean companies get profiles only.
- Content from Glassdoor, Blind, Reddit or similar beyond a link to the thread. Their terms forbid scraping and the text is not ours to republish.
- Immigration or legal advice.

## Anti-goals (failure even if it technically works)

- Publishing anything personal. The US files name employer contacts, lawyers and form preparers, with emails. None of it may leave the pipeline.
- Turning evidence into promises. The data shows what an employer filed, never "this company will sponsor you".
- Facts that look current but are not. Nothing is shown without its checked date.
- Leaking any maintainer's private tracker data (notes, contacts, referrals, application history) into the public repo.
- A repository that bloats with generated data until cloning it is painful.

## Constraints

- Hosting: GitHub only. GitHub Actions and GitHub Pages are free for public repositories. GitHub refuses files over 100 MB and warns over 50 MB; repositories should stay well under 1 GB; a Pages site is limited to 1 GB with a soft 100 GB/month bandwidth limit.
- The existing repo is TypeScript, built with esbuild, tested test-first with Vitest. New code follows the same discipline: counting and matching rules are written as tests first, against small fixture files.
- Licences: US Department of Labor data is a US government work (public domain). Canada's list is under the Open Government Licence - Canada, which requires an attribution statement. Written profile content is our own. Code stays MIT.
- Copyright: profiles store short summaries in our own words plus links, never copied pages. Short names of things (a value's label such as "Customer obsession") may be quoted.
- Be a polite client: respect robots.txt, rate-limit, and use a standard client user agent, never one carrying a personal name or email.
- Downloads may be refused. dol.gov's front end has been seen answering 403 to unusual automated clients. The first task of the plan is to confirm that a scheduled GitHub job can download the US files. If it cannot, the fallback is a maintainer-run download script (about 10 minutes a quarter) that uploads the files to a GitHub Release; the build reads them from there, and the weekly job opens a reminder issue when a new quarter is posted.

## Approaches considered

1. **Claude only (rejected).** A plugin skill downloads the government files on each user's machine, matches names locally and writes into that user's tracker. Reach is limited to Claude Code users, every first run downloads hundreds of MB, and every user repeats the hardest work (matching legal names to companies).
2. **Shared dataset in this repo, read by a page, a skill and the tracker (chosen).** Machines build compact tables once per quarter; matching is done once for everyone and corrected by pull request; anyone with a browser can use the page. Cost: the dataset becomes something people depend on, so bad matches will be reported (welcome, for a project that wants contributors).
3. **Hosted web app with a server and accounts (rejected).** Most features, but server costs, a duty to protect user data, and upkeep a solo maintainer cannot carry.

The maintainer chose 2, and asked for all of the following to be included: sponsorship broken down by role, place, level, pay and trend; green card filings; reverse search; inline caveats; two formats for two kinds of data; change-driven re-checks; demand-driven coverage; the website domain as company ID; raw files never committed; small index first, details on demand; automatic validation; a data licence.

## What the dataset holds

Two tiers.

**Tier 1: every employer in the government files (generated, never hand-edited).** Sponsorship evidence for tens of thousands of US and Canadian employers, rebuilt every quarter. An employer appears here whether or not anyone has written a profile for it.

**Tier 2: profiled companies (hand-reviewed, one file each).** A seed set of about 15 at launch, growing toward 100 and beyond by demand. A profile links a company (by its website domain) to its legal entities in tier 1 and adds what the company publishes and what candidates report.

### Sponsorship evidence (tier 1)

**United States, from the Department of Labor's Office of Foreign Labor Certification, published quarterly** (performance data page: https://www.dol.gov/agencies/eta/foreign-labor/performance).

- LCA file (H-1B, H-1B1, E-3; form ETA-9035). Fields used, as named in the FY2026 record layout: `CASE_STATUS` (Certified, Certified-Withdrawn, Denied, Withdrawn), `DECISION_DATE`, `VISA_CLASS`, `JOB_TITLE`, `SOC_CODE`, `SOC_TITLE`, `FULL_TIME_POSITION`, `TOTAL_WORKER_POSITIONS`, `NEW_EMPLOYMENT`, `CONTINUED_EMPLOYMENT`, `CHANGE_PREVIOUS_EMPLOYMENT`, `NEW_CONCURRENT_EMPLOYMENT`, `CHANGE_EMPLOYER`, `AMENDED_PETITION`, `EMPLOYER_NAME`, `TRADE_NAME_DBA`, `EMPLOYER_CITY`, `EMPLOYER_STATE`, `EMPLOYER_FEIN`, `NAICS_CODE`, `WORKSITE_CITY`, `WORKSITE_STATE`, `WORKSITE_POSTAL_CODE`, `WAGE_RATE_OF_PAY_FROM`, `WAGE_RATE_OF_PAY_TO`, `WAGE_UNIT_OF_PAY`, `PREVAILING_WAGE`, `PW_UNIT_OF_PAY`, `PW_WAGE_LEVEL` (I to IV, or N/A).
- PERM file (green card labour certification; form ETA-9089, new form since June 2023). Fields used: `CASE_STATUS` (Certified, Certified-Expired, Denied, Withdrawn), `DECISION_DATE`, `EMP_BUSINESS_NAME`, `EMP_TRADE_NAME`, `EMP_FEIN`, `EMP_NAICS`, `EMP_NUM_PAYROLL`, `JOB_TITLE`, `PWD_SOC_CODE`, `PWD_SOC_TITLE`, `JOB_OPP_WAGE_FROM`, `JOB_OPP_WAGE_TO`, `JOB_OPP_WAGE_PER`, `PRIMARY_WORKSITE_CITY`, `PRIMARY_WORKSITE_STATE`, `PRIMARY_WORKSITE_POSTAL_CODE`.
- Never read past the loader: every `EMPLOYER_POC_*`, `EMP_POC_*`, `AGENT_ATTORNEY_*`, `ATTY_AG_*`, `LAWFIRM_*`, `PREPARER_*` field, phone numbers and street address lines. The loader selects allowed columns by name; anything else is dropped before any processing. Worksite postal codes are kept only to place a worksite in a metro area and are never published.

**Canada, from Employment and Social Development Canada:** the Temporary Foreign Worker Program Positive LMIA Employers List on open.canada.ca (dataset 90fed587-1364-4f33-a9ee-208181dc0b97), quarterly, XLSX since 2020Q4 (CSV before), latest posted 2026Q2. Files are broken down by program stream, occupation (NOC 2021) and business location, with counts of approved LMIAs and positions. Exact column headers must be confirmed from the current file before writing the loader. The business location is an address; the loader takes only its city and postal code (to place the employer in a metro area) and never keeps the street line. Program streams include the Global Talent Stream, the one most relevant to tech roles; it is shown separately.

**Coverage in time:** the three most recent complete fiscal years plus the current year to date (US fiscal years run October to September; Canada uses calendar quarters). Older years can be added later.

**Counting rules** (each becomes a test):

- A "certified filing" is an LCA with status Certified or Certified-Withdrawn. Denied and Withdrawn are counted separately and shown as such.
- Workers are counted from `TOTAL_WORKER_POSITIONS`, and split into new hires (`NEW_EMPLOYMENT`), people changing employer (`CHANGE_EMPLOYER`), and continuing staff (`CONTINUED_EMPLOYMENT` + `CHANGE_PREVIOUS_EMPLOYMENT` + `AMENDED_PETITION`; `NEW_CONCURRENT_EMPLOYMENT` counted with new hires). The page's headline uses new hires plus changes of employer, because that is what a candidate cares about; renewals are shown but not headlined.
- Pay is annualised from `WAGE_RATE_OF_PAY_FROM` and `WAGE_UNIT_OF_PAY` (Hour x 2080, Week x 52, Bi-Weekly x 26, Month x 12, Year x 1). Reported as median and interquartile range per breakdown cell. Obvious unit errors (for example an hourly rate above 1,000) are excluded from pay statistics but still counted as filings.
- Place is the first worksite, published at two levels: metro area and state or province. US metro areas are Census core-based statistical areas, found from the worksite postal code (falling back to normalised city and state); Canadian ones are census metropolitan areas, found from city and postal code. Raw city text is never a grouping key (it is free text with many spellings), and a worksite outside any metro area counts under its state or province only. Additional worksites (a separate appendix file) are out of scope for v1.
- Role is a category from a maintained list of about 30 at launch (for example Software engineer, Data engineer, Data scientist, Machine learning engineer, Product manager, Designer). Occupation codes alone cannot answer "data engineer" (the US files it under several codes), and raw job titles have thousands of variants, so each US filing is assigned by tested keyword rules on `JOB_TITLE`, limited to plausible occupation codes, falling back to its occupation code's group when no rule matches. Canada has no job titles, so Canadian rows are assigned by NOC 2021 code through a mapping table onto the same categories. Categories, rules and the mapping live in the repo and are reviewed like profiles; new categories are additive.
- Level is `PW_WAGE_LEVEL`; N/A is its own bucket ("level not stated").
- PERM: a "green card filing" is status Certified or Certified-Expired, counted per employer, occupation, place and year, with offered pay annualised the same way.
- Canada: approved positions and approved LMIAs per employer, program stream, occupation, province and year. The list counts positions later cancelled and excludes businesses whose names contain personal names; both caveats are shown.
- Small cells: a breakdown cell with fewer than 3 filings is merged into the next coarser level (role into all roles, metro area into state or province) until it reaches 3. An employer with fewer than 3 filings in total shows only "fewer than 3 filings", with no breakdown and no pay. A role, a place and a count of 1 can otherwise point at one person's visa status.
- US employers named after a person (for example a professional corporation in an individual's name) are left out of tier 1, matching what Canada already does at source. The detection rule is tested against examples; such an employer can still appear if someone writes a profile for it.
- Trends compare the same period year over year (full years, or year-to-date against the same months last year), never a partial year against a full one.

**Caveats shown next to the numbers** (stored as text in the dataset so every consumer shows the same words): an LCA is a step before a visa petition, not an approved visa; one LCA can cover several workers; filings include renewals unless split out; a positive LMIA is not a work permit; the Canadian list omits some employers; the data shows past filings, not intent.

### Profiles (tier 2)

One file per company, keyed by its website domain. Contents:

- **Identity:** display name, domain, other names, countries it hires in, a Wikidata ID where one exists, an OpenDART corporate code for listed Korean companies.
- **Legal entities:** the US FEINs and legal names, and the Canadian legal names (with province), that roll up to this company. This is how tier 1 rows are matched to a profile. Large companies file under several entities (for example a parent, a cloud subsidiary and a services subsidiary); all belong here.
- **Basics:** industry, size, headquarters, from Wikidata (CC0) or the company's own site, each with source and date. Size may also come from `EMP_NUM_PAYROLL` in PERM filings.
- **What the company publishes**, each an "official" fact with a source link and checked date:
  - mission and vision: a short summary in our own words (about 280 characters at most);
  - values or 인재상: the short value names plus a one-line summary;
  - official application rules (for example a cap on applications per rolling 30 days);
  - published hiring or interview process.
- **What candidates report**, each a "reported" fact: waiting period after a rejection (by stage: resume, phone screen, onsite), informal application limits. Each lists every source it rests on (link plus date seen), and the number of independent sources is shown. A reported fact never displays as if it were official.
- **Links out:** Glassdoor, Blind, Reddit or similar pages, as links only.

Languages: summaries in English; Korean companies also carry a Korean summary, and values or 인재상 are kept in their original language with an English gloss.

Every fact has the same shape: value, kind (official or reported), sources, checked date, and, for official facts, a fingerprint of the source page's text at the time it was checked (see Freshness).

## Identity and matching

- A profiled company's ID is its website domain, lower-cased without `www.` (for example `stripe.com`). Domains are unique worldwide, so two companies with the same name cannot collide, and they match the tracker's existing `website` field directly.
- A tier 1 employer without a profile gets a short, stable ID computed without any secret (US: a short hash of the FEIN; Canada: of the normalised legal name and province), so every fork and every rebuild produces the same IDs and URLs. This keeps URLs short; it does not hide the FEIN, which the government file already publishes and a 9-digit number cannot be hidden by hashing anyway. The page and the published files simply do not show FEINs of unprofiled employers.
- FEINs listed in profile files are those of established employers, already public in the federal files, and are needed to make matching exact.
- Matching order: FEIN (US), then exact normalised legal name, then normalised trade name. Fuzzy matches are never applied automatically; the pipeline proposes them in a report for a human to accept by adding them to a profile.
- Canada has no tax ID in its list, so Canadian matching is by normalised name and province only, and therefore always confirmed in a profile.

## Freshness

- **Government data:** a scheduled GitHub Actions job checks weekly whether a new quarterly file has been posted; when one has, it rebuilds tier 1 and publishes. Each published file records which source files (with their dates and checksums) it was built from.
- **Official profile facts, refreshed by change:** a weekly job re-fetches each official source page, extracts its readable text, normalises it and compares a fingerprint with the stored one. Only facts whose page changed, moved or disappeared are flagged, in a single weekly GitHub issue listing them. Pages that render no usable text without a browser (some careers sites are pure JavaScript) are marked "manual check" instead of producing false alarms.
- **Backstop:** any fact not re-confirmed in 12 months is flagged even if its page looks unchanged.
- **Reported facts** do not expire automatically; their age and source count are always shown, and new reports are added by pull request.

## Coverage grows with demand

- The lookup page offers "Request a profile for this company", which opens a pre-filled GitHub issue (no account data is collected by the page itself).
- The weekly job also lists the largest tier 1 sponsors that have no profile, and the largest unmatched legal names, so contributors know where effort pays off.
- Launch is tier 1 complete (every employer, with reverse search) plus a seed set of about 15 profiles that exercise every part of the profile format end to end. Tier 1 and reverse search are the headline and do not wait for profiles. Profiles then grow toward about 100 as the Claude skill (piece 3) drafts them for review, starting with the largest sponsors in tech roles and Korean companies commonly applied to from abroad. The seed list is a reviewable file. The maintainer chose to draw the seed set from companies they have already researched, picked so that together they exercise every part of the format: a large US sponsor filing under several legal entities, a Canadian Global Talent Stream employer, a Korean company with a published 인재상, a company with an official application rule, and one with reported waiting periods. Seed profiles are written from public sources only; nothing is copied from the maintainer's private tracker (notes, contacts, referrals or application history).

## How it is published

Two formats for two kinds of data:

- **Hand-written profiles** live in the repository as one human-friendly file per company under `data/companies/`, so every change is a small, reviewable diff.
- **Generated tables are not committed in full.** The build downloads the government files (cached between runs, never committed), produces the tables and deploys them to GitHub Pages directly from the build. A small per-employer yearly summary is committed so quarter-to-quarter changes are visible in the history; its growth must stay under about 50 MB a year.

Published layout on GitHub Pages, versioned so outside users do not break:

- `data/v1/meta.json`: schema version, build date, source files used, licences and attribution text, the shared caveat texts.
- `data/v1/index`: the search list, every employer and profiled company with its display name, other names, countries and headline counts. It must load in about 2 MB compressed or less, split into pieces if needed.
- `data/v1/companies/<id>`: one profiled company with its full sponsorship breakdown.
- `data/v1/employers/...`: sponsorship breakdown for unprofiled employers, grouped so one lookup loads one small file.
- `data/v1/reverse/...`: precomputed top sponsors per occupation and place, so "who sponsors data engineers in Toronto" loads in under about 1 MB.

The same files are the public "API": documented in the README with the licences, so others can build on them.

## Validation and contributions

- A schema defines profile files and every published file. CI rejects a profile with a missing source link or checked date, an unknown field, a reported fact presented as official, a summary over the length limit, or a domain ID that does not match its file name.
- CI runs the counting-rule tests on every change to the pipeline.
- CONTRIBUTING explains how to add or fix a profile, and the pull request template asks for sources.
- A future Claude skill can draft a profile from a company's official pages and open the pull request; the schema and CI are what make such drafts safe to review.

## Maintenance

The dataset is kept by one maintainer with little spare time, so it must keep working when nobody touches it, fail loudly rather than quietly, and keep the recurring human work small.

**Budget:** at 100 profiles, under an hour a week of human work (reviewing the weekly issue and incoming pull requests), and nothing scheduled by hand at quarter end (unless the download fallback under Constraints is in use: about 10 minutes a quarter). If the weekly issue regularly needs more than that, coverage growth pauses until automation catches up.

**Government files change format; the pipeline must notice.**
- Each source has an expected-columns list per fiscal year. A new file whose headers do not match fails the build with a clear message naming the missing or renamed columns, and opens an issue. It never produces silently empty or partial counts.
- Every build checks its totals against the previous build (for example, total certified filings for a completed year must not move by more than a small tolerance) and, where the government publishes its own summary statistics for the same period, against those.
- A failed or suspicious build never replaces the live data. The last good build stays published, and `meta.json` says how old it is.

**Human review is driven by change, and can be handed to automation.**
- The weekly issue groups flags by company and links each changed source, so one review covers one company.
- The Claude skill (piece 3) is designed to take a flagged fact, re-read the source and open a pull request with an updated summary, so the maintainer's job becomes approving a diff rather than doing research.
- Flags that stay unreviewed are not lost: they remain listed, and the page shows those facts with their real (old) checked date.

**One definition of the data, used everywhere.** The schema is written once and the TypeScript types for the page, the skill and the tracker are generated from it, so the consumers cannot drift apart. Changes inside `v1` are additive only; a breaking change publishes `v2` alongside `v1` for a transition period.

**Small, testable parts.** One loader per source (US LCA, US PERM, Canada LMIA), pure counting and matching functions tested against small fixture files, and separate writers for each published format. A layout change touches one loader and its fixtures.

**Bounded growth.** Deployed tables keep a rolling window of years; the committed yearly summary stays under about 50 MB a year; raw downloads live only in the build cache.

**Few dependencies, kept current.** Dependency updates are automated (for example Dependabot) and gated by the same tests.

**Anyone can pick it up.** A RUNBOOK covers what each scheduled job does, what its failure issues mean, how to re-run a build, and how to add a new source year. Contributions require review by a code owner; reported facts require sources; nothing merges without passing CI.

## Licensing

- Code: MIT (unchanged).
- Written profile content: CC BY 4.0.
- Generated tables: US-derived data noted as US government public domain; Canadian-derived data carries the Open Government Licence - Canada attribution statement. Both appear in `meta.json`, the README and the page footer.

## What the other pieces need from this dataset

- **Lookup page:** the index for search, per-company and per-employer files for detail, reverse files for "who sponsors X in Y", the caveat texts, and the request-a-profile issue link.
- **Claude skill:** the same published files (so it never downloads raw government data), plus the profile schema to draft new profiles.
- **Tracker panel:** the tracker never fetches the dataset itself, because a claude.ai artifact's network access is restricted and not something to depend on. The skill looks a company up by its website domain and writes the facts into the tracker's own database: each fact's value, source, checked date and kind, so the panel can show age and offer "Use this".

## Decided

- Shared dataset in this repo, read by a page, a skill and the tracker.
- Contents: sponsorship evidence (US LCA and PERM, Canada positive LMIA), what companies publish, labelled candidate reports, links out.
- Breakdown by role, place, level, pay and year, with trends; reverse search; inline caveats.
- Domain as company ID; two tiers; raw files never committed; generated tables deployed rather than committed; change-driven re-checks with a 12-month backstop; demand-driven coverage; schema validation in CI; data licence.

## Calls made while writing (open to correction)

- Count Certified and Certified-Withdrawn LCAs as certified filings; headline new hires plus changes of employer.
- Cells under 3 filings merge into a coarser level; employers with under 3 filings show no breakdown; US employers named after a person are left out.
- Roles are about 30 maintained categories assigned from job titles (US) and occupation codes (Canada); places are metro areas plus state or province.
- Three complete fiscal years plus the current one at launch.
- Launch with tier 1 complete and about 15 seed profiles; grow toward 100 with the skill drafting for review. Seed list kept as a reviewable file, drawn (by the maintainer's choice) from companies they already researched, written from public sources only.
- Unprofiled employer IDs are a short non-secret hash, reproducible by any fork; FEINs of unprofiled employers are not shown.
- The tracker gets facts through the skill writing into its database, never by fetching the dataset.
- If GitHub's servers cannot download the US files, a quarterly maintainer script uploads them to a GitHub Release instead.
- Profile summaries capped at about 280 characters, in our own words.
- Weekly checks for new government files and for changed source pages; one combined weekly issue.
- Maintenance budget of under an hour a week at 100 profiles; builds that fail validation never replace live data.

## Left to the builder

- Pipeline language and libraries (the repo is TypeScript; a different tool for reading very large spreadsheets is acceptable if it keeps the build under about 30 minutes in GitHub Actions and the outputs deterministic).
- Profile file format (a human-friendly format such as YAML is suggested) and exact schema field names.
- Exact split sizes for index, employer and reverse files, within the size targets above.
- Text extraction and normalisation for fingerprints.
- Name normalisation rules (suffixes such as Inc, LLC, Ltd; punctuation; case).
- The workflow files, caching of downloads, and how the deploy step is wired.
- Confirming the Canadian column headers from the current file.
