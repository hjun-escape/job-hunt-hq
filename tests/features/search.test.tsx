import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication, buildCompany, buildContact } from "../../src/domain/factories";

const NOW = "2026-09-11T00:00:00.000Z";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, heading: string) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
  await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW));
  await put(db, "contacts/ct_1", buildContact({ name: "Dana Shop", relationshipId: "recruiter", companyId: "co_1" }, "ct_1", NOW));
  await put(db, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why Shopify" }, "an_1", NOW));
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: heading });
  return db;
}

describe("Global search", () => {
  it("submits the search box to the results route and lists grouped hits with links", async () => {
    await open("#/applications", "Applications");
    const box = screen.getByRole("searchbox", { name: "Search everything" });
    fireEvent.change(box, { target: { value: "shop" } });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(window.location.hash).toBe("#/search?q=shop");
    await screen.findByRole("heading", { name: "Search results" });
    expect(within(screen.getByRole("region", { name: "Companies" })).getByRole("link", { name: "Shopify" }).getAttribute("href")).toBe("#/companies/co_1");
    expect(within(screen.getByRole("region", { name: "Applications" })).getByRole("link", { name: /Backend Engineer/ }).getAttribute("href")).toBe("#/applications/app_1");
    expect(within(screen.getByRole("region", { name: "Contacts" })).getByRole("link", { name: "Dana Shop" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Answers" })).getByRole("link", { name: "Why Shopify" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Applications" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows an empty state and keeps the query in the box when nothing matches", async () => {
    await open("#/search?q=zzz", "Search results");
    expect(screen.getByText("No matches for “zzz”.")).toBeTruthy();
    expect((screen.getByRole("searchbox", { name: "Search everything" }) as HTMLInputElement).value).toBe("zzz");
  });
});
