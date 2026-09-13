import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildAnswer, buildApplication } from "../../src/domain/factories";
import type { Answer } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>) {
  const db = createFakeDb();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Answers" });
  return db;
}

describe("Answers", () => {
  it("creates an answer and edits its body", async () => {
    const db = await open("#/answers");
    fireEvent.change(screen.getByLabelText("New answer title"), { target: { value: "Why Shopify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    await screen.findByRole("dialog");
    const body = screen.getByLabelText("Body");
    fireEvent.change(body, { target: { value: "Because **commerce**." } });
    fireEvent.blur(body);
    await waitFor(async () => {
      const list = (await db.collection("answers").get()).docs.map((d) => d.data() as unknown as Answer);
      expect(list[0]?.body).toBe("Because **commerce**.");
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByText("commerce")).tagName).toBe("STRONG");
  });

  it("copies the body to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open("#/answers/an_1", async (d) => {
      await put(d, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why us", body: "Scale and craft." }, "an_1", NOW));
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Scale and craft."));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("filters by theme and blocks deleting an answer an application uses", async () => {
    await open("#/answers/an_1", async (d) => {
      await put(d, "answers/an_1", buildAnswer({ kindId: "answer", title: "Why us", themeIds: ["why-company"] }, "an_1", NOW));
      await put(d, "answers/an_2", buildAnswer({ kindId: "star", title: "Outage", themeIds: ["failure"] }, "an_2", NOW));
      await put(d, "applications/app_1", buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", answerIds: ["an_1"] }, "app_1", NOW));
    });
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: "Delete answer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Filter by theme"), { target: { value: "failure" } });
    expect(screen.getAllByText("Outage").length).toBeGreaterThan(0);
    expect(screen.queryByText("Why us", { selector: "td strong" })).toBeNull();
  });

  it("defaults the new answer's kind to the first non-archived entry", async () => {
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.answerKinds = s.pickLists.answerKinds.map((k, i) => (i === 0 ? { ...k, archived: true } : k));
    const db = await open("#/answers", async (d) => { await put(d, "settings/main", s); });
    fireEvent.change(screen.getByLabelText("New answer title"), { target: { value: "Why Shopify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("answers").get()).size).toBe(1));
    const openKinds = s.pickLists.answerKinds.filter((k) => !k.archived);
    const added = (await db.collection("answers").get()).docs[0].data() as unknown as Answer;
    expect(added.kindId).toBe(openKinds[0].id);
  });
});
