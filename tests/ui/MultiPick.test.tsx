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
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(typeof onChange.mock.calls[0][0]).toBe("function");
    expect((onChange.mock.calls[0][0] as (c: string[]) => string[])(["CA"])).toEqual(["CA", "US"]);

    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect((onChange.mock.calls[1][0] as (c: string[]) => string[])(["CA"])).toEqual([]);
  });

  it("does nothing while disabled", () => {
    const onChange = vi.fn();
    render(<MultiPick label="Themes" options={options} value={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("toggles by value against the current list, not the one it rendered from", () => {
    const onChange = vi.fn();
    render(<MultiPick label="Target countries" options={options} value={["CA"]} onChange={onChange} />);

    // Turning US on: a sibling write already added it (plus something else) by the time this
    // update applies -- it must not be duplicated, and the sibling addition must survive.
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    const add = onChange.mock.calls[0][0] as (c: string[]) => string[];
    expect(add(["CA", "US", "KR"])).toEqual(["CA", "US", "KR"]);
    expect(add(["CA", "KR"])).toEqual(["CA", "KR", "US"]);

    // Turning CA off: a sibling write already added US by the time this update applies -- CA
    // must be removed by value, without losing that concurrent addition.
    fireEvent.click(screen.getByRole("button", { name: "Canada" }));
    const remove = onChange.mock.calls[1][0] as (c: string[]) => string[];
    expect(remove(["CA", "US"])).toEqual(["US"]);
  });
});
