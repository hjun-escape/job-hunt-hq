import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { createFakeDownloads } from "../../src/capabilities/downloads";
import { absentCapabilities, type Capabilities } from "../../src/capabilities/types";
import { buildBackup } from "../../src/domain/backup";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import { Repository } from "../../src/store/repository";
import type { Settings } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open(hash: string, seed?: (db: ReturnType<typeof createFakeDb>) => Promise<void>, extra: Partial<Capabilities> = {}) {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db), ...extra }} />);
  await screen.findByRole("heading", { name: "Settings" });
  return db;
}

describe("SettingsPage", () => {
  it("saves a cadence change on blur", async () => {
    const db = await open("#/settings");
    const input = screen.getByLabelText("Follow-up cadence (days)");
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    await waitFor(async () => expect((await db.doc("settings/main").get()).data()?.followUpCadenceDays).toBe(10), { timeout: 3000 });
  });

  it("adds an exchange rate", async () => {
    const db = await open("#/settings");
    fireEvent.change(screen.getByLabelText("Currency code"), { target: { value: "usd" } });
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "1.36" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    await waitFor(async () => expect(((await db.doc("settings/main").get()).data() as unknown as Settings).fxRates.USD).toBe(1.36));
  });

  it("adds a pick-list entry with a slug id", async () => {
    const db = await open("#/settings");
    fireEvent.change(screen.getByLabelText("List"), { target: { value: "channels" } });
    fireEvent.change(screen.getByLabelText("New entry"), { target: { value: "Hacker News" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(async () => {
      const s = (await db.doc("settings/main").get()).data() as unknown as Settings;
      expect(s.pickLists.channels.some((c) => c.id === "hacker-news" && c.label === "Hacker News")).toBe(true);
    });
  });

  it("blocks deleting a status that records use", async () => {
    await open("#/settings", async (db) => {
      await db.doc("applications/app_1").set(buildApplication({ companyId: "co_1", title: "x", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW) as unknown as Record<string, unknown>);
    });
    const del = screen.getByRole("button", { name: "Delete applied" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    const free = screen.getByRole("button", { name: "Delete ghosted" }) as HTMLButtonElement;
    expect(free.disabled).toBe(false);
  });

  it("shows the new list's labels after switching to a list that shares an id", async () => {
    const db = await open("#/settings");
    const label = () => screen.getByLabelText("Label final") as HTMLInputElement;
    expect(label().value).toBe("Final round");
    fireEvent.change(screen.getByLabelText("List"), { target: { value: "roundTypes" } });
    expect(label().value).toBe("Final");
    fireEvent.blur(label());
    const s = (await db.doc("settings/main").get()).data() as unknown as Settings;
    expect(s.pickLists.roundTypes.find((e) => e.id === "final")?.label).toBe("Final");
    expect(s.pickLists.statuses.find((e) => e.id === "final")?.label).toBe("Final round");
  });

  it("explains an invalid exchange rate and an empty pick-list label", async () => {
    await open("#/settings");
    fireEvent.change(screen.getByLabelText("Currency code"), { target: { value: "usd" } });
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    expect(await screen.findByRole("alert", { name: /rate/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert", { name: /label/i })).toBeTruthy();
  });

  it("moves the last pick-list entry by identity, not by its rendered index", async () => {
    const modifySpy = vi.spyOn(Repository.prototype, "modifySettings");
    try {
      const db = await open("#/settings");
      const base = defaultSettings("America/Toronto", NOW);
      const originalIndex = base.pickLists.statuses.findIndex((s) => s.id === "ghosted");

      fireEvent.click(screen.getByRole("button", { name: "Move up ghosted" }));
      expect(modifySpy).toHaveBeenCalledTimes(1);
      const updater = modifySpy.mock.calls[0][0] as (cur: Settings) => Partial<Settings>;

      // Simulate a document that already reflects one prior "move up" for ghosted -- e.g. a
      // fast double-click on the same button whose first write already landed. Ghosted now
      // sits one position higher than the list this test's click was rendered from.
      const statuses = [...base.pickLists.statuses];
      [statuses[originalIndex - 1], statuses[originalIndex]] = [statuses[originalIndex], statuses[originalIndex - 1]];
      const cur: Settings = { ...base, pickLists: { ...base.pickLists, statuses } };

      const patch = updater(cur);
      const nextStatuses = patch.pickLists?.statuses ?? [];
      const newIndex = nextStatuses.findIndex((s) => s.id === "ghosted");
      // Applied on top of the already-moved list, a second "move up" for the same entry
      // should land it two positions above where it started -- not swap it back to where
      // it began, which is what happens when the update re-uses the stale rendered index.
      expect(newIndex).toBe(originalIndex - 2);

      // Let the real click's write (against the actual current settings, untouched by the
      // simulated `cur` above) settle so no state update escapes this test unflushed.
      await waitFor(async () => {
        const s = (await db.doc("settings/main").get()).data() as unknown as Settings;
        expect(s.pickLists.statuses.findIndex((x) => x.id === "ghosted")).toBe(originalIndex - 1);
      });
    } finally {
      modifySpy.mockRestore();
    }
  });

  it("downloads a backup and a CSV through the downloads capability", async () => {
    const downloads = createFakeDownloads();
    await open("#/settings", async (db) => { await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>); }, { downloads: Promise.resolve(downloads) });
    fireEvent.click(await screen.findByRole("button", { name: "Download backup (JSON)" }));
    await waitFor(() => expect(downloads.saved).toHaveLength(1));
    expect(downloads.saved[0].filename).toMatch(/^job-hunt-hq-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(downloads.saved[0].data)).toMatchObject({ app: "job-hunt-hq", companies: [{ name: "Shopify" }] });
    fireEvent.change(screen.getByLabelText("Collection to export"), { target: { value: "companies" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(downloads.saved).toHaveLength(2));
    expect(downloads.saved[1].filename).toMatch(/^job-hunt-hq-companies-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloads.saved[1].data).toContain("Shopify");
  });

  it("hides the export buttons when downloads are unavailable", async () => {
    await open("#/settings");
    await screen.findByRole("heading", { name: "Backup and restore" });
    expect(screen.queryByRole("button", { name: "Download backup (JSON)" })).toBeNull();
    expect(screen.getByText(/Downloads are not available in this view/)).toBeTruthy();
  });

  it("validates a restore file, shows problems, and merges a valid one", async () => {
    const db = await open("#/settings");
    const input = screen.getByLabelText("Restore from backup") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([JSON.stringify({ app: "other" })], "bad.json", { type: "application/json" })] } });
    expect((await screen.findByRole("alert", { name: "Backup problems" })).textContent).toMatch(/not a Job Hunt HQ backup/);
    const backup = buildBackup({ settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW), applications: {}, companies: { co_imp: buildCompany({ name: "Imported Co" }, "co_imp", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, NOW);
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], "good.json", { type: "application/json" })] } });
    expect(await screen.findByText(/good\.json: 0 applications, 1 companies/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(async () => expect((await db.doc("companies/co_imp").get()).data()?.name).toBe("Imported Co"));
  });

  it("replace mode deletes current records after a typed confirmation", async () => {
    const db = await open("#/settings", async (d) => { await d.doc("companies/co_old").set(buildCompany({ name: "Old" }, "co_old", NOW) as unknown as Record<string, unknown>); });
    const backup = buildBackup({ settings: defaultSettings("America/Toronto", NOW), profile: defaultProfile(NOW), applications: {}, companies: { co_imp: buildCompany({ name: "Imported Co" }, "co_imp", NOW) }, contacts: {}, assets: {}, answers: {}, interviews: {}, prep: {} }, NOW);
    fireEvent.change(screen.getByLabelText("Restore from backup"), { target: { files: [new File([JSON.stringify(backup)], "good.json", { type: "application/json" })] } });
    await screen.findByText(/good\.json/);
    fireEvent.click(screen.getByRole("radio", { name: "Replace everything" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "REPLACE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(async () => expect((await db.doc("companies/co_old").get()).exists).toBe(false));
    expect((await db.doc("companies/co_imp").get()).exists).toBe(true);
  });
});
