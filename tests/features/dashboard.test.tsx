import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DateTime } from "luxon";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildAsset, buildCompany, buildContact, buildInterview } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";
const TZ = "America/Toronto";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);
const today = DateTime.utc().setZone(TZ).startOf("day");
const dateOnly = (d: DateTime) => ({ at: d.endOf("day").toUTC().toISO() as string, tz: TZ, dateOnly: true });

async function open(seed: (db: ReturnType<typeof createFakeDb>) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings(TZ, NOW));
  await seed(db);
  window.location.hash = "#/";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Dashboard" });
  return db;
}
const app = (id: string, extra: Partial<Parameters<typeof buildApplication>[0]> = {}) =>
  buildApplication({ companyId: "co_1", title: `Role ${id}`, countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3, ...extra }, id, NOW);

describe("Dashboard", () => {
  it("lists what is due this week and what is overdue, linking to the application", async () => {
    await open(async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "applications/due", app("due", { deadline: dateOnly(today.plus({ days: 2 })) }));
      await put(db, "applications/late", app("late", { nextAction: "Send thank-you", nextActionDue: today.minus({ days: 3 }).toISODate() as string }));
    });
    const due = screen.getByRole("region", { name: "Due this week" });
    expect(within(due).getByText("Shopify · Role due")).toBeTruthy();
    expect(within(due).getByRole("link", { name: /Role due/ }).getAttribute("href")).toBe("#/applications/due");
    const late = screen.getByRole("region", { name: "Overdue" });
    expect(within(late).getByText("Next action: Send thank-you")).toBeTruthy();
  });

  it("shows upcoming interviews in the home zone and follow-up flags", async () => {
    await open(async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "applications/a", app("a", { recruiterContactId: "ct_1" }));
      await put(db, "contacts/ct_1", buildContact({ name: "Dana Park", relationshipId: "recruiter" }, "ct_1", NOW));
      await put(db, "interviews/iv1", buildInterview({ applicationId: "a", roundTypeId: "coding", scheduledAt: { at: today.plus({ days: 1 }).set({ hour: 14 }).toUTC().toISO() as string, tz: TZ } }, "iv1", NOW));
    });
    const upcoming = screen.getByRole("region", { name: "Upcoming interviews" });
    expect(within(upcoming).getByRole("link", { name: /Shopify · Role a/ }).getAttribute("href")).toBe("#/interviews/iv1");
    expect(within(upcoming).getByText(/14:00/)).toBeTruthy();
    const flags = screen.getByRole("region", { name: "Follow-ups" });
    expect(within(flags).getByRole("link", { name: "Dana Park" }).getAttribute("href")).toBe("#/contacts/ct_1");
    expect(within(flags).getByText("Never contacted")).toBeTruthy();
  });

  it("draws the funnel with reached counts and regroups by channel or resume version", async () => {
    await open(async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
      await put(db, "applications/a", app("a", { maxStageRank: 4, statusId: "screening", resumeAssetId: "as_1" }));
      await put(db, "applications/b", app("b", { maxStageRank: 3, channelId: "referral" }));
      await put(db, "applications/c", app("c", { maxStageRank: 4, statusId: "rejected" }));
    });
    const funnel = screen.getByRole("region", { name: "Funnel" });
    expect(within(funnel).getByText("Saved: 3 reached")).toBeTruthy();
    expect(within(funnel).getByText("Applied: 3 reached · 100%")).toBeTruthy();
    expect(within(funnel).getByText("Screening: 2 reached · 67%")).toBeTruthy();
    fireEvent.click(within(funnel).getByRole("radio", { name: "By channel" }));
    expect(within(funnel).getByRole("heading", { name: "LinkedIn" })).toBeTruthy();
    expect(within(funnel).getByRole("heading", { name: "Referral" })).toBeTruthy();
    fireEvent.click(within(funnel).getByRole("radio", { name: "By resume version" }));
    expect(within(funnel).getByRole("heading", { name: "Backend resume" })).toBeTruthy();
    expect(within(funnel).getByRole("heading", { name: "No resume linked" })).toBeTruthy();
  });

  it("keeps the pipeline cards and shows empty states", async () => {
    await open(async () => {});
    expect(screen.getByText("Total")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Due this week" })).getByText("Nothing due in the next seven days.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Funnel" })).getByText("No applications yet.")).toBeTruthy();
  });
});
