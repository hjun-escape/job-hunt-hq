# Company dataset runbook

Everything here is plain GitHub Actions plus a few local commands. Any workflow can be re-run from the Actions tab: pick the workflow, press "Run workflow", choose the branch.

## The workflows

**dataset-build** (`.github/workflows/dataset-build.yml`). Runs every Monday at 09:00 UTC, and on demand. It downloads the government files (DOL LCA and PERM, ESDC LMIA), builds the static JSON, and runs every check. If all pass, it deploys `site/` to GitHub Pages at https://hjun-escape.github.io/job-hunt-hq/. It is split into four jobs: `build` (read-only, runs the checks), `deploy` (publishes the site), `summaries` (runs only after a successful deploy, pulls the latest master and commits any change to `data/summary/*.csv` as `data: refresh sponsorship summaries`, retrying the push up to 3 times), and `report` (files the issue when any job fails, times out or is cancelled; a run you cancel by hand files it too, so close that one). If any check fails, nothing is deployed and the live data stays as it was. A failure in `summaries` never touches the live site. The single open issue labelled `dataset-build` is created, or commented on and updated if one is already open; it holds `build-problems.md` when the build wrote one, otherwise it names the job that failed. The issue means this week's run needs a look; read it, fix the cause, and re-run the workflow. Close the issue once a build succeeds. A run started from a branch other than master builds and checks but never deploys or commits.

**ci** (`.github/workflows/ci.yml`). Runs on every pull request and every push to master: typecheck, tests, and `npm run dataset:validate` (checks the hand-written company profiles). A red run means a profile or a code change is invalid; the log names the file. Re-run it from the Actions tab or by pushing a fix.

**dataset-recheck** (`.github/workflows/dataset-recheck.yml`). Runs every Monday at 10:00 UTC, and on demand. It re-fetches every page cited by an official fact in `data/companies`, compares a fingerprint of the readable text with `data/fingerprints.json`, and writes the single open issue labelled `dataset-weekly` (created, or edited and commented on if one is already open). The issue lists changed sources, moved or gone pages, earlier flags not yet reviewed, pages that need a manual check, facts not re-confirmed in 12 months, and the largest sponsors without a profile (from the published `report.json`, or "Not available" until the dataset is published). On master a second job commits the updated `data/fingerprints.json` as `data: update source fingerprints`. If either job fails, times out or is cancelled, a third job opens (or comments on) the single issue labelled `dataset-recheck-failed`, titled "Source re-check failed", naming the job; fix the cause, re-run the workflow and close that issue. Review what the weekly issue lists, update the profiles, and close the issue when done; the next run edits a fresh one if needed.

A changed, moved or gone page is not forgotten after one week: it stays listed, under "Flagged earlier and not yet reviewed" with the date it was first flagged, until every fact citing it has a `checked` date on or after that date. To clear one, re-read the page, update the fact (or replace the source URL), and set `checked` to the day you checked. A week where the page is blocked, unreachable or too short to read keeps the last real fingerprint (`lastHash`), so a change hidden behind such a week is still caught. URLs that no profile cites any more are dropped from `data/fingerprints.json`.

## Totals changes (`accept_totals_change`)

The build compares year totals with the live site and fails on a move of more than 2%, or when a year drops out of the window unexpectedly. Usually that is a real problem. Occasionally it is a legitimate government revision.

1. Read the build issue and note which year and source moved.
2. Confirm the change against the source (DOL disclosure data page or the ESDC LMIA open data page).
3. If it is real, run dataset-build with "Run workflow" and tick `accept_totals_change`. The check becomes a recorded warning and the build proceeds.

Never tick it to make a red build go away without step 2.

## If the build issue says "could not read the live meta.json"

The build could not read the live file to compare totals. The causes are a non-404 HTTP error, a network error, invalid JSON, or a schema mismatch. Open https://hjun-escape.github.io/job-hunt-hq/data/v1/meta.json in a browser.

- Pages down for a moment, or a network error: re-run the workflow.
- Invalid JSON or a schema mismatch: the live file is damaged or from an older format. Compare it with a local build's `site/data/v1/meta.json` and fix the cause.

A plain 404 (for example Pages is disabled or nothing was ever deployed) is different: it is treated as a first build and only warns. If that is not expected, check Settings, Pages, and confirm the source is "GitHub Actions".

The build refuses to continue without the comparison on purpose, so a bad week cannot silently replace good data.

## If the build issue says "<source> data looks stale"

The newest quarter the build found for that source (`lca`, `perm` or `lmia`) ended more than 150 days ago. Either the source moved its files, so the download step only finds old ones, or the source is late with its next quarter (ESDC's LMIA list has lagged by more than four months). The live data stays as it was until a build passes.

1. Open the source page: DOL's performance data page (https://www.dol.gov/agencies/eta/foreign-labor/performance) for `lca` and `perm`, or the positive LMIA employers dataset on open.canada.ca for `lmia`.
2. If a newer quarter is listed under a new address or file name, update `lcaUrlCandidates` / `permUrlCandidates` in `pipeline/sources.ts`, or the resource parsing in `pipeline/cli/download.ts` for LMIA, then run `npm run dataset:download` locally to confirm the new file is found, and re-run the workflow.
3. If no newer quarter has been posted, the source is late: there is nothing to fix. The issue is commented on each week until the quarter appears, and the next build after that passes.

## Forcing a fresh download

The build keeps the downloaded government files in the GitHub Actions cache (keys starting `dataset-`), and the download step skips any file it already has. If a source republished a file under the same name, or a cached file looks wrong, delete the cache and re-run the workflow: Actions tab, Management, Caches, delete every `dataset-` entry (or `gh cache list` then `gh cache delete <key>`). The next run downloads everything again, about 1.2 GB.

## Branch protection on master

The `summaries` job (dataset-build) and the `commit` job (dataset-recheck) push straight to master as `github-actions[bot]`. If master ever gets branch protection or a ruleset, `github-actions[bot]` (GitHub Actions) must be allowed to push to it, or those two jobs fail every week. A failure there never touches the live site, but the summaries and the fingerprints stop being updated, and every week files a `dataset-build` or `dataset-recheck-failed` issue.

## Release fallback (if DOL refuses GitHub's runners)

Today the DOL accepts GitHub's runners directly (tested), so downloads are direct. If DOL ever starts refusing them, the fallback is: download the files on your own machine with `npm run dataset:download`, attach the files in `.cache/dataset` (with `manifest.json`) to a GitHub release, and change the workflow's download step to fetch that release into `.cache/dataset` instead. The download CLI has no release option yet; add one at that point. The effort is not measured; the spec estimated about 10 minutes a quarter.

## Adding a new source year

Nothing to do. The year window rolls on its own from the current date, and the download step probes for the newest quarter files. The first build after a new year appears shows the new year in the summaries.

## Refreshing the reference tables

The tables in `data/reference/*.csv` are committed and refreshed by hand, rarely (new census delineations, new postal data).

1. Census metro list: `npm run dataset:download -- --only cbsa`
2. Census ZCTA relationship file: `npm run dataset:download -- --only zcta`
3. StatCan attribute file: StatCan only allows a manual browser download. Open the attribute file page linked from the download CLI (`STATCAN_GAF_PAGE_URL` in `pipeline/sources.ts`), download the zip, then run `npm run dataset:download -- --gaf-file <path to zip>`.
4. Rebuild the tables: `npm run dataset:reference`
5. Review the diff in `data/reference/` and commit.

## Local commands

| Command | What it does |
| --- | --- |
| `npm run dataset:download` | Fetch LCA, PERM and LMIA into `.cache/dataset` (about 1.2 GB). `-- --only <name>` limits it. |
| `npm run dataset:build -- --out site --live <meta url>` | Build `site/`, write summaries, write `build-problems.md` and exit 1 on any failure. Leave out `--live` for a first build. |
| `npm run dataset:validate` | Check the hand-written profiles. |
| `npm run dataset:find -- "<name>"` | Look up how a company name appears in the filings. |
| `npm run dataset:reference` | Rebuild reference tables from downloaded sources. |

## Time

Budget from the spec: under an hour a week of human work at 100 profiles (reading the weekly issue and reviewing incoming pull requests). If the weekly issue regularly needs more, pause coverage growth until automation catches up.

Measured build, locally: 426 seconds on a lightly loaded 10-core Mac, about 396 of them reading spreadsheets (LCA 325, PERM 65, LMIA 6), with peak memory around 2.4 to 2.9 GB. Under heavy load it took up to about 1,400 seconds. CI time has not been measured yet; it is recorded after the first live run. The job has a 60 minute timeout.
