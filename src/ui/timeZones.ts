const COMMON = ["America/Toronto", "America/Vancouver", "America/New_York", "America/Los_Angeles", "America/Chicago", "Asia/Seoul", "UTC"];
let cache: string[] | null = null;

/** Common zones first, then every zone the runtime knows. */
export function allTimeZones(): string[] {
  if (cache) return cache;
  const known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  cache = [...COMMON, ...known.filter((z) => !COMMON.includes(z))];
  return cache;
}
