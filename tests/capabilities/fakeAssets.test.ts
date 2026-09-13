import { describe, it, expect } from "vitest";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";

describe("createFakeAssets", () => {
  it("uploads, lists with usage, and deletes", async () => {
    const assets = createFakeAssets({ maxFiles: 2, maxBytes: 1000 });
    const a = await assets.upload(new Blob([new Uint8Array(100)], { type: "application/pdf" }));
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.contentType).toBe("application/pdf");
    const listed = await assets.list();
    expect(listed.usage).toEqual({ files: 1, bytes: 100, maxFiles: 2, maxBytes: 1000 });
    expect((await assets.delete(a.id)).deleted).toBe(true);
    expect((await assets.delete(a.id)).deleted).toBe(false);
  });
  it("rejects unsupported types, empty blobs and quota overruns with contract codes", async () => {
    const assets = createFakeAssets({ maxFiles: 1, maxBytes: 150 });
    await expect(assets.upload(new Blob(["x"], { type: "text/rtf" }))).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(assets.upload(new Blob([], { type: "application/pdf" }))).rejects.toMatchObject({ code: "invalid_request" });
    await assets.upload(new Blob([new Uint8Array(100)], { type: "application/pdf" }));
    await expect(assets.upload(new Blob([new Uint8Array(10)], { type: "application/pdf" }))).rejects.toMatchObject({ code: "quota_or_state" });
  });
});
