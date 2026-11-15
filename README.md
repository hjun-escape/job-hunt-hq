# Job Hunt HQ

A job-search tracker for running many applications across several countries at once. It runs as a private claude.ai Artifact: one page with its own database and file store, and Claude drafting built in.

The defaults cover Canada, the United States and Korea, including Korean hiring tracks (공채, 수시), aptitude tests and local job boards, and every company carries a sponsorship policy per country. Every pick list is editable in Settings.

Built with Claude Code, test-first: about 390 tests, a written spec and four implementation plans (see [How it was built](#how-it-was-built)).

## Features

- **Dashboard:** counts by open status, what's due this week, what's overdue, upcoming interviews, contacts waiting on a follow-up, and a funnel chart of stage conversion overall or grouped by channel or resume version.
- **Applications:** a table with a column chooser and filters for country, status, tier, channel, sponsorship and tag, or a board view you can drag cards on (or move with the "Move to" select); quick-add for a new application; detail tabs including Claude drafting and requirement extraction.
- **Companies:** a company directory with a per-country sponsorship policy matrix and linked applications.
- **Contacts:** recruiters, referrers, interviewers and references, with follow-up-due tracking and referral status.
- **Interviews:** interview rounds grouped by upcoming and past, with scheduling and per-round prep checklists.
- **Assets:** resume and cover letter versions, grouped by kind, with file uploads, per-country targeting and a screen rate showing what share of applications using a resume reached the Screening stage.
- **Answers:** reusable answers, STAR stories and email templates, searchable by kind, theme and language, with a "Tailor with Claude" action to draft a new one.
- **Prep:** coding, system design and behavioral prep items with pattern, difficulty and confidence tracking.
- **Profile:** a form-fill sheet (identity, links, education, employment, salary, work authorization) with copy-to-clipboard sections.
- **Settings:** home timezone, exchange rates, priority weights, pick-list editing, a JSON backup download and restore (merge or replace), a per-collection CSV export, a storage meter, and a reset-to-defaults action. Restores report how far they got if storage refuses a document.
- **Search:** one search box that finds companies, applications, contacts and answers at once.

## AI drafting

Claude drafting (answer drafts and job-description requirement extraction) is only available inside the claude.ai artifact viewer. Every call happens on an explicit click; nothing is sent in the background. The first call in a session asks for your consent, and each call spends the viewer's own Claude usage, not a separate account. Prompts include the question, the job description, any bank answers you've ticked, and an optional background summary built from your employment history and links; they never include your contact details or the sensitive note field. Draft is disabled when the prompt would exceed Claude's input limit, and drafting again asks before replacing text you edited.

## Your data

Everything you enter lives in your own artifact's database and file store, never in this repository. Backups are JSON files you download from Settings. The profile is for filling in application forms; keep government ID numbers out of it and note where the documents are instead.

## Sharing

An artifact is private until you share it, and keeping it private is the safe default. If you do share it, contacts, assets (resume records), answers and the profile stay visible only to you and Editors: the private tabs are hidden for everyone else, and the server returns nothing for those records. Everything else is visible to anyone the page is shared with, including free text on those records: application notes and next actions, and interview notes, meeting links and interviewer names. Preview what a viewer sees locally at `dev.html?viewer`.

## Data

This repository also builds a public company dataset: which US and Canadian employers have sponsored foreign workers, from the US Department of Labor's LCA and PERM disclosure files and Canada's positive LMIA employers list, plus hand-written profiles of companies (mission, values, application rules, hiring process, reported waiting periods), each fact with its sources. It covers the three most recent complete years and the current year to date (US fiscal years run October to September; Canada uses calendar quarters). The build publishes static JSON files that anyone can read:

    https://hjun-escape.github.io/job-hunt-hq/data/v1/

`v1` only ever gains fields; a breaking change would be published as `v2` alongside it.

### Files

| Path under `data/v1/` | What it holds |
| --- | --- |
| `meta.json` | Schema version, build time, the years covered, the source files (with checksums), totals, warnings, the caveats and licences below, and display labels for every role id and place key used. |
| `index/<A to Z, or 0>.json` | The search list, split by the first letter of the normalised name (`0` for anything else). Each entry has `id`, `name`, `also` (other names), `c` (countries), `h` (a headline count for sorting) and, for profiled companies, `p`. |
| `index/profiles.json` | The profiled companies only. |
| `companies/<domain>.json` | A profiled company: its profile, the legal names its filings were made under, and its sponsorship. |
| `employers/<us or ca>/<3 characters>.json` | Employers without a profile, keyed by id. The file name is characters 4 to 6 of the id, so `us-1a2b3c4d5e` is in `employers/us/1a2.json`. |
| `reverse/<us or ca>/<role>.json` | The top 50 sponsors of one role in each place, for the latest complete year (LCA for the US, LMIA for Canada), ranked by filings (US) or positions (Canada). |
| `report.json` | The largest sponsors without a profile, and possible matches for existing profiles. |
| `schema/profile.json` | The JSON Schema of a profile file. |

The shard is the first letter of the name after `normalizeName` (in `pipeline/normalize/names.ts`): accents removed, upper-cased, punctuation dropped and a leading "THE" removed. A name that then starts with anything other than A to Z, such as a digit or a non-Latin letter, is in `index/0.json`.

A profiled company's id is its website domain, such as `google.com`. Any other employer's id is `us-` or `ca-` and 10 hexadecimal characters, the same in every build. A `us-` id is a short hash of the employer's FEIN (its federal tax ID); a filing without a FEIN is hashed from the normalised name and state instead. A `ca-` id is a hash of the normalised name and province. The hash keeps URLs short but does not hide the FEIN, which the DOL files already publish. The published files never show the FEIN of an employer without a profile.

A yearly per-employer summary (`data/summary/<lca, perm or lmia>-<year>.csv` in this repository: id, name, region, filings and headline) is committed after each good build, so changes show in the history. Its `headline` is the headline described below, so for LCA and PERM it equals `filings`.

### Reading the numbers

- Each program (`lca`, `perm`, `lmia`) has one block per year with filings. `total` covers the whole employer; `cells` break it down by role and place. `partial` marks the current year, and `through` says how far it goes (fiscal months for the US, quarters for Canada). `months` gives the headline per fiscal month (US) or quarter (Canada), and is left out when any entry is 1 or 2.
- The headline is certified filings for LCA and PERM, and approved positions for LMIA. The LCA trend and every LCA ranking (`h` in the index, the reverse files, `report.json`) use certified filings. `h` adds the latest complete LCA year's filings and the latest complete LMIA year's positions.
- One LCA can cover many positions (a single filing can cover dozens), so worker counts can far exceed filings. `workers` on an LCA total or cell counts positions, and the total splits them into new hires (`newHires`), changes of employer (`changeEmployer`) and continuing staff (`continuing`: renewals, changes for the same employer and amendments), as published detail. A `TOTAL_WORKER_POSITIONS` of 0 or blank counts as 1.
- DOL lists an LCA certified in one quarter and withdrawn in a later one again, as "Certified - Withdrawn", in the later quarter's file. Such a relisting is counted once, in the quarter it was certified (a case first listed before the years covered is not counted).
- Numbers below 3 are withheld. When any part of a group that adds up to a known total is 1 or 2 (the hire types, the wage levels, the program streams), the whole group is withheld. An employer with fewer than 3 filings in a year (approved LMIAs in Canada) shows only `tooFew` for that year.
- Pay (median and quartiles, rounded to the nearest 1,000) needs at least 10 salaries. It is the offered rate (the lower end of a range) made annual: hourly x 2,080, weekly x 52, bi-weekly x 26, monthly x 12. An annual figure under 15,000 or over 1,500,000, or an hourly rate over 1,000, is left out of pay but still counted as a filing.
- Breakdowns by role and place show filing counts and pay only: filings (and workers for LCA) and pay in the US, LMIAs and positions in Canada. Detailed counts (denials, withdrawals, hire types, wage levels, program streams) are per employer, on `total`.
- Breakdown cells do not add up to the total: the difference is filings in groups too small to show.
- A place key is a metro area (`cbsa:<code>` in the US, `cma:<code>` in Canada) or a state or province (`US-CA`, `CA-ON`; `US` or `CA` alone when it is unknown). A state or province key in a breakdown means "elsewhere in this region", outside the metro areas listed for that role. Role `all` in a breakdown means roles too small to show on their own in that place; `all` on the total means everything. `meta.json` has a label for every other key; `all` has no label in `meta.json`.
- Connecticut worksites are placed at state level only.
- PERM starts at fiscal year 2025, the first year whose file uses the layout of the new form (ETA-9089); older files use a legacy layout.
- LMIA counts include positions that employers later cancelled.
- Other names (`also`) leave out filler typed into the trade-name field, such as "N/A" or "SAME AS ABOVE", and street addresses (a name that starts with a house number, has a street word such as ST or SUITE, and no corporate word such as INC or LLC).
- US employers that look named after a person are left out, much as Canada's list leaves them out at source. A profile, or for less certain names at least 10 filings, brings one back.
- Trends compare the headline over the same period a year apart (full years, or the year to date against the same months a year earlier). A trend appears only when both years have a block with at least 3 filings (approved LMIAs in Canada) and the earlier one is not 0; a year-to-date trend also needs `months` in both years.
- The government source files themselves list every case. This dataset summarises them; it does not replace them.

### Caveats

The same words are stored in `meta.json`, so every consumer shows them:

- LCA: "A Labor Condition Application (LCA) is a step before an H-1B, H-1B1 or E-3 visa petition, not an approved visa. Counts are certified filings, renewals included. One LCA can cover many positions, so worker counts can far exceed filings."
- PERM: "A certified PERM labour certification is one step toward a green card, not the green card itself."
- LMIA: "A positive LMIA is not a work permit. The list counts positions later cancelled by employers and leaves out businesses whose names include a person's name."
- All: "These figures show past filings, not whether a company will sponsor you."

### Licences

- Company profiles: CC BY 4.0.
- US-derived tables: US government work, public domain.
- Canada-derived tables: Contains information licensed under the Open Government Licence – Canada.
- Canadian metro areas: Adapted from Statistics Canada, Geographic Attribute File (catalogue no. 92-151-X), 2021 Census. This does not constitute an endorsement by Statistics Canada of this product.
- US metro areas: US government works (OMB delineations and Census Bureau files), public domain.
- Code: MIT.

Details are in [DATA-LICENSE.md](DATA-LICENSE.md).

### Request or add a company

[Request a company](https://github.com/hjun-escape/job-hunt-hq/issues/new?template=request-company.yml) with the issue form, or write the profile yourself: [CONTRIBUTING.md](CONTRIBUTING.md) explains the file format and the checks.

## Run your own copy

You need a Claude plan with Claude Code and Artifacts.

    git clone https://github.com/hjun-escape/job-hunt-hq.git
    cd job-hunt-hq
    npm install
    npm run build

Then ask Claude Code to publish it, for example: "Publish dist/index.html as an artifact, with dist/app.js and dist/app.css as app.js and app.css, and the capabilities in capabilities.json." The page starts empty and private to you, and creates its default settings the first time you open it.

## Develop

    npm install
    npm run dev        # http://localhost:5173/dev.html (localStorage-backed fake store)
    npm test
    npm run typecheck
    npm run build      # dist/index.html (artifact fragment) + dist/app.js + dist/app.css

## Publish

Artifact tool: `file_path: dist/index.html`, `files: {"app.js": "dist/app.js", "app.css": "dist/app.css"}`, `capabilities`: the object in `capabilities.json` (it restates every capability, because a non-empty declaration replaces the stored one).

Stop `npm run dev` before building to publish: its watcher writes development builds (unminified, with inline source maps) into the same `dist/` folder. After publishing, compare the live `app.js` with `dist/app.js` to confirm the production build went out.

## How it was built

- Spec: [`docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md`](docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md)
- Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/): foundation, records, insights and hardening, each built test-first with Claude Code and reviewed before merging.

## License

MIT. See [LICENSE](LICENSE). The dataset's profiles and tables carry their own licences: see [DATA-LICENSE.md](DATA-LICENSE.md).
