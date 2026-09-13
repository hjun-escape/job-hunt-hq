import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Company } from "../../src/domain/types";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { Repository } from "../../src/store/repository";

const NOW = "2026-09-11T00:00:00.000Z";
const put = (db: ReturnType<typeof createFakeDb>, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

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

  it("keeps a country's sponsorship policy when only its note is edited", async () => {
    const db = await open("#/companies/co_3", async (d) => {
      await d.doc("companies/co_3").set(buildCompany({ name: "Sponsor Co" }, "co_3", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    const stored = async () => (await db.doc("companies/co_3").get()).data() as unknown as Company;
    fireEvent.change(screen.getByLabelText("Canada sponsorship"), { target: { value: "yes" } });
    await waitFor(async () => expect((await stored()).sponsorship.CA?.policy).toBe("yes"));
    const note = screen.getByLabelText("Canada note");
    fireEvent.change(note, { target: { value: "LMIA in the past" } });
    fireEvent.blur(note);
    await waitFor(async () => expect((await stored()).sponsorship.CA).toEqual({ policy: "yes", note: "LMIA in the past" }));
  });

  it("filters rows by search", async () => {
    await open("#/companies", async (d) => {
      await d.doc("companies/co_shop").set(buildCompany({ name: "Shopify" }, "co_shop", NOW) as unknown as Record<string, unknown>);
      await d.doc("companies/co_kakao").set(buildCompany({ name: "Kakao" }, "co_kakao", NOW) as unknown as Record<string, unknown>);
    });
    expect(screen.getByText("Shopify")).toBeTruthy();
    expect(screen.getByText("Kakao")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "shop" } });
    expect(screen.getByText("Shopify")).toBeTruthy();
    expect(screen.queryByText("Kakao")).toBeNull();
  });

  it("lists the company's contacts in the editor", async () => {
    await open("#/companies/co_1", async (d) => {
      await put(d, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await d.doc("contacts/ct_1").set({ id: "ct_1", name: "Dana Kim", relationshipId: "recruiter", companyId: "co_1", notes: "", createdAt: NOW, updatedAt: NOW });
    });
    await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Dana Kim" }).getAttribute("href")).toBe("#/contacts/ct_1");
  });

  it("renders only http(s) sources as links", async () => {
    await open("#/companies/co_1", async (d) => {
      await put(d, "companies/co_1", buildCompany({ name: "Shopify", sources: [{ label: "Blind", url: "https://teamblind.com/x" }, { label: "Bad", url: "javascript:alert(1)" }] }, "co_1", NOW));
    });
    await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Blind" }).getAttribute("href")).toBe("https://teamblind.com/x");
    expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
    expect(screen.getByText("Bad")).toBeTruthy();
  });

  it("computes the sponsorship policy write from the current record, not the one it rendered", async () => {
    const modifySpy = vi.spyOn(Repository.prototype, "modify");
    try {
      await open("#/companies/co_4", async (d) => {
        await put(d, "companies/co_4", buildCompany({ name: "Spy Co" }, "co_4", NOW));
      });
      await screen.findByRole("dialog");
      fireEvent.change(screen.getByLabelText("Canada sponsorship"), { target: { value: "yes" } });
      await waitFor(() => {
        const call = modifySpy.mock.calls.find(([collection, docId]) => collection === "companies" && docId === "co_4");
        expect(call).toBeTruthy();
        expect(typeof call?.[2]).toBe("function");
      });
    } finally {
      modifySpy.mockRestore();
    }
  });
});
