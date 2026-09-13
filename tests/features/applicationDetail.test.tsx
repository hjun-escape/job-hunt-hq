import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultProfile, defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildCompany } from "../../src/domain/factories";
import type { AppPatch } from "../../src/features/applications/ApplicationDetail";
import { OverviewTab } from "../../src/features/applications/OverviewTab";
import { Repository } from "../../src/store/repository";
import { createStore } from "../../src/store/store";
import { AppContext } from "../../src/store/context";
import { ToastProvider } from "../../src/ui/Toast";
import type { Application } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";

async function open() {
  const db = createFakeDb();
  await db.doc("settings/main").set(defaultSettings("America/Toronto", NOW) as unknown as Record<string, unknown>);
  await db.doc("profile/main").set(defaultProfile(NOW) as unknown as Record<string, unknown>);
  await db.doc("companies/co_1").set(buildCompany({ name: "Shopify" }, "co_1", NOW) as unknown as Record<string, unknown>);
  await db.doc("applications/app_1").set(
    buildApplication({ companyId: "co_1", title: "Backend Engineer", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3 }, "app_1", NOW) as unknown as Record<string, unknown>,
  );
  window.location.hash = "#/applications/app_1";
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db) }} />);
  await screen.findByRole("dialog");
  const stored = async () => (await db.doc("applications/app_1").get()).data() as unknown as Application | undefined;
  return { db, stored };
}

describe("ApplicationDetail", () => {
  it("changes status from the header and shows it in the activity tab", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Application status"), { target: { value: "interviewing" } });
    await waitFor(async () => expect((await stored())?.statusId).toBe("interviewing"));
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(await screen.findByText(/Applied → Interviewing/)).toBeTruthy();
  });

  it("edits fields on the overview tab, including clearing one", async () => {
    const { stored } = await open();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Senior Backend Engineer" } });
    fireEvent.blur(title);
    await waitFor(async () => expect((await stored())?.title).toBe("Senior Backend Engineer"));
    const city = screen.getByLabelText("City");
    fireEvent.change(city, { target: { value: "Toronto" } });
    fireEvent.blur(city);
    await waitFor(async () => expect((await stored())?.city).toBe("Toronto"));
    fireEvent.change(city, { target: { value: "" } });
    fireEvent.blur(city);
    await waitFor(async () => expect(await stored()).not.toHaveProperty("city"));
    fireEvent.click(screen.getByRole("button", { name: "Desire 4" }));
    await waitFor(async () => expect((await stored())?.desire).toBe(4));
  });

  it("sets a date-only deadline in the chosen zone", async () => {
    const { stored } = await open();
    fireEvent.change(screen.getByLabelText("Deadline timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Deadline date"), { target: { value: "2026-10-01" } });
    await waitFor(async () => expect((await stored())?.deadline).toEqual({ at: "2026-10-01T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true }));
  });

  it("logs a note and deletes after confirmation", async () => {
    const { stored } = await open();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "emailed recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(async () => expect((await stored())?.activity.at(-1)?.text).toBe("emailed recruiter"));
    fireEvent.click(screen.getByRole("button", { name: "Delete application" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await stored()).toBeUndefined());
    expect(window.location.hash).toBe("#/applications");
  });

  it("keeps Overview field labels unique while the toolbar is visible", async () => {
    await open();
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(screen.getByLabelText("Channel")).toBeTruthy();
    expect(screen.getByLabelText("Filter by country")).toBeTruthy();
    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
  });

  it("computes a tag addition on the overview tab from the current record, not the one it rendered", async () => {
    const modifySpy = vi.spyOn(Repository.prototype, "modify");
    try {
      const { db } = await open();
      const tagsInput = screen.getByLabelText("Tags");
      fireEvent.change(tagsInput, { target: { value: "urgent" } });
      fireEvent.keyDown(tagsInput, { key: "Enter" });
      const call = modifySpy.mock.calls.find(([collection, docId]) => collection === "applications" && docId === "app_1");
      expect(call).toBeTruthy();
      expect(typeof call?.[2]).toBe("function");
      await waitFor(async () => {
        const a = (await db.doc("applications/app_1").get()).data() as unknown as Application;
        expect(a.tags).toEqual(["urgent"]);
      });
    } finally {
      modifySpy.mockRestore();
    }
  });

  it("wires tabs to panels and moves between them with arrow keys", async () => {
    await open(); // the file's existing helper: seeds an application and opens its detail on the Overview tab
    const overview = screen.getByRole("tab", { name: "Overview" });
    const panel = screen.getByRole("tabpanel");
    expect(overview.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(overview.id);
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Interviews" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Interviews" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("tabindex")).toBe("-1");
  });
});

describe("OverviewTab compensation patch", () => {
  it("computes the comp patch from the current record, not the one it rendered", async () => {
    const app = buildApplication({ companyId: "co_1", title: "SWE", countryId: "CA", channelId: "linkedin", statusId: "applied" }, "app_1", NOW);
    app.comp = { currency: "CAD", period: "year", note: "rendered note" };
    const settings = defaultSettings("America/Toronto", NOW);
    const store = createStore({
      ready: true,
      readOnly: false,
      settings,
      profile: null,
      applications: { [app.id]: app },
      companies: {},
      contacts: {},
      assets: {},
      answers: {},
      interviews: {},
      prep: {},
    });
    const repo = new Repository(null, store);
    const patch = vi.fn<(p: AppPatch) => Promise<boolean>>().mockResolvedValue(true);

    render(
      <AppContext.Provider value={{ store, repo, caps: absentCapabilities() }}>
        <ToastProvider>
          <OverviewTab app={app} patch={patch} />
        </ToastProvider>
      </AppContext.Provider>,
    );
    await act(async () => {});
    const min = screen.getByLabelText("Min");
    fireEvent.change(min, { target: { value: "100000" } });
    fireEvent.blur(min);

    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0][0];
    expect(typeof arg).toBe("function");

    // A sibling write landed between render and this commit: `cur.comp` now differs from the
    // `app.comp` this tab rendered. The patch must be built from `cur`, not from that stale render.
    const cur: Application = { ...app, comp: { currency: "USD", period: "month", note: "current note" } };
    const result = (arg as (c: Application) => Partial<Application>)(cur);
    expect(result.comp).toMatchObject({ currency: "USD", period: "month", note: "current note", min: 100000 });
  });
});
