import { describe, it, expect } from "vitest";
import { CSV_BOM, collectionCsv, toCsv } from "../../src/domain/csv";

describe("csv", () => {
  it("writes a BOM, a header from the union of keys, CRLF rows, and RFC 4180 quoting", () => {
    const csv = toCsv([{ a: "plain", b: 'say "hi", ok' }, { a: "second", c: "line\nbreak" }]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).split("\r\n");
    expect(lines[0]).toBe("a,b,c");
    expect(lines[1]).toBe('plain,"say ""hi"", ok",');
    expect(lines[2]).toBe('second,,"line\nbreak"');
    expect(lines[3]).toBe("");
  });

  it("joins arrays with '; ', serializes nested objects as JSON, and keeps Korean text intact", () => {
    const csv = toCsv([{ tags: ["백엔드", "remote"], comp: { min: 1, currency: "KRW" }, n: 3, ok: true, nothing: null }]);
    const row = csv.slice(CSV_BOM.length).split("\r\n")[1];
    expect(row).toBe('백엔드; remote,"{""min"":1,""currency"":""KRW""}",3,true,');
  });

  it("uses explicit columns when given and an empty body for no rows", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b"]).slice(CSV_BOM.length)).toBe("b\r\n2\r\n");
    expect(collectionCsv([])).toBe(`${CSV_BOM}\r\n`);
  });
});
