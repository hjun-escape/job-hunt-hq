import { describe, it, expect } from "vitest";
import { buildApplication, buildAsset } from "../../src/domain/factories";
import { assetUsage, assetsOfKind, formatBytes, isAssetReferenced } from "../../src/domain/assets";

const NOW = "2026-09-11T00:00:00.000Z";
const apps = [
  buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", resumeAssetId: "as_1", coverLetterAssetId: "as_2" }, "app_1", NOW),
  buildApplication({ companyId: "co", title: "B", countryId: "CA", channelId: "linkedin", statusId: "saved", resumeAssetId: "as_1" }, "app_2", NOW),
];
const assets = [buildAsset({ kindId: "resume", name: "R" }, "as_1", NOW), buildAsset({ kindId: "cover-letter", name: "C" }, "as_2", NOW), buildAsset({ kindId: "cv", name: "V" }, "as_3", NOW)];

describe("assets domain", () => {
  it("filters by kinds", () => {
    expect(assetsOfKind(assets, ["resume", "cv"]).map((a) => a.id)).toEqual(["as_1", "as_3"]);
  });
  it("reports usage and references", () => {
    expect(assetUsage("as_1", apps).asResume.map((a) => a.id)).toEqual(["app_1", "app_2"]);
    expect(assetUsage("as_2", apps).asCoverLetter.map((a) => a.id)).toEqual(["app_1"]);
    expect(isAssetReferenced("as_3", apps)).toBe(false);
  });
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
