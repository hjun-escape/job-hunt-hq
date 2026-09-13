import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MultiPick } from "../../src/ui/MultiPick";

const options = [{ id: "CA", label: "Canada" }, { id: "US", label: "United States" }, { id: "old", label: "Old", archived: true }];

describe("MultiPick", () => {
  it("toggles ids on and off and hides archived options that are not selected", () => {
    const onChange = vi.fn();
    render(<MultiPick label="Target countries" options={options} value={["CA"]} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Old" })).toBeNull();
    expect(screen.getByRole("button", { name: "Canada" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    expect(onChange).toHaveBeenLastCalledWith(["CA", "US"]);
    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
  it("does nothing while disabled", () => {
    const onChange = vi.fn();
    render(<MultiPick label="Themes" options={options} value={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
