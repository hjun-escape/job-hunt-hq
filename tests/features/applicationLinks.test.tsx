import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication, buildAsset, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";
import type { Application, Interview } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open() {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "profile/main", defaultProfile(NOW));
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW));
  await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
  await put(db, "assets/as_2", buildAsset({ kindId: "cover-letter", name: "Shopify letter" }, "as_2", NOW));
  await put(db, "contacts/ct_1", buildContact({ name: "Dana Kim", relationshipId: "recruiter", companyId: "co_1" }, "ct_1", NOW));
  await put(db, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why Shopify", body: "Commerce at scale." }, "an_1", NOW));
  await put(db, "interviews/iv_1", buildInterview({ applicationId: "app_1", roundTypeId: "recruiter-screen" }, "iv_1", NOW));
  window.location.hash = "#/applications/app_1";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("dialog");
  const stored = async () => (await db.doc("applications/app_1").get()).data() as unknown as Application;
  return { db, stored };
}

describe("Application links", () => {
  it("links a resume, cover letter and recruiter from the overview", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Resume version"), { target: { value: "as_1" } });
    fireEvent.change(screen.getByLabelText("Cover letter"), { target: { value: "as_2" } });
    fireEvent.change(screen.getByLabelText("Recruiter"), { target: { value: "ct_1" } });
    await waitFor(async () => expect(await stored()).toMatchObject({ resumeAssetId: "as_1", coverLetterAssetId: "as_2", recruiterContactId: "ct_1" }));
    expect((screen.getByLabelText("Resume version") as HTMLSelectElement).options.length).toBe(2);
  });

  it("attaches and detaches an answer from the Answers tab", async () => {
    const { stored } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Answers" }));
    fireEvent.change(await screen.findByLabelText("Attach answer"), { target: { value: "an_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await waitFor(async () => expect((await stored()).answerIds).toEqual(["an_1"]));
    expect(await screen.findByText("Why Shopify")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Detach Why Shopify" }));
    await waitFor(async () => expect((await stored()).answerIds).toEqual([]));
  });

  it("lists rounds and adds one from the Interviews tab", async () => {
    const { db } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Interviews" }));
    expect(await screen.findByText("Recruiter screen", { selector: ".chip" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Round type to add"), { target: { value: "coding" } });
    fireEvent.click(screen.getByRole("button", { name: "Add round" }));
    await waitFor(async () => expect((await db.collection("interviews").get()).size).toBe(2));
    const added = (await db.collection("interviews").get()).docs.map((d) => d.data() as unknown as Interview).find((i) => i.roundTypeId === "coding");
    expect(added?.applicationId).toBe("app_1");
    expect(window.location.hash).toMatch(/^#\/interviews\/iv_/);
  });
});
