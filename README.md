# Job Hunt HQ

Private job-search tracker for a multi-market search (Canada, US, Korea), published as a claude.ai artifact.

## Features (v0.3.0)

- **Dashboard** — counts by open status, what's due this week, what's overdue, upcoming interviews, contacts waiting on a follow-up, and a funnel chart of stage conversion overall or grouped by channel or resume version.
- **Applications** — a table with a column chooser and filters for country, status, tier, channel, sponsorship and tag, or a board view you can drag cards on (or move with the "Move to" select); quick-add for a new application; detail tabs including Claude drafting and requirement extraction.
- **Companies** — company directory with a per-country sponsorship policy matrix and linked applications.
- **Contacts** — recruiters, referrers, interviewers and references, with follow-up-due tracking.
- **Interviews** — interview rounds grouped by upcoming/past, with scheduling and per-round prep checklists.
- **Assets** — resume and cover letter versions, grouped by kind, with file uploads, per-country targeting and a screen-rate showing what share of applications using a resume reached the Screening stage.
- **Answers** — reusable answers, STAR stories and email templates, searchable by kind, theme and language, with a "Tailor with Claude" action to draft a new one.
- **Prep** — coding, system design and behavioral prep items with pattern, difficulty and confidence tracking.
- **Profile** — a form-fill sheet (identity, links, education, employment, salary, work authorization) with copy-to-clipboard sections.
- **Settings** — home timezone, exchange rates, priority weights, pick-list editing, a JSON backup download and restore (merge or replace), a per-collection CSV export, a storage meter, and a reset-to-defaults action.
- **Search** — a top search box that finds companies, applications, contacts and answers at once.

## AI drafting

Claude drafting (answer drafts and job-description requirement extraction) is only available inside the claude.ai artifact viewer. Every call happens on an explicit click — nothing is sent in the background. The first call in a session asks for your consent, and each call spends the viewer's own Claude usage, not a separate account. Prompts include the question, the job description, any bank answers you've ticked, and an optional background summary built from your employment history and links; they never include your contact details or the sensitive note field. Nothing is sent until you click "Draft" or "Extract requirements".

- Spec: `docs/superpowers/specs/2026-09-11-job-hunt-hq-design.md`
- Plans: `docs/superpowers/plans/`
- Published page: (link to the author's private tracker removed)

## Develop

    npm install
    npm run dev        # http://localhost:5173/dev.html (localStorage-backed fake store)
    npm test
    npm run typecheck
    npm run build      # dist/index.html (artifact fragment) + dist/app.js + dist/app.css

## Publish

Artifact tool: `file_path: dist/index.html`, `files: {"app.js": "dist/app.js", "app.css": "dist/app.css"}`,
`capabilities: {db: {}, assets: {}, downloads: true, sample: {}}`.
