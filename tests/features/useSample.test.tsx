import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createFakeSample } from "../../src/capabilities/fakeSample";
import { resetSamplePolicy, useSample } from "../../src/features/ai/useSample";

describe("useSample", () => {
  beforeEach(resetSamplePolicy);

  it("is unavailable while pending or absent", () => {
    expect(renderHook(() => useSample(undefined)).result.current.available).toBe(false);
    expect(renderHook(() => useSample(null)).result.current.available).toBe(false);
  });

  it("streams text into state and ends in done", async () => {
    const sample = createFakeSample({ reply: () => "hello world", chunks: 2 });
    const { result } = renderHook(() => useSample(sample));
    expect(result.current.available).toBe(true);
    await act(async () => { await result.current.run("draft"); });
    expect(result.current.phase).toBe("done");
    expect(result.current.text).toBe("hello world");
  });

  it("keeps partial text and shows a message on a failure, hides after a hide-class error, and disables after rate limiting", async () => {
    const failing = createFakeSample({ reply: () => "partial answer", error: { code: "upstream_error", message: "x", text: "partial" } });
    const h1 = renderHook(() => useSample(failing));
    await act(async () => { await h1.result.current.run("q"); });
    expect(h1.result.current.phase).toBe("error");
    expect(h1.result.current.text).toBe("partial");
    expect(h1.result.current.error).toMatch(/interrupted/i);

    const denied = createFakeSample({ error: { code: "not_granted", message: "" } });
    const h2 = renderHook(() => useSample(denied));
    await act(async () => { await h2.result.current.run("q"); });
    expect(h2.result.current.available).toBe(false);

    const limited = createFakeSample({ error: { code: "rate_limited", message: "" } });
    const h3 = renderHook(() => useSample(limited));
    await act(async () => { await h3.result.current.run("q"); });
    expect(h3.result.current.disabledUntil).toBeGreaterThan(Date.now());
    expect(h3.result.current.error).toMatch(/30 seconds/);
  });

  it("stop() cancels quietly and runJson returns parsed data or null", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let paced = 0;
    const slow = createFakeSample({ reply: () => "a b", chunks: 2, pace: () => (paced++ === 0 ? Promise.resolve() : gate) });
    const { result } = renderHook(() => useSample(slow));
    let p: Promise<unknown> = Promise.resolve();
    act(() => { p = result.current.run("q"); });
    await waitFor(() => expect(result.current.phase).toBe("streaming"));
    expect(result.current.text).toBe("a ");
    act(() => result.current.stop());
    release();
    await act(async () => { await p; });
    expect(result.current.phase).toBe("idle");
    expect(result.current.error).toBeNull();

    const json = createFakeSample({ json: () => ({ must: ["Go"], nice: [] }) });
    const j = renderHook(() => useSample(json));
    let data: unknown;
    await act(async () => { data = await j.result.current.runJson("q"); });
    expect(data).toEqual({ must: ["Go"], nice: [] });
    const bad = createFakeSample({ error: { code: "invalid_json", message: "", text: "not json" } });
    const b = renderHook(() => useSample(bad));
    let none: unknown = "unset";
    await act(async () => { none = await b.result.current.runJson("q"); });
    expect(none).toBeNull();
    expect(b.result.current.error).toMatch(/could not be read/i);
  });

  it("hides for every later hook instance after a hide-class error", async () => {
    const denied = createFakeSample({ error: { code: "not_granted", message: "" } });
    const h1 = renderHook(() => useSample(denied));
    await act(async () => { await h1.result.current.run("q"); });
    expect(h1.result.current.available).toBe(false);

    const working = createFakeSample({ reply: () => "hello" });
    const h2 = renderHook(() => useSample(working));
    expect(h2.result.current.available).toBe(false);
  });

  it("keeps the rate-limit window across instances", async () => {
    const limited = createFakeSample({ error: { code: "rate_limited", message: "" } });
    const h1 = renderHook(() => useSample(limited));
    await act(async () => { await h1.result.current.run("q"); });
    expect(h1.result.current.disabledUntil).toBeGreaterThan(Date.now());

    const working = createFakeSample({ reply: () => "hello" });
    const h2 = renderHook(() => useSample(working));
    expect(h2.result.current.disabledUntil).toBeGreaterThan(Date.now());
  });
});
