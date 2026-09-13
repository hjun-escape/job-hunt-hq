import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCapability } from "../../src/store/useCapability";

describe("useCapability", () => {
  it("stores a callable capability value as the value itself, not as a state updater", async () => {
    const capability = Object.assign(() => "called", { json: () => 1 });
    const { result } = renderHook(() => useCapability(Promise.resolve(capability)));
    await waitFor(() => expect(typeof result.current).toBe("function"));
    expect(result.current).toBe(capability);
    expect((result.current as unknown as { json: () => number }).json).toBeTruthy();
  });

  it("resolves to null when the promise rejects", async () => {
    const { result } = renderHook(() => useCapability(Promise.reject(new Error("x"))));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("resolves to null when the promise resolves to null", async () => {
    const { result } = renderHook(() => useCapability(Promise.resolve(null)));
    await waitFor(() => expect(result.current).toBeNull());
  });
});
