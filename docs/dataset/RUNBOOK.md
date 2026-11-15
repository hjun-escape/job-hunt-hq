# Company dataset runbook

Everything here is plain GitHub Actions plus a few local commands. Any workflow can be re-run from the Actions tab: pick the workflow, press "Run workflow", choose the branch.

## The workflows

**dataset-build** (`.github/workflows/dataset-build.yml`). Runs every Monday at 09:00 UTC, and on demand. It downloads the government files (DOL LCA and PERM, ESDC LMIA), builds the static JSON, and runs every check. If all pass, it deploys `site/` to GitHub Pages at https://hjun-escape.github.io/job-hunt-hq/ and commits any change to `data/summary/*.csv` as `data: refresh sponsorship summaries`. If any check fails, nothing is deployed, the live data stays as it was, and a single open issue labelled `dataset-build` is created or updated with the contents of `build-problems.md`. The issue means this week's build was refused; read it, fix the cause, and re-run the workflow. A run started from a branch other than master builds and checks but never deploys or commits.

**ci** (`.github/workflows/ci.yml`). Runs on every pull request and every push to master: typecheck, tests, and `npm run dataset:validate` (checks the hand-written company profiles). A red run means a profile or a code change is invalid; the log names the file. Re-run it from the Actions tab or by pushing a fix.

**dataset-recheck** (`.github/workflows/dataset-recheck.yml`, added in Task 17). The weekly re-check of live links and profile data. Its issue lists profiles that need a human look. Re-run it from the Actions tab once you have fixed what it lists.

## Totals changes (`accept_totals_change`)

The build compares year totals with the live site and fails on a move of more than 2%, or when a year drops out of the window unexpectedly. Usually that is a real problem. Occasionally it is a legitimate government revision.

1. Read the build issue and note which year and source moved.
2. Confirm the change against the source (DOL disclosure data page or the ESDC LMIA open data page).
3. If it is real, run dataset-build with "Run workflow" and tick `accept_totals_change`. The check becomes a recorded warning and the build proceeds.

Never tick it to make a red build go away without step 2.

## If the build issue says "could not read the live meta.json"

The build could not fetch https://hjun-escape.github.io/job-hunt-hq/data/v1/meta.json to compare totals. Check the URL in a browser.

- Pages down for a moment: re-run the workflow.
- Pages never deployed or the site was disabled: check Settings, Pages, and confirm the source is "GitHub Actions".
- The file moved after a schema change: update the `--live` URL in the workflow.

The build refuses to continue without the comparison on purpose, so a bad week cannot silently replace good data.

## Release fallback (if DOL refuses GitHub's runners)

Today the DOL accepts GitHub's runners directly (tested), so downloads are direct. If DOL ever starts refusing them, the fallback is: download the files on your own machine with `npm run dataset:download`, attach the files in `.cache/dataset` (with `manifest.json`) to a GitHub release, and change the workflow's download step to fetch that release into `.cache/dataset` instead. The download CLI has no release option yet; add one at that point. This costs about 10 minutes a quarter.

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
