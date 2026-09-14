import { describe, it, expect } from "vitest";
import { createFakeSample } from "../../src/capabilities/fakeSample";

describe("createFakeSample", () => {
  it("streams the reply in growing text updates and resolves with the whole text", async () => {
    const sample = createFakeSample({ reply: () => "one two three four", chunks: 4 });
    const seen: string[] = [];
    const r = await sample("hi", { onText: ({ text, delta }) => { expect(text.endsWith(delta)).toBe(true); seen.push(text); } });
    expect(r).toEqual({ text: "one two three four", truncated: false, modelTierApplied: "default" });
    expect(seen.length).toBe(4);
    expect(seen[seen.length - 1]).toBe("one two three four");
    expect(sample.calls[0].input).toBe("hi");
  });

  it("parses json and rejects with the configured error keeping partial text", async () => {
    const ok = createFakeSample({ json: () => ({ must: ["Go"], nice: [] }) });
    expect(await ok.json("x")).toEqual({ must: ["Go"], nice: [] });
    const failing = createFakeSample({ reply: () => "partial answer here", error: { code: "upstream_error", message: "boom", text: "partial" } });
    await expect(failing("x")).rejects.toMatchObject({ code: "upstream_error", text: "partial" });
  });

  it("cancels through the signal", async () => {
    const sample = createFakeSample({ reply: () => "a b c d e f", chunks: 6 });
    const ctl = new AbortController();
    const p = sample("x", { signal: ctl.signal, onText: ({ text }) => { if (text.length >= 3) ctl.abort(); } });
    await expect(p).rejects.toMatchObject({ code: "cancelled" });
  });

  it("reports a configurable prompt budget", async () => {
    expect((await createFakeSample({ maxPromptBytes: 1000 }).limits()).maxPromptBytes).toBe(1000);
    expect((await createFakeSample().limits()).maxPromptBytes).toBe(65536);
  });
});
