// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedByRobots, politeFetch, createPoliteFetch } from "../../pipeline/http";

describe("isAllowedByRobots", () => {
  const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private";
  it("applies only the * group", () => {
    expect(isAllowedByRobots(robots, "/private/x")).toBe(false);
    expect(isAllowedByRobots(robots, "/data/file.xlsx")).toBe(true);
    expect(isAllowedByRobots("", "/anything")).toBe(true);
  });
  it("lets an empty Disallow allow everything", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow:", "/x")).toBe(true);
  });
});

describe("politeFetch", () => {
  afterEach(() => vi.useRealTimers());

  it("sends the default user agent", async () => {
    const calls: RequestInit[] = [];
    const f = createPoliteFetch({
      fetchFn: async (_u, init) => {
        calls.push(init ?? {});
        return new Response("ok");
      },
      minIntervalMs: 0, respectRobots: false,
      backoffMs: 0,
    });
    await f("https://example.test/a");
    expect(new Headers(calls[0].headers).get("user-agent")).toMatch(/^job-hunt-hq-dataset\/1/);
  });

  it("retries 5xx and network errors up to 3 times then succeeds", async () => {
    let n = 0;
    const f = createPoliteFetch({
      fetchFn: async () => {
        n++;
        if (n === 1) throw new Error("socket");
        if (n === 2) return new Response("bad", { status: 503 });
        return new Response("ok", { status: 200 });
      },
      minIntervalMs: 0, respectRobots: false,
      backoffMs: 0,
    });
    const res = await f("https://example.test/a");
    expect(res.status).toBe(200);
    expect(n).toBe(3);
  });

  it("gives up after 3 retries and returns the last 5xx", async () => {
    let n = 0;
    const f = createPoliteFetch({
      fetchFn: async () => {
        n++;
        return new Response("bad", { status: 500 });
      },
      minIntervalMs: 0, respectRobots: false,
      backoffMs: 0,
    });
    const res = await f("https://example.test/a");
    expect(res.status).toBe(500);
    expect(n).toBe(4);
  });

  it("does not retry 4xx", async () => {
    let n = 0;
    const f = createPoliteFetch({
      fetchFn: async () => {
        n++;
        return new Response("nope", { status: 404 });
      },
      minIntervalMs: 0, respectRobots: false,
      backoffMs: 0,
    });
    expect((await f("https://example.test/a")).status).toBe(404);
    expect(n).toBe(1);
  });

  it("spaces requests to the same host by the interval but not across hosts", async () => {
    vi.useFakeTimers();
    const times: Record<string, number[]> = {};
    const f = createPoliteFetch({
      fetchFn: async (u) => {
        const host = new URL(String(u)).host;
        (times[host] ??= []).push(Date.now());
        return new Response("ok");
      },
      minIntervalMs: 1000, respectRobots: false,
      backoffMs: 0,
    });
    const all = Promise.all([
      f("https://a.test/1"),
      f("https://a.test/2"),
      f("https://b.test/1"),
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    await all;
    expect(times["a.test"][1] - times["a.test"][0]).toBeGreaterThanOrEqual(1000);
    expect(times["b.test"][0]).toBe(times["a.test"][0]);
  });

  it("refuses a path that robots.txt disallows", async () => {
    const f = createPoliteFetch({
      fetchFn: async (u) =>
        String(u).endsWith("/robots.txt")
          ? new Response("User-agent: *\nDisallow: /private")
          : new Response("ok"),
      minIntervalMs: 0,
      backoffMs: 0,
    });
    await expect(f("https://example.test/private/x")).rejects.toThrow(/robots/);
    expect((await f("https://example.test/public")).status).toBe(200);
  });

  it("treats a 5xx or unreachable robots.txt as disallow and a 404 as allow", async () => {
    const make = (robots: () => Response) =>
      createPoliteFetch({
        fetchFn: async (u) => (String(u).endsWith("/robots.txt") ? robots() : new Response("ok")),
        minIntervalMs: 0,
        backoffMs: 0,
        retries: 0,
      });
    await expect(make(() => new Response("", { status: 503 }))("https://a.test/x")).rejects.toThrow(/robots/);
    await expect(
      make(() => {
        throw new Error("down");
      })("https://b.test/x"),
    ).rejects.toThrow(/robots/);
    expect((await make(() => new Response("", { status: 404 }))("https://c.test/x")).status).toBe(200);
  });

  it("exports a default politeFetch", () => {
    expect(typeof politeFetch).toBe("function");
  });
});
