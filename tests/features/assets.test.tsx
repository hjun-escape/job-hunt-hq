import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeDownloads } from "../../src/capabilities/downloads";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildAsset } from "../../src/domain/factories";
import { Repository } from "../../src/store/repository";
import type { AssetDoc } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>, heading = "Assets", seedAssets?: (assets: ReturnType<typeof createFakeAssets>) => Promise<void>, assetsInstance?: ReturnType<typeof createFakeAssets>, downloads?: ReturnType<typeof createFakeDownloads>) {
  const db = createFakeDb();
  const assets = assetsInstance ?? createFakeAssets();
  if (seedAssets) await seedAssets(assets);
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db), assets: Promise.resolve(assets), ...(downloads ? { downloads: Promise.resolve(downloads) } : {}) }} />);
  await screen.findByRole("heading", { name: heading });
  return { db, assets };
}

describe("Assets", () => {
  it("creates an asset record and opens it", async () => {
    const { db } = await open("#/assets");
    fireEvent.change(screen.getByLabelText("New asset kind"), { target: { value: "cover-letter" } });
    fireEvent.change(screen.getByLabelText("New asset name"), { target: { value: "Shopify cover letter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("assets").get()).size).toBe(1));
    expect(window.location.hash).toMatch(/^#\/assets\/as_/);
  });

  it("uploads a PDF onto the record, then removes it", async () => {
    const { db, assets } = await open("#/assets/as_1", async (d) => {
      await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
    });
    await screen.findByRole("dialog");
    const file = new File([new Uint8Array(20)], "Backend_Resume.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [file] } });
    await waitFor(async () => {
      const a = (await db.doc("assets/as_1").get()).data() as unknown as AssetDoc;
      expect(a.file).toMatchObject({ fileName: "Backend_Resume.pdf", sizeBytes: 20, contentType: "application/pdf" });
    });
    expect((await assets.list()).usage.files).toBe(1);
    expect(within(screen.getByRole("dialog")).getByText(/Backend_Resume\.pdf/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open file" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(async () => expect(((await db.doc("assets/as_1").get()).data() as unknown as AssetDoc).file).toBeUndefined());
    await waitFor(async () => expect((await assets.list()).usage.files).toBe(0));
  });

  it("rejects a Word file with a message and never uploads it", async () => {
    const { assets } = await open("#/assets/as_1", async (d) => {
      await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "R" }, "as_1", NOW));
    });
    await screen.findByRole("dialog");
    const docx = new File([new Uint8Array(5)], "cv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [docx] } });
    expect(await screen.findByText(/Word files are not accepted/)).toBeTruthy();
    expect((await assets.list()).usage.files).toBe(0);
  });

  it("blocks deleting a record that an application uses", async () => {
    await open("#/assets/as_1", async (d) => {
      await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "R" }, "as_1", NOW));
      await put(d, "applications/app_1", buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", resumeAssetId: "as_1" }, "app_1", NOW));
    });
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: "Delete asset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the storage meter on the Settings page and refreshes on demand", async () => {
    const { assets } = await open("#/settings", undefined, "Settings", async (a) => {
      await a.upload(new Blob([new Uint8Array(1024)], { type: "application/pdf" }));
    });
    expect(await screen.findByText(/1 file/)).toBeTruthy();
    await assets.upload(new Blob([new Uint8Array(2048)], { type: "application/pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh storage usage" }));
    expect(await screen.findByText(/2 files/)).toBeTruthy();
  });

  it("defaults the new asset's kind to the first non-archived entry", async () => {
    const s = defaultSettings("America/Toronto", NOW);
    s.pickLists.assetKinds = s.pickLists.assetKinds.map((k, i) => (i === 0 ? { ...k, archived: true } : k));
    const { db } = await open("#/assets", async (d) => { await put(d, "settings/main", s); });
    fireEvent.change(screen.getByLabelText("New asset name"), { target: { value: "Backend resume" } });
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    await screen.findByRole("dialog");
    await waitFor(async () => expect((await db.collection("assets").get()).size).toBe(1));
    const openKinds = s.pickLists.assetKinds.filter((k) => !k.archived);
    const added = (await db.collection("assets").get()).docs[0].data() as unknown as AssetDoc;
    expect(added.kindId).toBe(openKinds[0].id);
  });

  it("computes the target-country selection from the current record, not the one it rendered", async () => {
    const modifySpy = vi.spyOn(Repository.prototype, "modify");
    try {
      const { db } = await open("#/assets/as_1", async (d) => {
        await put(d, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW));
      });
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByRole("button", { name: "Canada" }));
      const call = modifySpy.mock.calls.find(([collection, docId]) => collection === "assets" && docId === "as_1");
      expect(call).toBeTruthy();
      expect(typeof call?.[2]).toBe("function");
      await waitFor(async () => {
        const a = (await db.doc("assets/as_1").get()).data() as unknown as AssetDoc;
        expect(a.targetCountryIds).toEqual(["CA"]);
      });
    } finally {
      modifySpy.mockRestore();
    }
  });

  it("shows the screen-rate of applications that use the asset as their resume", async () => {
    await open("#/assets/as_1", async (db) => {
      await db.doc("assets/as_1").set(buildAsset({ kindId: "resume", name: "Backend resume" }, "as_1", NOW) as unknown as Record<string, unknown>);
      await db.doc("companies/co_1").set({ id: "co_1", name: "Shopify", cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", createdAt: NOW, updatedAt: NOW });
      await db.doc("applications/a").set(buildApplication({ companyId: "co_1", title: "A", countryId: "CA", channelId: "linkedin", statusId: "screening", maxStageRank: 4, resumeAssetId: "as_1" }, "a", NOW) as unknown as Record<string, unknown>);
      await db.doc("applications/b").set(buildApplication({ companyId: "co_1", title: "B", countryId: "CA", channelId: "linkedin", statusId: "applied", maxStageRank: 3, resumeAssetId: "as_1" }, "b", NOW) as unknown as Record<string, unknown>);
    });
    await screen.findByRole("dialog");
    expect(screen.getByText("Screen-rate 50%: 1 of 2 applications using this resume reached Screening.")).toBeTruthy();
  });

  it("keeps the file row visible and flags a missing file after a HEAD 404", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ status: 404 }) as Response) as unknown as typeof fetch;
    try {
      await open("#/assets/as_1", async (db) => {
        await db.doc("assets/as_1").set(buildAsset({ kindId: "resume", name: "Backend resume", file: { assetId: "a".repeat(32), fileName: "r.pdf", sizeBytes: 10, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW) as unknown as Record<string, unknown>);
      });
      await screen.findByRole("dialog");
      expect(await screen.findByText("file missing")).toBeTruthy();
      expect(within(screen.getByRole("dialog")).getByText(/r\.pdf/)).toBeTruthy();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("deletes the record before the stored file", async () => {
    let recordGoneFirst: boolean | null = null;
    const assets = createFakeAssets();
    const { db } = await open("#/assets/as_1", async (d) => {
      const up = await assets.upload(new Blob(["%PDF-1.4"], { type: "application/pdf" }), { type: "application/pdf" });
      await d.doc("assets/as_1").set(buildAsset({ kindId: "resume", name: "Doomed", file: { assetId: up.id, fileName: "d.pdf", sizeBytes: 8, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW) as unknown as Record<string, unknown>);
    }, "Assets", undefined, assets);
    const realDelete = assets.delete.bind(assets);
    assets.delete = async (id: string) => { recordGoneFirst = !(await db.doc("assets/as_1").get()).exists; return realDelete(id); };
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(recordGoneFirst).toBe(true));
  });
  /** The /_blob/ path only resolves inside the artifact frame: a new tab gets "not found". The file is
   * fetched in-frame and handed to the downloads capability instead. */
  it("saves the stored file through the downloads capability instead of opening a new tab", async () => {
    const original = globalThis.fetch;
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      (init?.method === "HEAD" ? { status: 200, ok: true } : { status: 200, ok: true, blob: async () => pdf }) as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const downloads = createFakeDownloads();
    try {
      await open("#/assets/as_1", async (db) => {
        await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume", file: { assetId: "b".repeat(32), fileName: "Backend_Resume.pdf", sizeBytes: 8, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW));
      }, "Assets", undefined, undefined, downloads);
      await screen.findByRole("dialog");
      expect(screen.queryByRole("link", { name: "Open file" })).toBeNull();
      fireEvent.click(await screen.findByRole("button", { name: "Download file" }));
      await waitFor(() => expect(downloads.saved).toHaveLength(1));
      expect(downloads.saved[0].filename).toBe("Backend_Resume.pdf");
      expect(downloads.saved[0].raw).toBe(pdf);
      const gets = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method !== "HEAD").map((c) => String(c[0]));
      expect(gets).toEqual([`/_blob/${"b".repeat(32)}`]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("saves under the file's base name when the stored name carries a folder", async () => {
    const original = globalThis.fetch;
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    globalThis.fetch = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) =>
      (init?.method === "HEAD" ? { status: 200, ok: true } : { status: 200, ok: true, blob: async () => pdf }) as Response) as unknown as typeof fetch;
    const downloads = createFakeDownloads();
    try {
      await open("#/assets/as_1", async (db) => {
        await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "ML resume", file: { assetId: "c".repeat(32), fileName: "anthropic-fellows/resume.pdf", sizeBytes: 8, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW));
      }, "Assets", undefined, undefined, downloads);
      await screen.findByRole("dialog");
      fireEvent.click(await screen.findByRole("button", { name: "Download file" }));
      await waitFor(() => expect(downloads.saved).toHaveLength(1));
      expect(downloads.saved[0].filename).toBe("resume.pdf");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("explains when saving is unavailable instead of offering a dead button", async () => {
    await open("#/assets/as_1", async (db) => {
      await put(db, "assets/as_1", buildAsset({ kindId: "resume", name: "Backend resume", file: { assetId: "d".repeat(32), fileName: "r.pdf", sizeBytes: 8, contentType: "application/pdf", uploadedAt: NOW } }, "as_1", NOW));
    });
    await screen.findByRole("dialog");
    expect(await screen.findByText("Saving files is not available in this view.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download file" })).toBeNull();
  });
});
