import { describe, it, expect } from "vitest";
import { sortRows, type Column } from "../../src/ui/sortRows";

interface Row { id: string; n: number | null; s: string }
const rows: Row[] = [
  { id: "a", n: 3, s: "banana" },
  { id: "b", n: null, s: "apple" },
  { id: "c", n: 1, s: "" },
];
const byN: Column<Row> = { key: "n", header: "N", render: (r) => r.n, sortValue: (r) => r.n };
const byS: Column<Row> = { key: "s", header: "S", render: (r) => r.s, sortValue: (r) => r.s };

describe("sortRows", () => {
  it("sorts numbers with nulls last in both directions", () => {
    expect(sortRows(rows, byN, "asc").map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortRows(rows, byN, "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts strings with empty last", () => {
    expect(sortRows(rows, byS, "asc").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("returns the input order without a sortable column", () => {
    expect(sortRows(rows, undefined, "asc")).toBe(rows);
  });
});
