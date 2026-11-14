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

MIT. See [LICENSE](LICENSE).
