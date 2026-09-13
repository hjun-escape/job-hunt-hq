# Job Hunt HQ

Private job-search tracker for a multi-market search (Canada, US, Korea), published as a claude.ai artifact.

## Features (v0.2.0)

- **Dashboard** — placeholder counts by open status until Plan 3 adds real reporting.
- **Applications** — filterable, sortable table of every application with deadlines, priority score, next action and quick-add.
- **Companies** — company directory with a per-country sponsorship policy matrix and linked applications.
- **Contacts** — recruiters, referrers, interviewers and references, with follow-up-due tracking.
- **Interviews** — interview rounds grouped by upcoming/past, with scheduling and per-round prep checklists.
- **Assets** — resume and cover letter versions, grouped by kind, with file uploads and per-country targeting.
- **Answers** — reusable answers, STAR stories and email templates, searchable by kind, theme and language.
- **Prep** — coding, system design and behavioral prep items with pattern, difficulty and confidence tracking.
- **Profile** — a form-fill sheet (identity, links, education, employment, salary, work authorization) with copy-to-clipboard sections.
- **Settings** — home timezone, exchange rates, priority weights, pick-list editing and a reset-to-defaults action.

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
