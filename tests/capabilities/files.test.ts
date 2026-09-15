import { createFakeDownloads } from "../../src/capabilities/downloads";
import { describe, it, expect } from "vitest";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";
import { FileError, blobUrl, describeAssetError, downloadFileName, saveStoredFile, uploadDocument, validateDocument } from "../../src/capabilities/files";

const pdf = (name = "resume.pdf", bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

describe("validateDocument", () => {
  it("accepts pdf and images, rejects word files, empty and oversized files", () => {
    expect(validateDocument(pdf())).toBeNull();
    expect(validateDocument(new File([new Uint8Array(3)], "a.png", { type: "image/png" }))).toBeNull();
    expect(validateDocument(new File([new Uint8Array(3)], "cv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toMatch(/Word files/);
    expect(validateDocument(new File([], "empty.pdf", { type: "application/pdf" }))).toMatch(/empty/);
    const big = { name: "big.pdf", type: "application/pdf", size: 21 * 1024 * 1024 } as File;
    expect(validateDocument(big)).toMatch(/over 20 MB/);
  });
});

describe("uploadDocument", () => {
  it("uploads and returns a StoredFile block", async () => {
    const assets = createFakeAssets();
    const stored = await uploadDocument(assets, pdf("Ada_Resume.pdf", 42), () => "2026-09-13T00:00:00.000Z");
    expect(stored).toMatchObject({ fileName: "Ada_Resume.pdf", sizeBytes: 42, contentType: "application/pdf", uploadedAt: "2026-09-13T00:00:00.000Z" });
    expect(stored.assetId).toMatch(/^[0-9a-f]{32}$/);
    expect(blobUrl(stored.assetId)).toBe(`/_blob/${stored.assetId}`);
  });
  it("turns platform errors into user text and retries once on store_unavailable", async () => {
    const assets = createFakeAssets();
    await expect(uploadDocument(assets, new File([new Uint8Array(3)], "x.txt", { type: "text/rtf" }))).rejects.toBeInstanceOf(FileError);
    let calls = 0;
    const flaky = { ...assets, upload: async (b: Blob, o?: { type?: string }) => { calls++; if (calls === 1) throw { code: "store_unavailable", message: "blip" }; return assets.upload(b, o); } };
    const stored = await uploadDocument(flaky, pdf());
    expect(calls).toBe(2);
    expect(stored.sizeBytes).toBe(10);
    await expect(uploadDocument({ ...assets, upload: async () => { throw { code: "quota_or_state", message: "" }; } }, pdf())).rejects.toMatchObject({ code: "quota_or_state", message: expect.stringMatching(/storage is full/i) });
  });
  it("describes every documented code", () => {
    for (const code of ["too_large", "unsupported_type", "quota_or_state", "rate_limited", "upstream_auth", "store_unavailable", "not_granted", "nope"]) {
      expect(describeAssetError({ code, message: "" }).length).toBeGreaterThan(10);
    }
  });
});

describe("saveStoredFile", () => {
  const file = { assetId: "a".repeat(32), fileName: "docs/Backend_Resume.pdf", sizeBytes: 8, contentType: "application/pdf", uploadedAt: "2026-09-15T00:00:00.000Z" };
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  const ok = async () => ({ ok: true, status: 200, blob: async () => pdf }) as unknown as Response;

  it("fetches /_blob/<id> and offers the bytes under the base name", async () => {
    const fake = createFakeDownloads();
    const calls: string[] = [];
    expect(await saveStoredFile(fake, file, async (u) => { calls.push(u); return ok(); })).toBe(true);
    expect(calls).toEqual([`/_blob/${"a".repeat(32)}`]);
    expect(fake.saved).toEqual([{ filename: "Backend_Resume.pdf", data: "[object Blob]", raw: pdf }]);
  });

  it("strips folders and falls back to a name when the stored name is empty", () => {
    expect(downloadFileName("anthropic-fellows/resume.pdf")).toBe("resume.pdf");
    expect(downloadFileName("C:\\Users\\me\\cv.pdf")).toBe("cv.pdf");
    expect(downloadFileName("   ")).toBe("file");
  });

  it("explains a network failure before the fetch resolves", async () => {
    await expect(saveStoredFile(createFakeDownloads(), file, async () => { throw new TypeError("Failed to fetch"); })).rejects.toThrow(/Check your connection/);
  });

  it("explains a body read that fails mid-stream the same way", async () => {
    const broken = async () => ({ ok: true, status: 200, blob: async () => { throw new TypeError("network error"); } }) as unknown as Response;
    await expect(saveStoredFile(createFakeDownloads(), file, broken)).rejects.toThrow(/Check your connection/);
  });

  it("reports a deleted file on 404 and a generic retry on other statuses", async () => {
    await expect(saveStoredFile(createFakeDownloads(), file, async () => ({ ok: false, status: 404 }) as Response)).rejects.toThrow(/no longer in storage/);
    await expect(saveStoredFile(createFakeDownloads(), file, async () => ({ ok: false, status: 500 }) as Response)).rejects.toThrow(/Try again/);
  });

  it("treats a decline as a quiet false and maps other download codes to viewer copy", async () => {
    expect(await saveStoredFile(createFakeDownloads({ fail: { code: "declined", message: "" } }), file, ok)).toBe(false);
    await expect(saveStoredFile(createFakeDownloads({ fail: { code: "rejected_extension", message: "" } }), file, ok)).rejects.toThrow(/cannot be saved/);
  });
});
