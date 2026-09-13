import { useCallback, useEffect, useRef, useState } from "react";
import { classifySampleError, describeSampleError, RATE_LIMIT_MS, sampleErrorOf } from "../../capabilities/ai";
import type { SampleLike } from "../../capabilities/types";

export type SamplePhase = "idle" | "thinking" | "streaming" | "done" | "error";
type Options = Omit<Claude.sample.SampleOptions, "onText" | "signal">;

/** One in-flight call at a time, one AbortController per call, spec §6 error policy. */
export function useSample(sample: SampleLike | null | undefined) {
  const [phase, setPhase] = useState<SamplePhase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [disabledUntil, setDisabledUntil] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; ctl.current?.abort(); }, []);

  const fail = useCallback((e: unknown) => {
    const err = sampleErrorOf(e);
    if (!live.current) return;
    if (err.text) setText(err.text);
    switch (classifySampleError(err.code)) {
      case "hidden": setHidden(true); setPhase("idle"); setError(null); break;
      case "quiet": setPhase("idle"); setError(null); break;
      case "retry_later": setDisabledUntil(Date.now() + RATE_LIMIT_MS); setPhase("error"); setError(describeSampleError(err.code)); break;
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

  return { available: !!sample && !hidden, phase, text, setText, error, truncated, disabledUntil, run, runJson, stop, reset };
}
