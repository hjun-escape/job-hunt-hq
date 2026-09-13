import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeadlineField } from "../../src/features/applications/DeadlineField";

describe("DeadlineField", () => {
  it("keeps the user's zone choice when the parent re-renders with an equal deadline object", () => {
    const onCommit = vi.fn();
    const v = { at: "2026-10-01T14:59:59.999Z", tz: "Asia/Seoul", dateOnly: true };
    const { rerender } = render(<DeadlineField value={v} homeTz="America/Toronto" onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("Deadline timezone"), { target: { value: "America/Vancouver" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The parent echoes the same deadline as a fresh object (any unrelated save does this).
    rerender(<DeadlineField value={{ ...v }} homeTz="America/Toronto" onCommit={onCommit} />);
    expect((screen.getByLabelText("Deadline timezone") as HTMLSelectElement).value).toBe("America/Vancouver");
  });
  it("respects disabled", () => {
    render(<DeadlineField value={undefined} homeTz="America/Toronto" onCommit={() => {}} disabled />);
    expect((screen.getByLabelText("Deadline date") as HTMLInputElement).disabled).toBe(true);
  });
});
