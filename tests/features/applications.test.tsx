import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { loadColumnPrefs } from "../../src/features/applications/columnPrefs";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string, seed?: (db: ReturnType<typeof createFakeDb>) => Promise<void>) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  if (seed) await seed(db);
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
    expect(labels).toEqual(["Dashboard", "Applications", "Companies", "Contacts", "Interviews", "Assets", "Answers", "Prep", "Profile", "Settings"]);
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

  it("blocks quick-add when every open status is archived", async () => {
    const db = createFakeDb();
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.statuses = s.pickLists.statuses.map((st) => (st.group === "open" ? { ...st, archived: true } : st));
    await db.doc("settings/main").set(s as unknown as Record<string, unknown>);
    window.location.hash = "#/applications";
    render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
    await screen.findByRole("heading", { name: "Applications" });
    fireEvent.click(screen.getByRole("button", { name: "New application" }));
    expect(await screen.findByText(/no open status/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("filters by sponsorship and by tag", async () => {
    await open("#/applications", async (db) => {
      await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await db.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "Needs visa", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: true, tags: ["remote"] }, "app_1", NOW) as unknown as Record<string, unknown>);
      await db.doc("applications/app_2").set(buildApplication({ companyId: "co_1", title: "No visa", countryId: "CA", channelId: "linkedin", statusId: "applied", needsSponsorship: false }, "app_2", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByText("Needs visa");
    fireEvent.change(screen.getByLabelText("Filter by sponsorship"), { target: { value: "needs" } });
    expect(screen.queryByText("No visa")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by sponsorship"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "remote" } });
    expect(screen.getByText("Needs visa")).toBeTruthy();
    expect(screen.queryByText("No visa")).toBeNull();
  });

  it("hides a column from the chooser and remembers the choice", async () => {
    localStorage.clear();
    await open("#/applications");
    expect(screen.getByRole("button", { name: "Channel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Channel column" }));
    expect(screen.queryByRole("button", { name: "Channel" })).toBeNull();
    expect(loadColumnPrefs()).not.toContain("channel");
    expect((screen.getByRole("checkbox", { name: "Show Company column" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("board view groups cards by status and moves them by drop or by the move select", async () => {
    const db = await open("#/applications?view=board", async (d) => {
      await d.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await d.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "Backend", countryId: "CA", channelId: "linkedin", statusId: "saved", maxStageRank: 1 }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    const saved = await screen.findByRole("region", { name: "Saved" });
    expect(within(saved).getByText("Backend")).toBeTruthy();
    fireEvent.drop(screen.getByRole("region", { name: "Applied" }), { dataTransfer: { getData: () => "app_1" } });
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.statusId).toBe("applied"));
    expect(within(screen.getByRole("region", { name: "Applied" })).getByText("Backend")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Move Shopify · Backend to"), { target: { value: "interviewing" } });
    await waitFor(async () => expect((await db.doc("applications/app_1").get()).data()?.maxStageRank).toBe(6));
    fireEvent.click(within(screen.getByRole("region", { name: "Interviewing" })).getByText("Backend"));
    expect(window.location.hash).toBe("#/applications/app_1?view=board");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("switches between table and board views from the toolbar", async () => {
    await open("#/applications");
    expect(screen.getByRole("button", { name: "Board view" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Board view" }));
    expect(window.location.hash).toBe("#/applications?view=board");
    expect(await screen.findByRole("region", { name: "Saved" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(window.location.hash).toBe("#/applications");
  });
});
