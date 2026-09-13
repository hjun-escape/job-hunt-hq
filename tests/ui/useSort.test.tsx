import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSort } from "../../src/ui/useSort";

describe("useSort", () => {
  it("starts on the initial column, toggles direction on repeat, resets to asc on a new column", () => {
    const { result } = renderHook(() => useSort("name"));
    expect(result.current).toMatchObject({ sortKey: "name", sortDir: "asc" });
    act(() => result.current.onSort("name"));
    expect(result.current.sortDir).toBe("desc");
    act(() => result.current.onSort("updated"));
    expect(result.current).toMatchObject({ sortKey: "updated", sortDir: "asc" });
  });
});
