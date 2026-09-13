import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App";
import { createFakeAssets } from "../../src/capabilities/fakeAssets";
import { createFakeDb } from "../../src/capabilities/fakeDb";
import { absentCapabilities } from "../../src/capabilities/types";
import { defaultSettings } from "../../src/domain/defaults";
import { buildApplication, buildAsset } from "../../src/domain/factories";
import type { AssetDoc } from "../../src/domain/types";

const NOW = "2026-09-11T00:00:00.000Z";
type Db = ReturnType<typeof createFakeDb>;
const put = (db: Db, path: string, doc: object) => db.doc(path).set(doc as unknown as Record<string, unknown>);

async function open(hash: string, seed?: (db: Db) => Promise<void>, heading = "Assets") {
  const db = createFakeDb();
  const assets = createFakeAssets();
  await put(db, "settings/main", defaultSettings("America/Toronto", NOW));
  if (seed) await seed(db);
  window.location.hash = hash;
  render(<App capabilities={{ ...absentCapabilities(), db: Promise.resolve(db), assets: Promise.resolve(assets) }} />);
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
    expect(screen.getByRole("link", { name: "Open file" }).getAttribute("href")).toMatch(/^\/_blob\/[0-9a-f]{32}$/);
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

  it("shows the storage meter on the Settings page", async () => {
    const { assets } = await open("#/settings", undefined, "Settings");
    await assets.upload(new Blob([new Uint8Array(1024)], { type: "application/pdf" }));
    expect(await screen.findByText(/1 file/)).toBeTruthy();
  });
});
