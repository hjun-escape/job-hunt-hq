import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import { kanbanColumns } from "../../src/domain/kanban";

const NOW = "2026-09-14T00:00:00.000Z";
const settings = defaultSettings("America/Toronto", NOW);
const app = (id: string, statusId: string, extra: Partial<Parameters<typeof buildApplication>[0]> = {}, updatedAt = NOW) =>
  ({ ...buildApplication({ companyId: "co_1", title: id, countryId: "CA", channelId: "linkedin", statusId, ...extra }, id, NOW), updatedAt });

describe("kanbanColumns", () => {
  it("orders open columns by stage, hides closed groups unless asked, and ranks cards by score then recency", () => {
    const apps = [app("low", "saved", { desire: 1, fit: 1, likelihood: 1 }), app("high", "saved", { desire: 5, fit: 5, likelihood: 5 }), app("newer", "saved", {}, "2026-09-15T00:00:00.000Z"), app("older", "saved"), app("won", "accepted"), app("lost", "rejected")];
    const open = kanbanColumns(apps, settings, false);
    expect(open.map((c) => c.status.id)).toEqual(["saved", "preparing", "applied", "screening", "oa", "interviewing", "final", "offer", "negotiating"]);
    expect(open[0].apps.map((a) => a.id)).toEqual(["high", "low", "newer", "older"]);
    const all = kanbanColumns(apps, settings, true);
    expect(all.map((c) => c.status.id).slice(-4)).toEqual(["accepted", "rejected", "withdrawn", "ghosted"]);
    expect(all.find((c) => c.status.id === "rejected")!.apps.map((a) => a.id)).toEqual(["lost"]);
  });

  it("keeps an archived status column only while an application still sits in it", () => {
    const s = { ...settings, pickLists: { ...settings.pickLists, statuses: settings.pickLists.statuses.map((st) => (st.id === "oa" ? { ...st, archived: true } : st)) } };
    expect(kanbanColumns([], s, false).some((c) => c.status.id === "oa")).toBe(false);
    expect(kanbanColumns([app("x", "oa")], s, false).some((c) => c.status.id === "oa")).toBe(true);
  });
});
