import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { todayIso } from "../../src/domain/dates";
import { buildPrep } from "../../src/domain/factories";
import type { PrepItem } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Prep" });
  return db;
}

describe("Prep", () => {
  it("creates an item and logs an attempt", async () => {
    const db = await open("#/prep");
    fireEvent.change(screen.getByLabelText("New prep title"), { target: { value: "Two Sum" } });
    fireEvent.click(screen.getByRole("button", { name: "Add prep item" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Log attempt" }));
    await waitFor(async () => {
      const p = (await db.collection("prep").get()).docs[0].data() as unknown as PrepItem;
      expect(p.attempts).toBe(1);
      expect(p.lastAttemptedAt).toBe(todayIso("America/Toronto"));
    });
  });

  it("filters by kind and edits confidence", async () => {
    const db = await open("#/prep/pr_2", async (d) => {
      await put(d, "prep/pr_1", buildPrep({ kindId: "coding", title: "Two Sum" }, "pr_1", NOW));
      await put(d, "prep/pr_2", buildPrep({ kindId: "system-design", title: "Rate limiter" }, "pr_2", NOW));
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Confidence 4" }));
    await waitFor(async () => expect(((await db.doc("prep/pr_2").get()).data() as unknown as PrepItem).confidence).toBe(4));
    fireEvent.change(screen.getByLabelText("Filter by kind"), { target: { value: "coding" } });
    expect(screen.queryByText("Two Sum", { selector: "td strong" })).toBeTruthy();
    expect(screen.queryByText("Rate limiter", { selector: "td strong" })).toBeNull();
  });

  it("defaults the new prep item's kind to the first non-archived entry", async () => {
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.prepKinds = s.pickLists.prepKinds.map((k, i) => (i === 0 ? { ...k, archived: true } : k));
    const db = await open("#/prep", async (d) => { await put(d, "settings/main", s); });
    fireEvent.change(screen.getByLabelText("New prep title"), { target: { value: "Two Sum" } });
    fireEvent.click(screen.getByRole("button", { name: "Add prep item" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("prep").get()).size).toBe(1));
    const openKinds = s.pickLists.prepKinds.filter((k) => !k.archived);
    const added = (await db.collection("prep").get()).docs[0].data() as unknown as PrepItem;
    expect(added.kindId).toBe(openKinds[0].id);
  });
});
