import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastProvider } from "../../src/ui/Toast";
import { useSaver } from "../../src/ui/useSaver";

let latestRun: ((fn: () => Promise<unknown>) => Promise<boolean>) | null = null;

function Harness() {
  const { status, run } = useSaver();
  latestRun = run;
  return <span data-testid="status">{status}</span>;
}

afterEach(() => {
  vi.useRealTimers();
  latestRun = null;
});

describe("useSaver", () => {
  it("keeps a later failure visible even when an earlier success timer is pending", async () => {
    vi.useFakeTimers();
    render(<ToastProvider><Harness /></ToastProvider>);
    await act(async () => { await latestRun!(async () => undefined); });
    expect(screen.getByTestId("status").textContent).toBe("saved");
    await act(async () => { await latestRun!(async () => { throw new Error("boom"); }); });
    expect(screen.getByTestId("status").textContent).toBe("failed");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByTestId("status").textContent).toBe("failed");
  });

  it("returns to idle after a success", async () => {
    vi.useFakeTimers();
    render(<ToastProvider><Harness /></ToastProvider>);
    await act(async () => { await latestRun!(async () => undefined); });
    expect(screen.getByTestId("status").textContent).toBe("saved");
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByTestId("status").textContent).toBe("idle");
  });
});
