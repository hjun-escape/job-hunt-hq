import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";
import { absentCapabilities } from "../../src/capabilities/types";
import { createFakeDb } from "../../src/capabilities/fakeDb";

describe("App", () => {
  it("renders read-only with a banner when db is absent", async () => {
    render(<App capabilities={absentCapabilities()} />);
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/unavailable/i);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("connects to a db and shows pipeline cards without a banner", async () => {
    const caps = { ...absentCapabilities(), db: Promise.resolve(createFakeDb()) };
    render(<App capabilities={caps} />);
    expect(await screen.findByText("Total")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Interviewing")).toBeTruthy();
  });

  it("marks the active nav item with aria-current", async () => {
    const caps = { ...absentCapabilities(), db: Promise.resolve(createFakeDb()) };
    window.location.hash = "#/";
    render(<App capabilities={caps} />);
    await screen.findByText("Total");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Applications" }).getAttribute("aria-current")).toBeNull();
  });
});
