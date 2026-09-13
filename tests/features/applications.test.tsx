import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Applications" });
  return db;
}

describe("Applications", () => {
  it("shows the final navigation order", async () => {
    await open("#/applications");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["Dashboard", "Applications", "Companies", "Contacts", "Assets", "Settings"]);
  });

  it("quick-adds an application, creating the company, and opens it", async () => {
    const db = await open("#/applications");
    fireEvent.click(screen.getByRole("button", { name: "New application" }));
    fireEvent.change(await screen.findByLabelText("Role title"), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Shopify" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(async () => expect((await db.collection("applications").get()).size).toBe(1));
    expect((await db.collection("companies").get()).docs[0].data()?.name).toBe("Shopify");
    expect(window.location.hash).toMatch(/^#\/applications\/app_/);
    expect((await screen.findAllByText("Backend Engineer")).length).toBeGreaterThan(0);
  });

  it("opens a row from the keyboard", async () => {
    const db = await open("#/applications");
    await act(async () => {
      await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", createdAt: NOW, updatedAt: NOW });
      await db.doc("applications/app_1").set({ id: "app_1", companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", tier: null, desire: null, fit: null, likelihood: null, needsSponsorship: null, sponsorshipOffered: null, answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 3, createdAt: NOW, updatedAt: NOW });
    });
    const row = (await screen.findByText("Backend Engineer")).closest("tr") as HTMLTableRowElement;
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(window.location.hash).toBe("#/applications/app_1");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("filters rows by text", async () => {
    const db = await open("#/applications");
    await act(async () => {
      await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", createdAt: NOW, updatedAt: NOW });
      await db.doc("applications/app_1").set({ id: "app_1", companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", tier: null, desire: null, fit: null, likelihood: null, needsSponsorship: null, sponsorshipOffered: null, answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 3, createdAt: NOW, updatedAt: NOW });
    });
    expect((await screen.findAllByText("Backend Engineer")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzz" } });
    expect(await screen.findByText(/No applications match/)).toBeTruthy();
  });
});
