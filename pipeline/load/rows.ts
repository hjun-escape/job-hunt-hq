// Streaming spreadsheet row reader. Every loader goes through readRows, which yields only the expected
// columns, so personal columns in the government files never leave this module.
import { createReadStream } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

export class HeaderMismatchError extends Error {
  constructor(
    public file: string,
    public missing: string[],
    public found: string[],
  ) {
    super(`${path.basename(file)}: header row is missing columns: ${missing.join(", ")}`);
    this.name = "HeaderMismatchError";
  }
}

export type ReadRowsOptions = { sheet?: string; maxHeaderScan?: number };

/** Trim, upper-case and collapse internal whitespace. Underscores and spaces stay distinct. */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * A cell value as plain text: rich text, formula results and hyperlink text resolve to their text.
 * Throws on any object it cannot convert, notably an unresolved shared string (`{ sharedString: n }`,
 * which exceljs leaves behind when it could not load sharedStrings.xml): that index would otherwise pass
 * as a non-empty value and put wrong data into the dataset. The message never contains the value.
 */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("sharedString" in o) throw new Error("unresolved shared string cell");
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: unknown }[]).map((t) => (typeof t.text === "string" ? t.text : "")).join("").trim();
    }
    if ("result" in o) return cellText(o.result);
    if ("formula" in o || "sharedFormula" in o) return "";
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return "";
  }
  throw new Error(`unsupported cell value of type ${typeof v}`);
}

/** One sheet row: raw cells (array index = column position + base) and its 1-based row number. */
type RawRow = { cells: unknown[]; rowNumber: number };

async function* xlsxRows(file: string, sheet: string | undefined): AsyncGenerator<RawRow> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    styles: "cache",
    worksheets: "emit",
  });
  // exceljs reads the sheet list only when workbook.xml precedes the sheets in the zip; seed an empty
  // model so the other order does not throw (sheet names then fall back to "sheet N").
  (reader as unknown as { model: unknown }).model = { sheets: [] };
  // When styles.xml and sharedStrings.xml follow the sheet (the DOL files), exceljs spools the sheet to a
  // temp file and deletes it only after the sheet iterator has run to its end. The iterators are driven by
  // hand so that stopping early (or an error) still runs them to the end and the file is deleted.
  const sheets = reader[Symbol.asyncIterator]();
  let rows: AsyncIterator<unknown> | null = null;
  let finished = false;
  try {
    let sheetNo = 0;
    for (;;) {
      const next = await sheets.next();
      if (next.done) break;
      sheetNo++;
      const ws = next.value as AsyncIterable<unknown>;
      const name = (ws as unknown as { name?: string }).name ?? `sheet ${sheetNo}`;
      if (sheet === undefined ? sheetNo > 1 : name !== sheet) continue;
      rows = ws[Symbol.asyncIterator]();
      for (;;) {
        const r = await rows.next();
        if (r.done) break;
        const row = r.value as { values: unknown[]; number: number };
        yield { cells: row.values, rowNumber: row.number };
      }
      rows = null;
      await sheets.next(); // lets exceljs delete the spooled temp file
      break;
    }
    finished = true;
  } finally {
    if (!finished) {
      try {
        if (rows) while (!(await rows.next()).done);
        await sheets.next();
      } catch {
        // the original exit reason (error or early stop) is what the caller sees
      }
    }
  }
}

/** Small RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
async function* csvRows(file: string): AsyncGenerator<RawRow> {
  let rowNumber = 0;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteSeen = false; // inside quotes, the previous char was a quote: either an escape or the closing quote
  let started = false; // the current record has content
  let first = true;
  let skipLf = false;

  const endField = () => {
    row.push(field);
    field = "";
  };

  for await (const chunk of createReadStream(file, { encoding: "utf8" }) as AsyncIterable<string>) {
    let text = chunk;
    if (first) {
      first = false;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (skipLf) {
        skipLf = false;
        if (ch === "\n") continue;
      }
      if (inQuotes) {
        if (quoteSeen) {
          quoteSeen = false;
          if (ch === '"') {
            field += '"';
            continue;
          }
          inQuotes = false;
          // fall through: ch follows the closing quote
        } else if (ch === '"') {
          quoteSeen = true;
          continue;
        } else {
          field += ch;
          continue;
        }
      }
      if (ch === '"' && field === "") {
        inQuotes = true;
        started = true;
      } else if (ch === ",") {
        endField();
        started = true;
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r") skipLf = true;
        if (started || field !== "") {
          endField();
          yield { cells: row, rowNumber: ++rowNumber };
        }
        row = [];
        started = false;
      } else {
        field += ch;
        started = true;
      }
    }
  }
  if (started || field !== "") {
    endField();
    yield { cells: row, rowNumber: ++rowNumber };
  }
}

export async function* readRows(
  file: string,
  expected: string[],
  opts: ReadRowsOptions = {},
): AsyncGenerator<Record<string, string>> {
  const maxHeaderScan = opts.maxHeaderScan ?? 30;
  const ext = path.extname(file).toLowerCase();
  let base: number;
  let raw: AsyncIterable<RawRow>;
  if (ext === ".xlsx") {
    base = 1;
    raw = xlsxRows(file, opts.sheet);
  } else if (ext === ".csv") {
    base = 0;
    raw = csvRows(file);
  } else throw new Error(`unsupported file type: ${ext || "(none)"} (unzip archives first)`);

  const wanted = expected.map(normalize);
  let cols: number[] | null = null; // array index of each expected column, in order
  let scanned = 0;
  let best: { missing: string[]; found: string[] } | null = null;

  for await (const { cells, rowNumber } of raw) {
    try {
      if (cols === null) {
        scanned++;
        const names: string[] = [];
        for (let i = base; i < cells.length; i++) names[i] = normalize(cellText(cells[i]));
        const idx = wanted.map((w) => names.indexOf(w));
        const missing = expected.filter((_, k) => idx[k] < 0);
        if (missing.length === 0) {
          cols = idx;
          continue;
        }
        const found = names.filter((n) => n);
        if (found.length > 0 && (best === null || missing.length < best.missing.length)) best = { missing, found };
        if (scanned >= maxHeaderScan) break;
        continue;
      }
      const out: Record<string, string> = {};
      let any = false;
      for (let k = 0; k < cols.length; k++) {
        const v = cellText(cells[cols[k]]);
        if (v !== "") any = true;
        out[expected[k]] = v;
      }
      if (any) yield out;
    } catch (err) {
      if (err instanceof HeaderMismatchError) throw err;
      throw new Error(`${path.basename(file)} row ${rowNumber}: ${err instanceof Error ? err.message : "unreadable cell"}`);
    }
  }
  if (cols === null) throw new HeaderMismatchError(file, best?.missing ?? expected, best?.found ?? []);
}
