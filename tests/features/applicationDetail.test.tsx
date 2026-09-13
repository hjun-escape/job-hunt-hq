import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { Application } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open() {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  await db.doc("profile/main").set(defaultProfile(NOW) as unknown as Record<string, unknown>);
  await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
  await db.doc("applications/app_1").set(
    buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) as unknown as Record<string, unknown>,
  );
  window.location.hash = "#/applications/app_1";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("dialog");
  const stored = async () => (await db.doc("applications/app_1").get()).data() as unknown as Application | undefined;
  return { db, stored };
}

describe("ApplicationDetail", () => {
  it("changes status from the header and shows it in the activity tab", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Application status"), { target: { value: "interviewing" } });
    await waitFor(async () => expect((await stored())?.statusId).toBe("interviewing"));
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(await screen.findByText(/Applied → Interviewing/)).toBeTruthy();
  });

  it("edits fields on the overview tab, including clearing one", async () => {
    const { stored } = await open();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Senior Backend Engineer" } });
    fireEvent.blur(title);
    await waitFor(async () => expect((await stored())?.title).toBe("Senior Backend Engineer"));
    const city = screen.getByLabelText("City");
    fireEvent.change(city, { target: { value: "Toronto" } });
    fireEvent.blur(city);
    await waitFor(async () => expect((await stored())?.city).toBe("Toronto"));
    fireEvent.change(city, { target: { value: "" } });
    fireEvent.blur(city);
    await waitFor(async () => expect(await stored()).not.toHaveProperty("city"));
    fireEvent.click(screen.getByRole("button", { name: "Desire 4" }));
    await waitFor(async () => expect((await stored())?.desire).toBe(4));
  });

  it("sets a date-only deadline in the chosen zone", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Deadline timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Deadline date"), { target: { value: "2026-10-01" } });
    await waitFor(async () => expect((await stored())?.deadline).toEqual({ at: "2026-10-01T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true }));
  });

  it("logs a note and deletes after confirmation", async () => {
    const { stored } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "emailed recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(async () => expect((await stored())?.activity.at(-1)?.text).toBe("emailed recruiter"));
    fireEvent.click(screen.getByRole("button", { name: "Delete application" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await stored()).toBeUndefined());
    expect(window.location.hash).toBe("#/applications");
  });
});
