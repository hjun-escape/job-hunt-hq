import type { SampleLike } from "./types";

type Input = Claude.sample.SampleInput;
type Options = Claude.sample.SampleOptions;
interface FakeError { code: string; message: string; text?: string }
export interface FakeSampleOptions {
  reply?: (input: Input) => string;
  json?: (input: Input) => unknown;
  error?: FakeError;
  /** How many onText updates a reply is split into (default 3). */
  chunks?: number;
  /** Awaited before each chunk; defaults to a macrotask tick. Tests pass a gate to hold the stream open. */
  pace?: () => Promise<void>;
  /** Reported by `limits()`; defaults to 65536. */
  maxPromptBytes?: number;
}
export type FakeSample = SampleLike & { calls: { input: Input; options?: Options }[] };

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** In-memory stand-in for the platform `sample` capability: streams a canned reply, honours `signal`, fails on demand. */
export function createFakeSample(opts: FakeSampleOptions = {}): FakeSample {
  const calls: { input: Input; options?: Options }[] = [];
  const reply = opts.reply ?? ((input) => `(fake) ${typeof input === "string" ? input.slice(0, 40) : "chat"}`);
  const chunks = Math.max(1, opts.chunks ?? 3);

  async function stream(input: Input, options?: Options): Promise<string> {
    calls.push({ input, options });
    const full = reply(input);
    const size = Math.max(1, Math.ceil(full.length / chunks));
    const stopAt = opts.error?.text != null ? Math.ceil(full.length / 2) : full.length;
    let text = "";
    while (text.length < stopAt) {
      await (opts.pace ?? tick)();
      if (options?.signal?.aborted) throw { code: "cancelled", message: "aborted", ...(text ? { text } : {}) };
      const delta = full.slice(text.length, Math.min(stopAt, text.length + size));
      text += delta;
      options?.onText?.({ text, delta });
    }
    if (opts.error) throw { ...opts.error, ...(opts.error.text != null ? { text: opts.error.text } : {}) };
    return text;
  }

  const fn = async (input: Input, options?: Options) => ({ text: await stream(input, options), truncated: false, modelTierApplied: "default" as const });
  const withMembers = Object.assign(fn, {
    calls,
    json: async <T = unknown>(input: Input, options?: Options): Promise<T> => {
      if (opts.error) { calls.push({ input, options }); throw opts.error; }
      if (opts.json) { calls.push({ input, options }); return opts.json(input) as T; }
      return JSON.parse(await stream(input, options)) as T;
    },
    limits: async () => ({ maxPromptBytes: opts.maxPromptBytes ?? 65536 }),
  });
  return withMembers as unknown as FakeSample;
}
