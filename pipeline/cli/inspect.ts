// Usage: npm run dataset:inspect -- <file>
// Prints sheet names, the detected header row and the number of data rows. Never prints row values.
import { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";

/** The first row (within the first 20) with at least 3 filled cells that are mostly text. 1-based, or null. */
export function detectHeaderRow(rows: unknown[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].filter((c) => c !== null && c !== undefined && c !== "");
    if (cells.length >= 3 && cells.filter((c) => typeof c === "string").length * 2 > cells.length) return i + 1;
  }
  return null;
}

function cellValues(row: ExcelJS.Row): unknown[] {
  const vals = (row.values as unknown[]).slice(1);
  return vals.map((v) => (v && typeof v === "object" && "richText" in (v as object) ? "text" : v));
}

async function inspectXlsx(file: string) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    worksheets: "emit",
  });
  // exceljs reads the sheet list only when workbook.xml precedes the sheets in the zip; seed an empty
  // model so the other order does not throw (sheet names then fall back to "sheet N").
  (reader as unknown as { model: unknown }).model = { sheets: [] };
  let sheetNo = 0;
  for await (const ws of reader) {
    sheetNo++;
    const head: unknown[][] = [];
    let total = 0;
    for await (const row of ws) {
      total++;
      if (head.length < 20) head.push(cellValues(row as unknown as ExcelJS.Row));
    }
    const headerRow = detectHeaderRow(head);
    const name = (ws as unknown as { name?: string }).name ?? `sheet ${sheetNo}`;
    console.log(`sheet: ${name}`);
    console.log(`  header row: ${headerRow ?? "not detected"}`);
    if (headerRow) console.log(`  columns: ${head[headerRow - 1].map((c) => String(c ?? "")).join(" | ")}`);
    console.log(`  data rows: ${headerRow ? total - headerRow : total}`);
  }
}

async function inspectCsv(file: string) {
  const head: unknown[][] = [];
  let total = 0;
  const rl = createInterface({ input: createReadStream(file) });
  for await (const line of rl) {
    total++;
    if (head.length < 20) head.push(line.split(","));
  }
  const headerRow = detectHeaderRow(head);
  console.log("sheet: (csv)");
  console.log(`  header row: ${headerRow ?? "not detected"}`);
  if (headerRow) console.log(`  columns: ${head[headerRow - 1].join(" | ")}`);
  console.log(`  data rows: ${headerRow ? total - headerRow : total}`);
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npm run dataset:inspect -- <file>");
  const ext = path.extname(file).toLowerCase();
  if (ext === ".xlsx") await inspectXlsx(file);
  else if (ext === ".csv") await inspectCsv(file);
  else throw new Error(`unsupported file type: ${ext || "(none)"} (unzip archives first)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
