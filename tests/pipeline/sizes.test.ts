// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkSizes, GZIP_LIMIT_INDEX, GZIP_LIMIT_REVERSE, RAW_LIMIT } from "../../pipeline/check/sizes";

describe("checkSizes", () => {
  it("flags an index shard over 2 MB gzipped, naming the file and the limit", () => {
    const problems = checkSizes([{ path: "data/v1/index/A.json", bytes: 9e6, gzipBytes: 3e6 }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("data/v1/index/A.json");
    expect(problems[0]).toContain("2 MB");
  });

  it("uses decimal megabytes and allows a file exactly at a limit", () => {
    expect(RAW_LIMIT).toBe(50_000_000);
    expect(GZIP_LIMIT_INDEX).toBe(2_000_000);
    expect(GZIP_LIMIT_REVERSE).toBe(1_000_000);
    expect(
      checkSizes([
        { path: "data/v1/index/B.json", bytes: 9e6, gzipBytes: 2_000_000 },
        { path: "data/v1/reverse/us/software-engineer.json", bytes: 4e6, gzipBytes: 1_000_000 },
        { path: "data/v1/employers/us/abc.json", bytes: 50_000_000, gzipBytes: 9e6 },
      ]),
    ).toEqual([]);
  });

  it("flags any file over 50 MB raw", () => {
    const problems = checkSizes([{ path: "data/v1/employers/us/abc.json", bytes: 50_000_001, gzipBytes: 1e6 }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("50 MB");
  });

  it("flags a reverse file over 1 MB gzipped", () => {
    const problems = checkSizes([{ path: "data/v1/reverse/ca/noc-6.json", bytes: 3e6, gzipBytes: 1_000_001 }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("1 MB");
  });

  it("applies the index limit to every file in the index, profiles.json included", () => {
    expect(checkSizes([{ path: "data/v1/index/profiles.json", bytes: 5e6, gzipBytes: 2_500_000 }])).toHaveLength(1);
    expect(checkSizes([{ path: "data/v1/index/0.json", bytes: 5e6, gzipBytes: 2_500_000 }])).toHaveLength(1);
  });

  it("leaves other files to the raw limit only", () => {
    expect(
      checkSizes([
        { path: "data/v1/employers/us/abc.json", bytes: 20e6, gzipBytes: 5e6 },
        { path: "data/v1/companies/google.com.json", bytes: 1e6, gzipBytes: 3e6 },
        { path: "data/v1/meta.json", bytes: 1e6, gzipBytes: 3e6 },
      ]),
    ).toEqual([]);
  });

  it("reports each limit a file breaks", () => {
    expect(checkSizes([{ path: "data/v1/index/C.json", bytes: 60e6, gzipBytes: 3e6 }])).toHaveLength(2);
  });

  it("passes an empty list", () => {
    expect(checkSizes([])).toEqual([]);
  });
});
