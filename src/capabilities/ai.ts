import type { Profile } from "../domain/types";
import { errorCode } from "./errors";

export const MAX_JD_CHARS = 6000;
export const MAX_SOURCE_CHARS = 1500;
export const RATE_LIMIT_MS = 30000;

export interface DraftInput {
  question: string;
  company: string;
  role: string;
  jobDescription?: string;
  sources: { title: string; body: string }[];
  profileSummary?: string;
  language: "en" | "ko";
  length: "short" | "medium" | "long";
}
export interface Requirements { must: string[]; nice: string[] }
export interface SampleFailure { code: string; message: string; text?: string }
export type SampleOutcome = "hidden" | "retry_later" | "quiet" | "message";

const WORDS: Record<DraftInput["length"], number> = { short: 120, medium: 250, long: 450 };
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n[truncated]` : s);

/** Spec §6: question, JD, company/role, ticked sources, optional profile summary, language, length. Never contact details. */
export function buildDraftPrompt(i: DraftInput): string {
  const lines: string[] = [
    "You are helping a job seeker write their own answer to an application or interview question. Write in the first person, in their voice, using ONLY the facts in the sources and profile below; never invent employers, dates or numbers. Reply with the answer text only, no preamble.",
    `Language: ${i.language === "ko" ? "Korean (존댓말, natural business tone)" : "English"}. Length: about ${WORDS[i.length]} words.`,
    `Target: ${i.role} at ${i.company}.`,
    `Question: ${i.question.trim()}`,
  ];
  if (i.jobDescription?.trim()) lines.push(`Job description:\n${clip(i.jobDescription.trim(), MAX_JD_CHARS)}`);
  if (i.sources.length) lines.push("Sources from the job seeker's answer bank:", ...i.sources.map((s, n) => `--- Source ${n + 1}: ${s.title}\n${clip(s.body.trim(), MAX_SOURCE_CHARS)}`));
  if (i.profileSummary?.trim()) lines.push(`Background summary:\n${i.profileSummary.trim()}`);
  return lines.join("\n\n");
}

export function buildRequirementsPrompt(jobDescription: string): string {
  return [
    'Extract the hiring requirements from the job description below. Reply with only a JSON object of the shape {"must": string[], "nice": string[]} — "must" holds hard requirements, "nice" holds preferred ones; each entry is one short phrase. Example: {"must": ["5+ years backend", "Go"], "nice": ["gRPC"]}.',
    `Job description:\n${clip(jobDescription.trim(), MAX_JD_CHARS)}`,
  ].join("\n\n");
}

/** Employment summaries and links only — never email, phones, addresses or the sensitive note. */
export function profileSummary(profile: Profile): string {
  const jobs = profile.employment.map((e) => `${e.title} at ${e.company} (${e.start}–${e.end || "present"})${e.summary ? `: ${e.summary}` : ""}`);
  const links = profile.links.filter((l) => /^https?:\/\//i.test(l.url)).map((l) => `${l.label}: ${l.url}`);
  return [...jobs, ...links].join("\n");
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : []);
export function parseRequirements(value: unknown): Requirements | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!("must" in v) && !("nice" in v)) return null;
  return { must: strings(v.must), nice: strings(v.nice) };
}

export function sampleErrorOf(e: unknown): SampleFailure {
  const code = errorCode(e);
  if (code) {
    const o = e as { message?: unknown; text?: unknown };
    return { code, message: typeof o.message === "string" ? o.message : "", ...(typeof o.text === "string" ? { text: o.text } : {}) };
  }
  return { code: "upstream_error", message: e instanceof Error ? e.message : String(e) };
}

export function classifySampleError(code: string): SampleOutcome {
  switch (code) {
    case "not_granted": case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed": return "hidden";
    case "rate_limited": return "retry_later";
    case "cancelled": return "quiet";
    default: return "message";
  }
}

export function describeSampleError(code: string): string {
  switch (code) {
    case "rate_limited": return "Claude is busy or you have hit your usage limit. Try again in 30 seconds.";
    case "refused": return "Claude declined this request. Change the question or the sources and try again.";
    case "empty_completion": return "Claude returned nothing. Simplify the request and try again.";
    case "prompt_too_large": return "Too much text for one request. Shorten the job description or tick fewer sources.";
    case "invalid_json": return "Claude's reply could not be read as a list. Try again.";
    case "session_expired": return "Your Claude session expired. Sign in again, then retry.";
    case "invalid_request": case "transform_error": return "The request was malformed. Reload the page and try again.";
    default: return "The connection to Claude was interrupted. What arrived is kept; try again.";
  }
}
