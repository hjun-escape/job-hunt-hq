// Usage: npm run dataset:build -- --out site [--live <meta.json url>] [--accept-totals-change]
//   [--cache .cache/dataset] [--data data]
// Builds the site from the cached government files. When any check fails it writes build-problems.md (the
// body of the CI failure issue) and exits 1, so the deploy step never runs and the live data stays.
// Without --live, totals are not compared with a previous build (a first build). --accept-totals-change turns
// a totals move against the live build into a warning, for a legitimate government revision (R36; off by
// default, run by hand). Prints counts only.
import { rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runBuild, safeMessage, type BuildResult } from "../build";

export const PROBLEMS_FILE = "build-problems.md";

export type BuildArgs = { out: string; live?: string; cache: string; data: string; acceptTotalsChange: boolean };

export function parseArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = { out: "site", cache: ".cache/dataset", data: "data", acceptTotalsChange: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--accept-totals-change") {
      args.acceptTotalsChange = true;
      continue;
    }
    const value = argv[i + 1];
    if (!["--out", "--live", "--cache", "--data"].includes(flag)) throw new Error(`unknown argument: ${flag}`);
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    args[flag.slice(2) as "out" | "live" | "cache" | "data"] = value;
    i++;
  }
  return args;
}

/** The problem line for an unexpected throw: through safeMessage, so no cache path and nothing personal. */
export function unexpectedProblem(e: unknown, cacheDir: string): string {
  return `the build stopped on an unexpected error: ${safeMessage(e, cacheDir)}`;
}

const list = (lines: string[]) => (lines.length ? lines.map((l) => `- ${l}`).join("\n") : "None.");

/** The issue body for a failed build: what failed, what was skipped, and that the live data stays. */
export function problemsReport(r: Pick<BuildResult, "problems" | "warnings">, at: Date): string {
  return [
    "# Dataset build failed",
    "",
    `Build of ${at.toISOString()}. Nothing was deployed: the live data is the last good build, and the yearly ` +
      "summaries were not updated.",
    "",
    "## Problems",
    "",
    list(r.problems),
    "",
    "## Warnings",
    "",
    list(r.warnings),
    "",
  ].join("\n");
}

const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;

function largest(r: BuildResult, prefix: string): string {
  const f = r.files.filter((x) => x.path.startsWith(prefix)).sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
  return f ? `${f.path} ${mb(f.gzipBytes)} gzipped` : "none";
}

/** Counts for the log: never a name, a FEIN or a value from a filing. */
export function summaryLines(r: BuildResult): string[] {
  const s = r.stats;
  const lines: string[] = [];
  if (s.years) {
    for (const [p, sel] of Object.entries(s.years)) {
      const partial = sel.partial ? `, partial ${sel.partial.year} through Q${sel.partial.through}` : "";
      lines.push(`years ${p}: complete ${sel.complete.join(", ") || "none"}${partial}`);
    }
  }
  const bySource = (src: string) => s.files.filter((f) => f.source === src);
  for (const src of ["lca", "perm", "lmia"]) {
    const fs = bySource(src);
    if (!fs.length) continue;
    const sum = (k: "read" | "kept" | "skippedPerson" | "skippedInvalid" | "tradeNamesBlanked" | "seconds") =>
      fs.reduce((n, f) => n + f[k], 0);
    const reasons = new Map<string, number>();
    for (const f of fs) for (const [k, n] of Object.entries(f.invalid)) reasons.set(k, (reasons.get(k) ?? 0) + n);
    const why = [...reasons].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k} ${n}`).join(", ");
    const counted = fs.some((f) => f.skippedRelisted !== undefined);
    const relisted = counted ? `, withdrawal relistings ${fs.reduce((n, f) => n + (f.skippedRelisted ?? 0), 0)}` : "";
    lines.push(
      `${src}: ${fs.length} files in ${sum("seconds").toFixed(1)} s, read ${sum("read")}, kept ${sum("kept")}, ` +
        `person-named ${sum("skippedPerson")}, invalid ${sum("skippedInvalid")}${why ? ` (${why})` : ""}, ` +
        `trade names blanked ${sum("tradeNamesBlanked")}${relisted}`,
    );
  }
  const o = s.owners;
  lines.push(`owners: ${o.total} (US ${o.us}, CA ${o.ca}, both ${o.both}, profiled ${o.profiled})`);
  lines.push(
    `left out: ${s.droppedPersonLike} person-like owners under 10 filings, ` +
      `${s.droppedPostal} with postal-code-like names`,
  );
  if (s.totals) {
    for (const [p, byYear] of Object.entries(s.totals)) {
      lines.push(`totals ${p}: ${Object.entries(byYear).map(([y, n]) => `${y} ${n}`).join(", ") || "none"}`);
    }
  }
  if (r.files.length) {
    const bytes = r.files.reduce((n, f) => n + f.bytes, 0);
    lines.push(`written: ${r.files.length} files, ${mb(bytes)}`);
    lines.push(`largest index shard: ${largest(r, "data/v1/index/")}`);
    lines.push(`largest reverse file: ${largest(r, "data/v1/reverse/")}`);
  }
  lines.push(`warnings: ${r.warnings.length}`);
  return lines;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = new Date();
  if (!args.live) console.log("no --live url: totals are not compared with a previous build");
  let r: BuildResult;
  try {
    r = await runBuild({
      cacheDir: args.cache,
      outDir: args.out,
      dataDir: args.data,
      liveMetaUrl: args.live,
      acceptTotalsChange: args.acceptTotalsChange,
      today: started,
      log: (line) => console.log(line),
    });
  } catch (e) {
    const problem = unexpectedProblem(e, args.cache);
    await writeFile(PROBLEMS_FILE, problemsReport({ problems: [problem], warnings: [] }, started));
    console.error(problem);
    process.exit(1);
  }
  for (const line of summaryLines(r)) console.log(line);
  for (const w of r.warnings) console.log(`warning: ${w}`);
  console.log(`elapsed: ${((Date.now() - started.getTime()) / 1000).toFixed(1)} s`);
  if (!r.ok) {
    await writeFile(PROBLEMS_FILE, problemsReport(r, started));
    for (const p of r.problems) console.error(`problem: ${p}`);
    console.error(`build failed: ${r.problems.length} problems, see ${PROBLEMS_FILE}`);
    process.exit(1);
  }
  await rm(PROBLEMS_FILE, { force: true });
  console.log("build ok");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
