// Usage: npm run dataset:build -- --out site [--live <meta.json url>] [--cache .cache/dataset] [--data data]
// Builds the site from the cached government files. When any check fails it writes build-problems.md (the
// body of the CI failure issue) and exits 1, so the deploy step never runs and the live data stays.
// Without --live, totals are not compared with a previous build (a first build). Prints counts only.
import { rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runBuild, type BuildResult } from "../build";

export const PROBLEMS_FILE = "build-problems.md";

export type BuildArgs = { out: string; live?: string; cache: string; data: string };

export function parseArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = { out: "site", cache: ".cache/dataset", data: "data" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!["--out", "--live", "--cache", "--data"].includes(flag)) throw new Error(`unknown argument: ${flag}`);
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    args[flag.slice(2) as keyof BuildArgs] = value;
    i++;
  }
  return args;
}

const list = (lines: string[]) => (lines.length ? lines.map((l) => `- ${l}`).join("\n") : "None.");

/** The issue body for a failed build: what failed, what was skipped, and that the live data stays. */
export function problemsReport(r: Pick<BuildResult, "problems" | "warnings">, at: Date): string {
  return [
    "# Dataset build failed",
    "",
    `Build of ${at.toISOString()}. Nothing was deployed: the live data is the last good build, and the yearly summaries were not updated.`,
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
    const sum = (k: "read" | "kept" | "skippedPerson" | "skippedInvalid") => fs.reduce((n, f) => n + f[k], 0);
    lines.push(
      `${src}: ${fs.length} files, read ${sum("read")}, kept ${sum("kept")}, person-named ${sum("skippedPerson")}, ` +
        `invalid ${sum("skippedInvalid")}`,
    );
  }
  lines.push(`owners: ${s.owners.total} (US ${s.owners.us}, CA ${s.owners.ca}, both ${s.owners.both}, profiled ${s.owners.profiled})`);
  lines.push(`left out: ${s.droppedPersonLike} person-like owners under 10 filings, ${s.droppedPostal} with postal-code-like names`);
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
      today: started,
      log: (line) => console.log(line),
    });
  } catch (e) {
    const problem = `the build stopped on an unexpected error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
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
