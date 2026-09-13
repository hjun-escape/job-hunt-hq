import { describe, it, expect } from "vitest";
import { buildDraftPrompt, buildRequirementsPrompt, classifySampleError, describeSampleError, parseRequirements, profileSummary, sampleErrorOf, MAX_JD_CHARS } from "../../src/capabilities/ai";
import { defaultProfile } from "../../src/domain/defaults";

describe("ai prompts", () => {
  it("assembles the draft prompt from question, role, JD, ticked sources, profile summary, language and length", () => {
    const p = buildDraftPrompt({
      question: "Why Shopify?", company: "Shopify", role: "Backend Engineer", jobDescription: "We build commerce.", language: "ko", length: "short",
      sources: [{ title: "STAR: outage", body: "Situation…" }], profileSummary: "Backend at Kakao (2021–2024).",
    });
    expect(p).toContain("Why Shopify?");
    expect(p).toContain("Backend Engineer at Shopify");
    expect(p).toContain("We build commerce.");
    expect(p).toContain("STAR: outage");
    expect(p).toContain("Backend at Kakao");
    expect(p).toMatch(/Korean/);
    expect(p).toMatch(/about 120 words/);
    expect(p.indexOf("Why Shopify?")).toBeGreaterThan(p.indexOf("You are helping"));
  });

  it("truncates a long job description and marks the cut", () => {
    const p = buildDraftPrompt({ question: "q", company: "c", role: "r", jobDescription: "x".repeat(MAX_JD_CHARS + 500), sources: [], language: "en", length: "medium" });
    expect(p).toContain("[truncated]");
    expect(p.length).toBeLessThan(MAX_JD_CHARS + 2000);
  });

  it("asks for strict JSON in the requirements prompt and parses tolerant shapes", () => {
    expect(buildRequirementsPrompt("Need Go and gRPC")).toMatch(/only a JSON object/);
    expect(parseRequirements({ must: ["Go", 3, " gRPC "], nice: "not a list" })).toEqual({ must: ["Go", "gRPC"], nice: [] });
    expect(parseRequirements({ must: [] })).toEqual({ must: [], nice: [] });
    expect(parseRequirements("nope")).toBeNull();
  });

  it("summarizes the profile from employment and links only", () => {
    const profile = { ...defaultProfile("2026-09-14T00:00:00.000Z"), email: "secret@example.com", sensitiveNote: "passport in the drawer",
      employment: [{ company: "Kakao", title: "Backend Engineer", start: "2021-03", end: "2024-06", summary: "Payments platform." }],
      links: [{ label: "GitHub", url: "https://github.com/x" }] };
    const s = profileSummary(profile);
    expect(s).toContain("Backend Engineer at Kakao (2021-03–2024-06): Payments platform.");
    expect(s).toContain("GitHub: https://github.com/x");
    expect(s).not.toContain("secret@example.com");
    expect(s).not.toContain("passport");
  });

  it("classifies error codes per spec §6 and normalizes unknown shapes", () => {
    expect(classifySampleError("not_granted")).toBe("hidden");
    expect(classifySampleError("sampling_disabled")).toBe("hidden");
    expect(classifySampleError("queue_overflow")).toBe("hidden");
    expect(classifySampleError("rate_limited")).toBe("retry_later");
    expect(classifySampleError("cancelled")).toBe("quiet");
    expect(classifySampleError("refused")).toBe("message");
    expect(classifySampleError("whatever")).toBe("message");
    expect(describeSampleError("refused")).toMatch(/declined/i);
    expect(describeSampleError("empty_completion")).toMatch(/nothing/i);
    expect(sampleErrorOf({ code: "refused", message: "m" })).toEqual({ code: "refused", message: "m" });
    expect(sampleErrorOf(new Error("x"))).toMatchObject({ code: "upstream_error" });
  });
});
