import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { classifySampleError, describeSampleError, RATE_LIMIT_MS, sampleErrorOf } from "../../capabilities/ai";
import type { SampleLike } from "../../capabilities/types";

export type SamplePhase = "idle" | "thinking" | "streaming" | "done" | "error";
type Options = Omit<Claude.sample.SampleOptions, "onText" | "signal">;

/** Spec §6: a hide-class error or a rate limit applies for the rest of the page load, not just
 * to the panel that triggered it -- so this lives at module scope, shared by every hook instance. */
interface SamplePolicy { hidden: boolean; disabledUntil: number }
let policy: SamplePolicy = { hidden: false, disabledUntil: 0 };
const policyListeners = new Set<() => void>();
function setPolicy(patch: Partial<SamplePolicy>): void {
  policy = { ...policy, ...patch };
  policyListeners.forEach((l) => l());
}
function subscribePolicy(listener: () => void): () => void {
  policyListeners.add(listener);
  return () => policyListeners.delete(listener);
}
function getPolicySnapshot(): SamplePolicy {
  return policy;
}

/** Current page-load-wide sample policy, for parents that need to hide their own trigger button. */
export function useSamplePolicy(): SamplePolicy {
  return useSyncExternalStore(subscribePolicy, getPolicySnapshot);
}

/** Test-only: clears the page-load-wide policy between tests. */
export function resetSamplePolicy(): void {
  setPolicy({ hidden: false, disabledUntil: 0 });
}

/** One in-flight call at a time, one AbortController per call, spec §6 error policy. */
export function useSample(sample: SampleLike | null | undefined) {
  const { hidden, disabledUntil } = useSamplePolicy();
  const [phase, setPhase] = useState<SamplePhase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [maxPromptBytes, setMaxPromptBytes] = useState<number | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; ctl.current?.abort(); }, []);

  useEffect(() => {
    let live = true;
    setMaxPromptBytes(null);
    if (!sample) return;
    sample.limits().then((l) => { if (live) setMaxPromptBytes(l.maxPromptBytes); }, () => { if (live) setMaxPromptBytes(null); });
    return () => { live = false; };
  }, [sample]);

  /** Spec §6: a rate limit lifts itself after RATE_LIMIT_MS -- re-render once the window ends
   * so callers relying on `rateLimited` (e.g. re-enabling the Draft button) don't need a poll. */
  const [, retick] = useState(0);
  useEffect(() => {
    const ms = disabledUntil - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => retick((n) => n + 1), ms + 1);
    return () => clearTimeout(t);
  }, [disabledUntil]);

  const fail = useCallback((e: unknown) => {
    const err = sampleErrorOf(e);
    if (!live.current) return;
    if (err.text) setText(err.text);
    switch (classifySampleError(err.code)) {
      case "hidden": setPolicy({ hidden: true }); setPhase("idle"); setError(null); break;
      case "quiet": setPhase("idle"); setError(null); break;
      case "retry_later": setPolicy({ disabledUntil: Date.now() + RATE_LIMIT_MS }); setPhase("error"); setError(describeSampleError(err.code)); break;
      default: setPhase("error"); setError(describeSampleError(err.code));
    }
  }, []);

  const start = useCallback(() => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setPhase("thinking");
    setError(null);
    setTruncated(false);
    setText("");
    return c;
  }, []);

  const run = useCallback(async (input: Claude.sample.SampleInput, options: Options = {}): Promise<boolean> => {
    if (!sample) return false;
    const c = start();
    try {
      const r = await sample(input, { ...options, signal: c.signal, onText: ({ text: t }) => { if (live.current && ctl.current === c) { setPhase("streaming"); setText(t); } } });
      if (!live.current || ctl.current !== c) return false;
      setText(r.text);
      setTruncated(r.truncated);
      setPhase("done");
      return true;
    } catch (e) {
      if (ctl.current === c) fail(e);
      return false;
    }
  }, [sample, start, fail]);

  const runJson = useCallback(async <T,>(input: Claude.sample.SampleInput, options: Options = {}): Promise<T | null> => {
    if (!sample) return null;
    const c = start();
    try {
      const data = await sample.json<T>(input, { ...options, signal: c.signal });
      if (!live.current || ctl.current !== c) return null;
      setPhase("done");
      return data;
    } catch (e) {
      if (ctl.current === c) fail(e);
      return null;
    }
  }, [sample, start, fail]);

  const stop = useCallback(() => { ctl.current?.abort(); }, []);
  const reset = useCallback(() => { ctl.current?.abort(); ctl.current = null; setPhase("idle"); setText(""); setError(null); setTruncated(false); }, []);

  return { available: !!sample && !hidden, phase, text, setText, error, truncated, disabledUntil, rateLimited: disabledUntil > Date.now(), maxPromptBytes, run, runJson, stop, reset };
}
