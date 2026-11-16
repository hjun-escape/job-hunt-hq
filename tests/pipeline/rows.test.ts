// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterAll, describe, expect, it, vi } from "vitest";
import { HeaderMismatchError, cellText, readRows } from "../../pipeline/load/rows";

const dir = mkdtempSync(path.join(tmpdir(), "rows-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function collect(it: AsyncIterable<Record<string, string>>) {
  const out: Record<string, string>[] = [];
  for await (const r of it) out.push(r);
  return out;
}

/**
 * Writes a workbook, then repacks the zip so the entries come in the order real files use. exceljs writes
 * the sheets first and workbook.xml last. "strings-first" puts workbook.xml, styles and shared strings before
 * the sheets, the order the streaming reader resolves without spooling. "dol" puts workbook.xml and the relationships first and
 * styles.xml and sharedStrings.xml after the sheets (as the DOL files do); "workbook-last" keeps the
 * exceljs order. The repack also drops the data descriptors that exceljs's own zip writer produces.
 */
async function xlsx(
  name: string,
  sheets: Record<string, unknown[][]>,
  order: "strings-first" | "dol" | "workbook-last" = "strings-first",
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  for (const [title, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(title);
    for (const r of rows) ws.addRow(r);
  }
  const file = path.join(dir, name);
  await wb.xlsx.writeFile(file);
  const src = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(src.files).filter((n) => !src.files[n].dir);
  const rank = (n: string) => {
    if (order === "workbook-last") return n === "xl/workbook.xml" ? 2 : n.startsWith("xl/worksheets/") ? 0 : 1;
    if (order === "strings-first") {
      if (n.startsWith("xl/worksheets/")) return 2;
      return n === "xl/styles.xml" || n === "xl/sharedStrings.xml" ? 1 : 0;
    }
    if (n.startsWith("xl/worksheets/")) return 1;
    if (n === "xl/styles.xml" || n === "xl/sharedStrings.xml") return 2;
    return n === "xl/workbook.xml" || n.endsWith("workbook.xml.rels") || n === "[Content_Types].xml" ? 0 : 3;
  };
  names.sort((a, b) => rank(a) - rank(b));
  const out = new JSZip();
  for (const n of names) out.file(n, await src.files[n].async("nodebuffer"));
  writeFileSync(file, await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return file;
}

function csv(name: string, text: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, text);
  return file;
}

describe("readRows (xlsx)", () => {
  it("finds the header below title rows and matches names ignoring case and stray spaces", async () => {
    const file = await xlsx("title.xlsx", {
      S: [
        ["Positive LMIA list"],
        ["Q2 2026"],
        [" case_status ", "JOB_TITLE", "EMPLOYER_POC_EMAIL"],
        ["Certified", "Engineer", "poc@example.com"],
      ],
    });
    const rows = await collect(readRows(file, ["CASE_STATUS", "JOB_TITLE"]));
    expect(rows).toEqual([{ CASE_STATUS: "Certified", JOB_TITLE: "Engineer" }]);
  });

  it("never yields columns outside the expected list", async () => {
    const file = await xlsx("privacy.xlsx", {
      S: [
        ["CASE_STATUS", "EMPLOYER_POC_EMAIL", "JOB_TITLE", "AGENT_ATTORNEY_NAME"],
        ["Certified", "a@b.c", "Engineer", "Jane Doe"],
        ["Denied", "d@e.f", "Analyst", "John Roe"],
      ],
    });
    const rows = await collect(readRows(file, ["CASE_STATUS", "JOB_TITLE"]));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["CASE_STATUS", "JOB_TITLE"]);
    expect(JSON.stringify(rows)).not.toMatch(/a@b\.c|Jane Doe/);
  });

  it("throws HeaderMismatchError naming the missing columns", async () => {
    const file = await xlsx("mismatch.xlsx", {
      S: [["CASE_STATUS", "JOB_TITLE"], ["Certified", "Engineer"]],
    });
    const err = await collect(readRows(file, ["CASE_STATUS", "SOC_CODE"])).catch((e) => e);
    expect(err).toBeInstanceOf(HeaderMismatchError);
    expect(err.missing).toEqual(["SOC_CODE"]);
    expect(err.found).toEqual(expect.arrayContaining(["CASE_STATUS", "JOB_TITLE"]));
    expect(err.file).toBe(file);
  });

  it("formats dates as YYYY-MM-DD in UTC and numbers as plain digits", async () => {
    const file = await xlsx("types.xlsx", {
      S: [["DECISION_DATE", "COUNT", "WAGE"], [new Date(Date.UTC(2026, 2, 31)), 1000, 85000.5]],
    });
    const rows = await collect(readRows(file, ["DECISION_DATE", "COUNT", "WAGE"]));
    expect(rows).toEqual([{ DECISION_DATE: "2026-03-31", COUNT: "1000", WAGE: "85000.5" }]);
  });

  it("skips blank rows between and after data rows", async () => {
    const file = await xlsx("blank.xlsx", {
      S: [
        ["A", "B", "C"],
        ["1", "x", "ignored"],
        [null, null, "only an unexpected column"],
        [" ", "", null],
        ["2", "y", "ignored"],
        [],
        [null, null, null],
      ],
    });
    const rows = await collect(readRows(file, ["A", "B"]));
    expect(rows).toEqual([{ A: "1", B: "x" }, { A: "2", B: "y" }]);
  });

  it("returns rich text, formula results and plain strings as text, trimmed", async () => {
    const file = await xlsx("rich.xlsx", {
      S: [
        ["A", "B", "C"],
        [
          { richText: [{ text: "Acme " }, { text: "Corp", font: { bold: true } }] },
          { formula: "1+2", result: 3 },
          "  padded  ",
        ],
      ],
    });
    const rows = await collect(readRows(file, ["A", "B", "C"]));
    expect(rows).toEqual([{ A: "Acme Corp", B: "3", C: "padded" }]);
  });

  it("keeps underscores and spaces distinct but collapses runs of whitespace", async () => {
    const file = await xlsx("ws.xlsx", {
      S: [["Approved   LMIAs", "Province/Territory", "CASE STATUS"], ["5", "Ontario", "x"]],
    });
    const rows = await collect(readRows(file, ["Approved LMIAs", "Province/Territory"]));
    expect(rows).toEqual([{ "Approved LMIAs": "5", "Province/Territory": "Ontario" }]);
    const err = await collect(readRows(file, ["CASE_STATUS"])).catch((e) => e);
    expect(err).toBeInstanceOf(HeaderMismatchError);
  });

  it("reads the named sheet", async () => {
    const file = await xlsx("sheets.xlsx", {
      First: [["A"], ["one"]],
      Second: [["A"], ["two"]],
    });
    expect(await collect(readRows(file, ["A"], { sheet: "Second" }))).toEqual([{ A: "two" }]);
    expect(await collect(readRows(file, ["A"]))).toEqual([{ A: "one" }]);
  });

  it("reads a file whose workbook.xml comes after the sheets", async () => {
    // Large enough that exceljs spools the sheet and resolves strings and dates after reading the rest.
    const data: unknown[][] = [["A", "B"]];
    for (let i = 0; i < 5000; i++) data.push([`x${i}`, new Date(Date.UTC(2026, 2, 31))]);
    const file = await xlsx("wb-last.xlsx", { S: data }, "workbook-last");
    const rows = await collect(readRows(file, ["A", "B"]));
    expect(rows).toHaveLength(5000);
    expect(rows[0]).toEqual({ A: "x0", B: "2026-03-31" });
  });

  it("resolves strings and dates when styles and shared strings come after the sheet, as in the DOL files", async () => {
    const data: unknown[][] = [["A", "B", "C"]];
    for (let i = 0; i < 5000; i++) data.push([`name ${i % 97}`, new Date(Date.UTC(2026, 2, 31)), i]);
    const file = await xlsx("dol.xlsx", { S: data }, "dol");
    const rows = await collect(readRows(file, ["A", "B", "C"]));
    expect(rows).toHaveLength(5000);
    expect(rows[4999]).toEqual({ A: `name ${4999 % 97}`, B: "2026-03-31", C: "4999" });
  });

  it("does not find a header beyond maxHeaderScan", async () => {
    const file = await xlsx("deep.xlsx", {
      S: [["t"], ["t"], ["t"], ["A", "B"], ["1", "2"]],
    });
    await expect(collect(readRows(file, ["A", "B"], { maxHeaderScan: 3 }))).rejects.toBeInstanceOf(HeaderMismatchError);
    expect(await collect(readRows(file, ["A", "B"], { maxHeaderScan: 4 }))).toHaveLength(1);
  });
});

describe("readRows (csv)", () => {
  it("reads CSV files the same way", async () => {
    const file = csv("a.csv", "Title line\n case_status ,JOB_TITLE,EMPLOYER_POC_EMAIL\nCertified,Engineer,poc@example.com\n");
    const rows = await collect(readRows(file, ["CASE_STATUS", "JOB_TITLE"]));
    expect(rows).toEqual([{ CASE_STATUS: "Certified", JOB_TITLE: "Engineer" }]);
  });

  it("handles quotes, escaped quotes, commas and newlines in quotes, CRLF, BOM and blank lines", async () => {
    const file = csv(
      "q.csv",
      '﻿A,B\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n\r\n,\r\nlast,row',
    );
    const rows = await collect(readRows(file, ["A", "B"]));
    expect(rows).toEqual([
      { A: "x, y", B: 'say "hi"' },
      { A: "line1\nline2", B: "z" },
      { A: "last", B: "row" },
    ]);
  });

  it("parses correctly across many chunks", async () => {
    const lines = ["A,B"];
    for (let i = 0; i < 20000; i++) lines.push(`"v ""${i}"" , x",${i}`);
    const file = csv("big.csv", lines.join("\n"));
    const rows = await collect(readRows(file, ["A", "B"]));
    expect(rows).toHaveLength(20000);
    expect(rows[19999]).toEqual({ A: 'v "19999" , x', B: "19999" });
  });

  it("throws HeaderMismatchError for missing columns", async () => {
    const file = csv("m.csv", "A,B\n1,2\n");
    const err = await collect(readRows(file, ["A", "Z"])).catch((e) => e);
    expect(err).toBeInstanceOf(HeaderMismatchError);
    expect(err.missing).toEqual(["Z"]);
  });
});

describe("cellText", () => {
  it("converts the known cell shapes to plain text", () => {
    expect(cellText(null)).toBe("");
    expect(cellText("  a  ")).toBe("a");
    expect(cellText(12)).toBe("12");
    expect(cellText(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
    expect(cellText({ richText: [{ text: "a" }, { text: "b" }] })).toBe("ab");
    expect(cellText({ formula: "A1", result: 7 })).toBe("7");
    expect(cellText({ formula: "A1" })).toBe("");
    expect(cellText({ text: "link", hyperlink: "https://example.com" })).toBe("link");
    expect(cellText({ error: "#N/A" })).toBe("");
  });

  it("throws on an unresolved shared string, without echoing the value", () => {
    expect(() => cellText({ sharedString: 3 })).toThrow(/unresolved shared string/);
  });

  it("throws on an object it does not know", () => {
    expect(() => cellText({ surprise: "secret-value" })).toThrow(/unsupported cell value/);
    try {
      cellText({ surprise: "secret-value" });
    } catch (e) {
      expect(String(e)).not.toContain("secret-value");
    }
  });
});

describe("readRows temp file cleanup", () => {
  const spool = () => new Set(readdirSync(tmpdir()).filter((n) => n.startsWith("tmp-")));
  // The tmp library unlinks asynchronously, so give it a moment before declaring a leak.
  const expectNoLeak = (before: Set<string>) =>
    vi.waitFor(() => expect([...spool()].filter((n) => !before.has(n))).toEqual([]), { timeout: 3000, interval: 25 });

  async function spooledFile(name: string) {
    const data: unknown[][] = [["A", "B"]];
    for (let i = 0; i < 5000; i++) data.push([`v${i}`, i]);
    return xlsx(name, { S: data }, "dol");
  }

  it("removes the spooled sheet after a full read", async () => {
    const file = await spooledFile("clean-full.xlsx");
    const before = spool();
    expect(await collect(readRows(file, ["A", "B"]))).toHaveLength(5000);
    await expectNoLeak(before);
  });

  it("removes it when the consumer stops early", async () => {
    const file = await spooledFile("clean-early.xlsx");
    const before = spool();
    for await (const r of readRows(file, ["A", "B"])) {
      expect(r.A).toBe("v0");
      break;
    }
    await expectNoLeak(before);
  });

  it("removes it when the consumer throws", async () => {
    const file = await spooledFile("clean-throw.xlsx");
    const before = spool();
    await expect(
      (async () => {
        for await (const _ of readRows(file, ["A", "B"])) throw new Error("consumer failed");
      })(),
    ).rejects.toThrow("consumer failed");
    await expectNoLeak(before);
  });

  it("removes it when the header does not match", async () => {
    const file = await spooledFile("clean-header.xlsx");
    const before = spool();
    await expect(collect(readRows(file, ["A", "NOPE"]))).rejects.toBeInstanceOf(HeaderMismatchError);
    await expectNoLeak(before);
  });
});
