import { DEFAULT_USER_AGENT, USER_AGENTS } from "./sources";

/** Rules under `User-agent: *` only. Longest matching rule wins, Allow beats Disallow on a tie. */
export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  const rules: { allow: boolean; prefix: string }[] = [];
  let inStar = false;
  let sawRule = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (sawRule) inStar = false;
      sawRule = false;
      if (value === "*") inStar = true;
    } else if ((key === "allow" || key === "disallow") && inStar) {
      sawRule = true;
      if (value) rules.push({ allow: key === "allow", prefix: value });
    } else {
      sawRule = true;
    }
  }
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!path.startsWith(r.prefix)) continue;
    const len = r.prefix.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

export type PoliteFetchOptions = {
  fetchFn?: typeof fetch;
  minIntervalMs?: number;
  backoffMs?: number;
  retries?: number;
  respectRobots?: boolean;
};

const DISALLOW_ALL = "User-agent: *\nDisallow: /";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPoliteFetch(opts: PoliteFetchOptions = {}) {
  const fetchFn = opts.fetchFn ?? fetch;
  const minIntervalMs = opts.minIntervalMs ?? 1000;
  const backoffMs = opts.backoffMs ?? 2000;
  const retries = opts.retries ?? 3;
  const respectRobots = opts.respectRobots ?? true;
  const nextSlot = new Map<string, number>();
  const robots = new Map<string, Promise<string>>();

  // Reserve the next request slot for a host synchronously, then wait for it.
  async function waitTurn(host: string): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + minIntervalMs);
    if (slot > now) await sleep(slot - now);
  }

  async function send(url: URL, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("user-agent")) {
      headers.set("user-agent", USER_AGENTS[url.host] ?? DEFAULT_USER_AGENT);
    }
    for (let attempt = 0; ; attempt++) {
      await waitTurn(url.host);
      try {
        const res = await fetchFn(url, { ...init, headers });
        if (res.status < 500 || attempt >= retries) return res;
      } catch (err) {
        if (attempt >= retries) throw err;
      }
      await sleep(backoffMs * 2 ** attempt);
    }
  }

  async function robotsFor(url: URL): Promise<string> {
    let p = robots.get(url.host);
    if (!p) {
      // RFC 9309: 5xx or an unreachable robots.txt means disallow all; 4xx (including 404) means allow all.
      p = send(new URL("/robots.txt", url), {})
        .then((r) => (r.status >= 500 ? DISALLOW_ALL : r.ok ? r.text() : ""))
        .catch(() => DISALLOW_ALL);
      robots.set(url.host, p);
    }
    return p;
  }

  return async function politeFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input);
    if (respectRobots && url.pathname !== "/robots.txt") {
      if (!isAllowedByRobots(await robotsFor(url), url.pathname)) {
        throw new Error(`robots.txt disallows ${url.host}${url.pathname}`);
      }
    }
    return send(url, init);
  };
}

export const politeFetch = createPoliteFetch();
