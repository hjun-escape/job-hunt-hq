import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TextField, TagInput, RatingField, TriStateField, NumberField } from "../../src/ui/fields";

describe("TextField", () => {
  it("commits on blur only when changed, and on Enter", () => {
    const onCommit = vi.fn();
    render(<TextField label="Title" value="old" onCommit={onCommit} />);
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new");
  });

  it("reverts to the prop value after a failed commit, then can commit the same text again", async () => {
    let resolveCommit: (ok: boolean) => void = () => {};
    const onCommit = vi.fn(() => new Promise<boolean>((resolve) => { resolveCommit = resolve; }));
    render(<TextField label="Title" value="old" onCommit={onCommit} />);
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new");
    await act(async () => {
      resolveCommit(false);
      await Promise.resolve();
    });
    expect(input.value).toBe("old");
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith("new");
  });
});

describe("NumberField", () => {
  it("commits numbers and null for empty", () => {
    const onCommit = vi.fn();
    render(<NumberField label="Min" value={5} onCommit={onCommit} />);
    const input = screen.getByLabelText("Min") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(null);
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(42);
  });
});

describe("TagInput", () => {
  it("adds on Enter, ignores duplicates, removes via button", () => {
    const onChange = vi.fn();
    render(<TagInput label="Tags" value={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("RatingField", () => {
  it("sets a rating and clears when the same value is clicked", () => {
    const onChange = vi.fn();
    render(<RatingField label="Desire" value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Desire 5" }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Desire 3" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("TriStateField", () => {
  it("maps select values to boolean or null", () => {
    const onChange = vi.fn();
    render(<TriStateField label="Sponsorship needed" value={null} onChange={onChange} />);
    const select = screen.getByLabelText("Sponsorship needed") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "yes" } });
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(select, { target: { value: "no" } });
    expect(onChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(select, { target: { value: "unknown" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
