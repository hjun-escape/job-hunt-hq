import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";

// Finding 1: a terminal storage error before settings/profile arrive used to leave the
// store with settings: null / profile: null while marking ready: true. Shell then rendered
// a page, every page called useSettings(), which threw, and with no error boundary React
// unmounted the whole root -- a blank page, no alert, no recovery.
describe("degraded rendering", () => {
  it("shows the banner and the dashboard instead of blanking when every collection subscription errors terminally", async () => {
    const db = createFakeDb();
    const dieImmediately = (_next: unknown, error?: (e: DbError) => void) => {
      error?.({ code: "revoked", message: "gone" });
      return () => {};
    };
    // A revoked grant terminates every listener -- settings and profile included -- so the
    // seeded-defaults path never runs and the only source of non-null settings/profile is fail().
    const broken = {
      doc: (path: string) => ({ ...db.doc(path), onSnapshot: dieImmediately }) as unknown as DocumentReference,
      collection: (path: string) => ({ ...db.collection(path), onSnapshot: dieImmediately }) as unknown as CollectionReference,
    } as unknown as DB;
    window.location.hash = "#/";
    render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(broken) }} />);
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/unavailable/i);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });
});
