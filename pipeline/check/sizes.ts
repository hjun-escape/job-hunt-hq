// Size limits for the published site, so a build never deploys files GitHub warns about or that are too slow
// to load. Megabytes here are decimal (1 MB = 1,000,000 bytes), a little stricter than GitHub's MiB.
import type { WrittenFile } from "../publish/write";

/** Any one file, uncompressed. GitHub warns above 50 MB. */
export const RAW_LIMIT = 50_000_000;
/** Each file under data/v1/index/ (the 27 name shards and profiles.json), gzipped. */
export const GZIP_LIMIT_INDEX = 2_000_000;
/** Each file under data/v1/reverse/, gzipped. */
export const GZIP_LIMIT_REVERSE = 1_000_000;

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;
const limit = (n: number) => `${n / 1_000_000} MB`;

/** One problem per limit a file breaks, naming the file, its size and the limit. */
export function checkSizes(files: WrittenFile[]): string[] {
  const problems: string[] = [];
  for (const f of files) {
    if (f.bytes > RAW_LIMIT) problems.push(`${f.path} is ${mb(f.bytes)}, over the ${limit(RAW_LIMIT)} limit for any file`);
    if (f.path.startsWith("data/v1/index/") && f.gzipBytes > GZIP_LIMIT_INDEX) {
      problems.push(`${f.path} is ${mb(f.gzipBytes)} gzipped, over the ${limit(GZIP_LIMIT_INDEX)} limit for an index shard`);
    }
    if (f.path.startsWith("data/v1/reverse/") && f.gzipBytes > GZIP_LIMIT_REVERSE) {
      problems.push(`${f.path} is ${mb(f.gzipBytes)} gzipped, over the ${limit(GZIP_LIMIT_REVERSE)} limit for a reverse file`);
    }
  }
  return problems;
}
