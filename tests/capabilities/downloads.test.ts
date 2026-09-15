import { describe, it, expect } from "vitest";
import { createFakeDownloads, describeDownloadsError, saveText } from "../../src/capabilities/downloads";

describe("downloads helper", () => {
  it("saves text through the capability and reports success", async () => {
    const fake = createFakeDownloads();
    expect(await saveText(fake, "a.csv", "x,y")).toBe(true);
    expect(fake.saved).toEqual([{ filename: "a.csv", data: "x,y", raw: "x,y" }]);
  });

  it("treats a decline as a quiet false and maps other codes to viewer copy", async () => {
    expect(await saveText(createFakeDownloads({ fail: { code: "declined", message: "" } }), "a.json", "{}")).toBe(false);
    await expect(saveText(createFakeDownloads({ fail: { code: "rejected_extension", message: "" } }), "a.exe", "")).rejects.toThrow(/cannot be saved/);
    expect(describeDownloadsError({ code: "rate_limited", message: "" })).toMatch(/already open/);
    expect(describeDownloadsError({ code: "declined", message: "" })).toBeNull();
    expect(describeDownloadsError({ code: "weird", message: "" })).toMatch(/Could not save/);
  });
});
