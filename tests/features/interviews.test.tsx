import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";
import type { Interview } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "interviewing", maxStageRank: 6 }, "app_1", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Interviews" });
  return db;
}

describe("Interviews", () => {
  it("adds a round for an application from the toolbar", async () => {
    const db = await open("#/interviews");
    fireEvent.change(screen.getByLabelText("New round application"), { target: { value: "app_1" } });
    fireEvent.change(screen.getByLabelText("New round type"), { target: { value: "system-design" } });
    fireEvent.click(screen.getByRole("button", { name: "Add round" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("interviews").get()).size).toBe(1));
    const iv = (await db.collection("interviews").get()).docs[0].data() as unknown as Interview;
    expect(iv).toMatchObject({ applicationId: "app_1", roundTypeId: "system-design", outcome: "pending" });
    expect(window.location.hash).toMatch(/^#\/interviews\/iv_/);
  });

  it("schedules in Seoul time, picks interviewers, and manages the checklist", async () => {
    const db = await open("#/interviews/iv_1", async (d) => {
      await put(d, "contacts/ct_1", buildContact({ name: "Dana Kim", relationshipId: "interviewer", companyId: "co_1" }, "ct_1", NOW));
      await put(d, "interviews/iv_1", buildInterview({ applicationId: "app_1", roundTypeId: "coding" }, "iv_1", NOW));
    });
    await screen.findByRole("dialog");
    const stored = async () => (await db.doc("interviews/iv_1").get()).data() as unknown as Interview;
    fireEvent.change(screen.getByLabelText("Scheduled timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Scheduled date and time"), { target: { value: "2026-10-01T14:00" } });
    await waitFor(async () => expect((await stored()).scheduledAt).toEqual({ at: "2026-10-01T05:00:00.000Z", tz: "Asia/Seoul" }));
    fireEvent.click(screen.getByRole("button", { name: "Dana Kim" }));
    await waitFor(async () => expect((await stored()).interviewerContactIds).toEqual(["ct_1"]));
    fireEvent.change(screen.getByLabelText("New checklist item"), { target: { value: "Review consistent hashing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(async () => expect((await stored()).prepChecklist.map((c) => c.text)).toEqual(["Review consistent hashing"]));
    fireEvent.click(screen.getByLabelText("Review consistent hashing"));
    await waitFor(async () => expect((await stored()).prepChecklist[0].done).toBe(true));
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "passed" } });
    await waitFor(async () => expect((await stored()).outcome).toBe("passed"));
  });

  it("shows rounds under their week bucket and deletes after confirmation", async () => {
    const db = await open("#/interviews", async (d) => {
      await put(d, "interviews/iv_1", buildInterview({ applicationId: "app_1", roundTypeId: "coding" }, "iv_1", NOW));
    });
    expect(await screen.findByRole("heading", { name: "Not scheduled" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Coding interview/ }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete round" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.doc("interviews/iv_1").get()).exists).toBe(false));
  });

  it("defaults the new round's type to the first non-archived entry", async () => {
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.roundTypes = s.pickLists.roundTypes.map((r, i) => (i === 0 ? { ...r, archived: true } : r));
    const db = await open("#/interviews", async (d) => { await put(d, "settings/main", s); });
    fireEvent.change(screen.getByLabelText("New round application"), { target: { value: "app_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add round" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("interviews").get()).size).toBe(1));
    const openTypes = s.pickLists.roundTypes.filter((r) => !r.archived);
    const added = (await db.collection("interviews").get()).docs[0].data() as unknown as Interview;
    expect(added.roundTypeId).toBe(openTypes[0].id);
  });
});
