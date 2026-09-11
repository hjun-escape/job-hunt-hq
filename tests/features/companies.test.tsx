import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string, seed?: (db: ReturnType<typeof createFakeDb>) => Promise<void>) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Companies" });
  return db;
}

describe("Companies", () => {
  it("creates a company and opens its editor", async () => {
    const db = await open("#/companies");
    fireEvent.change(screen.getByLabelText("New company"), { target: { value: "Shopify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Shopify");
    await waitFor(async () => expect((await db.collection("companies").get()).size).toBe(1));
    expect(window.location.hash).toMatch(/^#\/companies\/co_/);
  });

  it("renames from the editor and blocks deletion while applications reference it", async () => {
    const db = await open("#/companies/co_1", async (d) => {
      await d.doc("companies/co_1").set(buildCompany({ name: "Old Name" }, "co_1", NOW) as unknown as Record<string, unknown>);
      await d.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "saved" }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "New Name" } });
    fireEvent.blur(name);
    await waitFor(async () => expect((await db.doc("companies/co_1").get()).data()?.name).toBe("New Name"));
    const del = screen.getByRole("button", { name: "Delete company" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(screen.getByText("SWE")).toBeTruthy();
  });

  it("deletes an unreferenced company after confirmation", async () => {
    const db = await open("#/companies/co_2", async (d) => {
      await d.doc("companies/co_2").set(buildCompany({ name: "Lonely" }, "co_2", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete company" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.doc("companies/co_2").get()).exists).toBe(false));
    expect(window.location.hash).toBe("#/companies");
  });
});
