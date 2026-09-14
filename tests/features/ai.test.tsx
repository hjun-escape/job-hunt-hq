import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { buildDraftPrompt, profileSummary } from "../../src/capabilities/ai";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { createFakeSample } from "../../src/capabilities/fakeSample";
import { absentCapabilities, type Capabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication, buildCompany } from "../../src/domain/factories";
import type { Application } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, extra: Partial<Capabilities> = {}, jd = "We need Go and gRPC experience.") {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "profile/main", { ...defaultProfile(NOW), employment: [{ company: "Kakao", title: "Backend Engineer", start: "2021", end: "2024", summary: "Payments." }] });
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", jobDescription: jd, answerIds: ["an_1"] }, "app_1", NOW));
  await put(db, "answers/an_1", buildAnswer({ kindId: "answer", title: "STAR: outage", body: "Situation: the checkout went down." }, "an_1", NOW));
  await put(db, "answers/an_2", buildAnswer({ kindId: "answer", title: "Why Shopify", question: "Why Shopify?", body: "Commerce at scale." }, "an_2", NOW));
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db), ...extra }} />);
  await screen.findByRole("dialog");
  return db;
}
const openTab = async (name: string) => {
  fireEvent.click(screen.getByRole("tab", { name }));
  await act(async () => {});
};

describe("AI draft assist", () => {
  it("drafts an answer from the Answers tab, streaming into an editable textarea, and attaches it to the application", async () => {
    const sample = createFakeSample({ reply: () => "I want to join Shopify because…", chunks: 2 });
    const db = await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Why Shopify?" } });
    expect((within(panel).getByRole("checkbox", { name: "Use STAR: outage" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Use Why Shopify" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("I want to join Shopify because…"));
    const prompt = String(sample.calls[0].input);
    expect(prompt).toContain("Why Shopify?");
    expect(prompt).toContain("Backend Engineer at Shopify");
    expect(prompt).toContain("We need Go and gRPC experience.");
    expect(prompt).toContain("the checkout went down");
    expect(prompt).toContain("Commerce at scale.");
    expect(prompt).toContain("Backend Engineer at Kakao");
    expect(prompt).not.toContain("@");
    fireEvent.change(within(panel).getByRole("textbox", { name: "Draft" }), { target: { value: "I want to join Shopify because of commerce." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Attach to application" }));
    await waitFor(async () => expect(((await db.doc("applications/app_1").get()).data() as unknown as Application).answerIds).toHaveLength(2));
    const answers = (await db.collection("answers").get()).docs.map((d) => d.data());
    const created = answers.find((a) => a?.title === "Why Shopify?" && a?.body === "I want to join Shopify because of commerce.");
    expect(created).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Draft with Claude" })).toBeNull();
  });

  it("hides every AI control when the sample capability is absent", async () => {
    await open("#/applications/app_1");
    await openTab("Answers");
    expect(screen.queryByRole("button", { name: "Draft with Claude" })).toBeNull();
    await openTab("Overview");
    expect(screen.queryByRole("button", { name: "Extract requirements" })).toBeNull();
  });

  it("keeps partial text and shows the message when the call fails", async () => {
    const sample = createFakeSample({ reply: () => "Half of an answer", error: { code: "upstream_error", message: "x", text: "Half of" } });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Q" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    expect((await within(panel).findByRole("alert")).textContent).toMatch(/interrupted/);
    expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("Half of");
  });

  it("extracts requirements from the job description into a checklist and appends it to the notes", async () => {
    const sample = createFakeSample({ json: () => ({ must: ["Go", "gRPC"], nice: ["Kubernetes"] }) });
    const db = await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    fireEvent.click(await screen.findByRole("button", { name: "Extract requirements" }));
    expect(await screen.findByRole("checkbox", { name: "Go" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Kubernetes" })).toBeTruthy();
    expect(String(sample.calls[0].input)).toContain("We need Go and gRPC experience.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Append to notes" }));
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("- [x] Go"));
    expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("- [ ] (nice) Kubernetes");
  });

  it("asks before closing the drawer while a draft is in progress", async () => {
    const sample = createFakeSample({ reply: () => "stuck mid-stream", pace: () => new Promise<void>(() => {}) });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Why Shopify?" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Stop" })).toBeTruthy());

    // Escape on the panel itself while a draft is busy: swallowed, the drawer stays, no confirm.
    fireEvent.keyDown(panel, { key: "Escape" });
    await act(async () => {});
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();

    // The explicit ✕ button goes through the drawer's close guard, which asks to confirm.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Discard the draft\?/);
    expect(within(dialog).getByRole("button", { name: "Discard draft" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Draft with Claude" })).toBeTruthy();
  });

  it("tailors an existing answer from its editor and saves the result as a new answer", async () => {
    const sample = createFakeSample({ reply: () => "Tailored version." });
    const db = await open("#/answers/an_2", { sample: Promise.resolve(sample) });
    fireEvent.click(await screen.findByRole("button", { name: "Tailor with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    expect((within(panel).getByRole("textbox", { name: "Question to answer" }) as HTMLInputElement).value).toBe("Why Shopify?");
    expect((within(panel).getByRole("checkbox", { name: "Use Why Shopify" }) as HTMLInputElement).checked).toBe(true);
    expect(within(panel).queryByRole("button", { name: "Attach to application" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("Tailored version."));
    fireEvent.click(within(panel).getByRole("button", { name: "Save as new answer" }));
    await waitFor(async () => expect((await db.collection("answers").get()).size).toBe(3));
  });

  it("disables Draft and explains when the prompt exceeds the budget", async () => {
    const jd = "We need Go and gRPC experience.";
    const profile = { ...defaultProfile(NOW), employment: [{ company: "Kakao", title: "Backend Engineer", start: "2021", end: "2024", summary: "Payments." }] };
    const min = new TextEncoder().encode(buildDraftPrompt({
      question: "Why Shopify?", company: "Shopify", role: "Backend Engineer",
      jobDescription: undefined, sources: [], profileSummary: undefined, language: "en", length: "medium",
    })).length;
    const max = new TextEncoder().encode(buildDraftPrompt({
      question: "Why Shopify?", company: "Shopify", role: "Backend Engineer",
      jobDescription: jd, sources: [{ title: "STAR: outage", body: "Situation: the checkout went down." }],
      profileSummary: profileSummary(profile), language: "en", length: "medium",
    })).length;
    expect(max).toBeGreaterThan(min);
    const sample = createFakeSample({ reply: () => "x", maxPromptBytes: Math.floor((min + max) / 2) });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Why Shopify?" } });
    expect((await within(panel).findByRole("status")).textContent).toMatch(/over the limit/);
    expect((within(panel).getByRole("button", { name: "Draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Include job description" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Include background summary" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Use STAR: outage" }));
    await waitFor(() => expect((within(panel).getByRole("button", { name: "Draft" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("asks before a second draft replaces edited text", async () => {
    const sample = createFakeSample({ reply: () => "First draft." });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Q" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("First draft."));
    fireEvent.change(within(panel).getByRole("textbox", { name: "Draft" }), { target: { value: "First draft, edited." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Replace your edits\?/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect((within(panel).getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("First draft, edited.");
    expect(sample.calls).toHaveLength(1);
  });

  it("replaces an existing requirements block in the notes instead of appending another", async () => {
    const sample = createFakeSample({ json: () => ({ must: ["Go"], nice: [] }) });
    const db = await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    fireEvent.click(await screen.findByRole("button", { name: "Extract requirements" }));
    await screen.findByRole("checkbox", { name: "Go" });
    fireEvent.click(screen.getByRole("button", { name: "Append to notes" }));
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("## Requirements"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Append to notes" }));
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.notes).toContain("- [x] Go"));
    const notes = String((await db.doc("applications/app_1").get()).data()?.notes);
    expect(notes.split("## Requirements")).toHaveLength(2);
  });

  it("asks before leaving through Manage the bank while a draft is in progress", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sample = createFakeSample({ reply: () => "slow", chunks: 2, pace: () => gate });
    await open("#/applications/app_1", { sample: Promise.resolve(sample) });
    await openTab("Answers");
    fireEvent.click(await screen.findByRole("button", { name: "Draft with Claude" }));
    const panel = screen.getByRole("region", { name: "Draft with Claude" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Question to answer" }), { target: { value: "Q" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Draft" }));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Stop" })).toBeTruthy());
    fireEvent.click(screen.getByRole("link", { name: "Manage the bank" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Discard the draft\?/);
    expect(within(dialog).getByRole("button", { name: "Discard draft" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(window.location.hash).toBe("#/applications/app_1");
    // Let the held-open stream finish inside act()'s wrapping instead of leaking a pending
    // state update past the end of the test (the fake sample's pace() gate resumes here).
    release();
    await waitFor(() => expect(within(panel).queryByRole("button", { name: "Stop" })).toBeNull());
  });
});
