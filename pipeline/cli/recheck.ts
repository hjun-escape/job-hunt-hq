// Usage: npm run dataset:recheck -- --issue-body recheck.md [--report <url>]
// Re-fetches every page cited by an official fact, compares text fingerprints with data/fingerprints.json,
// rewrites that file (URLs no longer cited are dropped) and writes the weekly issue body. Never prints page text.
import { readFile, writeFile } from "node:fs/promises";
import { loadProfiles } from "../profiles/load";
import { politeFetch } from "../http";
import { Report } from "../schema/published";
import { issueBody, recheck, serializeStore, type Fetcher, type FingerprintStore } from "../check/recheck";

const STORE_PATH = "data/fingerprints.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fetcher: Fetcher = async (url) => {
  let res: Response;
  try {
    res = await politeFetch(url, { redirect: "follow" });
  } catch (e) {
    // politeFetch refuses paths that robots.txt disallows; that is "not fetched", not a failure.
    if (/robots\.txt disallows/.test((e as Error).message)) return { status: 0, finalUrl: url, body: "" };
    throw e;
  }
  return { status: res.status, finalUrl: res.url || url, body: res.ok ? await res.text() : "" };
};

async function readStore(): Promise<FingerprintStore> {
  try {
    return JSON.parse(await readFile(STORE_PATH, "utf8")) as FingerprintStore;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function main(): Promise<void> {
  const out = arg("--issue-body");
  if (!out) throw new Error("usage: dataset:recheck --issue-body <file> [--report <url>]");
  const today = new Date();
  const { profiles, problems } = await loadProfiles("data/companies", today);
  if (problems.length > 0) throw new Error(`${problems.length} profile problems; run npm run dataset:validate`);

  const result = await recheck(profiles, await readStore(), fetcher, today);
  await writeFile(STORE_PATH, serializeStore(result.store));

  let report: Report | null = null;
  let state: "unpublished" | "error" = "unpublished";
  const reportUrl = arg("--report");
  if (reportUrl) {
    try {
      const res = await politeFetch(reportUrl);
      if (res.status === 404) state = "unpublished";
      else if (!res.ok) state = "error";
      else report = Report.parse(await res.json());
    } catch {
      state = "error";
    }
  }
  await writeFile(out, issueBody(result.flags, report, state));

  const counts: Record<string, number> = {};
  for (const f of result.flags) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  console.log(`${Object.keys(result.store).length} sources stored, ${result.flags.length} flags ${JSON.stringify(counts)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
