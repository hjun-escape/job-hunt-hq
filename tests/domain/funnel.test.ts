import { describe, it, expect } from "vitest";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication } from "../../src/domain/factories";
import { funnel, funnelBy, openStages, screenRate } from "../../src/domain/funnel";

const NOW = "2026-09-14T00:00:00.000Z";
const settings = defaultSettings("America/Toronto", NOW);
const app = (id: string, statusId: string, maxStageRank: number, extra: Partial<Parameters<typeof buildApplication>[0]> = {}) =>
  buildApplication({ companyId: "co_1", title: id, countryId: "CA", channelId: "linkedin", statusId, maxStageRank, ...extra }, id, NOW);

describe("funnel", () => {
  it("lists open stages in rank order and never won or lost ones", () => {
    const stages = openStages(settings);
    expect(stages.map((s) => s.id)).toEqual(["saved", "preparing", "applied", "screening", "oa", "interviewing", "final", "offer", "negotiating"]);
  });

  it("counts every application that reached a stage, including ones lost later, with stage-to-stage conversion", () => {
    const apps = [app("a", "applied", 3), app("b", "screening", 4), app("c", "rejected", 4), app("d", "saved", 1)];
    const f = funnel(apps, openStages(settings));
    const by = Object.fromEntries(f.map((s) => [s.id, s]));
    expect(by.saved.reached).toBe(4);
    expect(by.applied.reached).toBe(3);
    expect(by.screening.reached).toBe(2);
    expect(by.oa.reached).toBe(0);
    expect(by.saved.conversion).toBeNull();
    expect(by.applied.conversion).toBeCloseTo(3 / 3);
    expect(by.screening.conversion).toBeCloseTo(2 / 3);
    expect(by.oa.conversion).toBeCloseTo(0);
    expect(by.interviewing.conversion).toBeNull(); // nothing reached the previous stage
  });

  it("groups by channel or by resume version", () => {
    const apps = [app("a", "screening", 4), app("b", "applied", 3, { channelId: "referral", resumeAssetId: "as_1" }), app("c", "screening", 4, { resumeAssetId: "as_1" })];
    const byChannel = funnelBy(apps, openStages(settings), "channel");
    expect([...byChannel.keys()].sort()).toEqual(["linkedin", "referral"]);
    expect(byChannel.get("linkedin")!.find((s) => s.id === "screening")!.reached).toBe(2);
    const byResume = funnelBy(apps, openStages(settings), "resume");
    expect([...byResume.keys()].sort()).toEqual(["", "as_1"]);
    expect(byResume.get("as_1")!.find((s) => s.id === "applied")!.reached).toBe(2);
  });

  it("computes the screen-rate as the share that reached Screening, or null without a screening stage or applications", () => {
    const stages = openStages(settings);
    expect(screenRate([app("a", "screening", 4), app("b", "applied", 3)], stages)).toBeCloseTo(0.5);
    expect(screenRate([], stages)).toBeNull();
    expect(screenRate([app("a", "screening", 4)], stages.filter((s) => s.id !== "screening"))).toBeNull();
  });
});
