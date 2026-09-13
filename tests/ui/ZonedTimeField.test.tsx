import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ZonedTimeField } from "../../src/ui/ZonedTimeField";

describe("ZonedTimeField", () => {
  it("commits a UTC instant with the chosen zone and clears", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<ZonedTimeField label="Scheduled" value={undefined} homeTz="America/Toronto" onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("Scheduled timezone"), { target: { value: "Asia/Seoul" } });
    fireEvent.change(screen.getByLabelText("Scheduled date and time"), { target: { value: "2026-10-01T14:00" } });
    expect(onCommit).toHaveBeenLastCalledWith({ at: "2026-10-01T05:00:00.000Z", tz: "Asia/Seoul" });
    rerender(<ZonedTimeField label="Scheduled" value={{ at: "2026-10-01T05:00:00.000Z", tz: "Asia/Seoul" }} homeTz="America/Toronto" onCommit={onCommit} />);
    expect((screen.getByLabelText("Scheduled date and time") as HTMLInputElement).value).toBe("2026-10-01T14:00");
    expect(screen.getByText(/01:00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });
});
