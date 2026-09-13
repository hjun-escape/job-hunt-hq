# Job Hunt HQ

Private job-search tracker for a multi-market search (Canada, US, Korea), published as a claude.ai artifact.

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
