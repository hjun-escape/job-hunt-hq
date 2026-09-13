import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import type { Profile } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open() {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  window.location.hash = "#/profile";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("heading", { name: "Profile" });
  const stored = async () => (await db.doc("profile/main").get()).data() as unknown as Profile;
  return { db, stored };
}

describe("Profile", () => {
  it("saves identity fields and an education row", async () => {
    const { stored } = await open();
    const name = screen.getByLabelText("Full name");
    fireEvent.change(name, { target: { value: "Ada Lovelace" } });
    fireEvent.blur(name);
    await waitFor(async () => expect((await stored()).name).toBe("Ada Lovelace"));
    fireEvent.click(screen.getByRole("button", { name: "Add education" }));
    const school = await screen.findByLabelText("Education 1 School");
    fireEvent.change(school, { target: { value: "UofT" } });
    fireEvent.blur(school);
    await waitFor(async () => expect((await stored()).education[0]?.school).toBe("UofT"));
  });

  it("saves work authorization per country and copies the form sentence", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Canada sponsorship needed"), { target: { value: "no" } });
    await waitFor(async () => expect((await stored()).workAuth.CA.needsSponsorship).toBe(false));
    const sentence = screen.getByLabelText("Canada form sentence");
    fireEvent.change(sentence, { target: { value: "I am a permanent resident of Canada and do not require sponsorship." } });
    fireEvent.blur(sentence);
    await waitFor(async () => expect((await stored()).workAuth.CA.formSentence).toMatch(/permanent resident/));
    fireEvent.click(screen.getByRole("button", { name: "Copy Canada form sentence" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("I am a permanent resident of Canada and do not require sponsorship."));
  });

  it("saves salary expectations per country", async () => {
    const { stored } = await open();
    const min = screen.getByLabelText("Korea salary min");
    fireEvent.change(min, { target: { value: "70000000" } });
    fireEvent.blur(min);
    await waitFor(async () => expect((await stored()).salaryExpectations.KR).toMatchObject({ min: 70000000, currency: "KRW" }));
  });
});
