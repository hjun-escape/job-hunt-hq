import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany, buildContact } from "../../src/domain/factories";
import type { Contact } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Contacts" });
  return db;
}

describe("Contacts", () => {
  it("creates a contact from the toolbar and opens its editor", async () => {
    const db = await open("#/contacts");
    fireEvent.change(screen.getByLabelText("New contact name"), { target: { value: "Dana Kim" } });
    fireEvent.change(screen.getByLabelText("New contact relationship"), { target: { value: "recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Dana Kim");
    await waitFor(async () => expect((await db.collection("contacts").get()).size).toBe(1));
    expect(window.location.hash).toMatch(/^#\/contacts\/ct_/);
  });

  it("flags follow-ups that are due and shows the reference block only for references", async () => {
    await open("#/contacts/ct_1", async (db) => {
      await put(db, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(db, "applications/app_1", buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "referral", statusId: "applied", referrerContactId: "ct_1" }, "app_1", NOW));
      await put(db, "contacts/ct_1", buildContact({ name: "Dana Kim", relationshipId: "referrer", lastContactedAt: "2026-01-01" }, "ct_1", NOW));
    });
    await screen.findByRole("dialog");
    expect(screen.getAllByText(/Follow up/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Consent given on")).toBeNull();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "reference" } });
    expect(await screen.findByLabelText("Consent given on")).toBeTruthy();
  });

  it("blocks deleting a contact that an application references, and deletes an unreferenced one", async () => {
    const db = await open("#/contacts/ct_1", async (d) => {
      await put(d, "applications/app_1", buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "referral", statusId: "applied", recruiterContactId: "ct_1" }, "app_1", NOW));
      await put(d, "contacts/ct_1", buildContact({ name: "Linked", relationshipId: "recruiter" }, "ct_1", NOW));
      await put(d, "contacts/ct_2", buildContact({ name: "Loose", relationshipId: "peer" }, "ct_2", NOW));
    });
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: "Delete contact" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { window.location.hash = "#/contacts/ct_2"; });
    await screen.findByText("Loose", { selector: ".drawer-title *, .drawer-title" });
    fireEvent.click(screen.getByRole("button", { name: "Delete contact" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.doc("contacts/ct_2").get()).exists).toBe(false));
    expect(window.location.hash).toBe("#/contacts");
  });

  it("saves a reference's consent date and usage from the editor", async () => {
    const db = await open("#/contacts/ct_r", async (d) => {
      await put(d, "companies/co_1", buildCompany({ name: "Shopify" }, "co_1", NOW));
      await put(d, "applications/app_1", buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW));
      await put(d, "contacts/ct_r", buildContact({ name: "Prof. Lee", relationshipId: "reference" }, "ct_r", NOW));
    });
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Consent given on"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Used for application"), { target: { value: "app_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record use" }));
    await waitFor(async () => {
      const c = (await db.doc("contacts/ct_r").get()).data() as unknown as Contact;
      expect(c.reference).toEqual({ consentAt: "2026-09-01", usedInApplicationIds: ["app_1"] });
    });
  });
});

  it("does not carry one reference's data into another when switching contacts", async () => {
    const db = await open("#/contacts/ct_a", async (d) => {
      await put(d, "contacts/ct_a", buildContact({ name: "Ref A", relationshipId: "reference", reference: { consentAt: "2026-01-01", usedInApplicationIds: ["app_x"] } }, "ct_a", NOW));
      await put(d, "contacts/ct_b", buildContact({ name: "Ref B", relationshipId: "reference" }, "ct_b", NOW));
    });
    await screen.findByRole("dialog");
    await act(async () => { window.location.hash = "#/contacts/ct_b"; });
    await screen.findByText("Ref B", { selector: ".drawer-title" });
    fireEvent.change(screen.getByLabelText("Last told to expect a call"), { target: { value: "2026-09-10" } });
    await waitFor(async () => {
      const b = (await db.doc("contacts/ct_b").get()).data() as unknown as Contact;
      expect(b.reference).toEqual({ usedInApplicationIds: [], lastNotifiedAt: "2026-09-10" });
    });
  });

  it("defaults the new contact's relationship to the first non-archived entry", async () => {
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.contactRelationships = s.pickLists.contactRelationships.map((r, i) => (i === 0 ? { ...r, archived: true } : r));
    const db = await open("#/contacts", async (d) => { await put(d, "settings/main", s); });
    fireEvent.change(screen.getByLabelText("New contact name"), { target: { value: "Dana Kim" } });
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("contacts").get()).size).toBe(1));
    const openRels = s.pickLists.contactRelationships.filter((r) => !r.archived);
    const added = (await db.collection("contacts").get()).docs[0].data() as unknown as Contact;
    expect(added.relationshipId).toBe(openRels[0].id);
  });
