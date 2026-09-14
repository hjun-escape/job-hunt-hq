/** Spec §4 CSV rules: scalar columns, arrays joined with "; ", nested objects as JSON, RFC 4180 quoting, UTF-8 BOM, CRLF. */
export const CSV_BOM = "﻿";

/** A leading =, +, -, @, tab or CR makes spreadsheets evaluate the cell; a quote prefix keeps it text. Numbers are never prefixed. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
function cell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = Array.isArray(value)
    ? value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join("; ")
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}
function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(quote).join(",")];
  for (const r of rows) lines.push(cols.map((c) => quote(cell(r[c]))).join(","));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

export function collectionCsv(docs: object[]): string {
  return toCsv(docs as Record<string, unknown>[]);
}
