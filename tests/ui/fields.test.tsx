import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TextField, TagInput, RatingField, TriStateField, NumberField, UrlField } from "../../src/ui/fields";

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
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(typeof onChange.mock.calls[0][0]).toBe("function");
    expect((onChange.mock.calls[0][0] as (c: string[]) => string[])(["a"])).toEqual(["a", "b"]);

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(2); // re-add still calls onChange; dedupe happens at apply time
    expect((onChange.mock.calls[1][0] as (c: string[]) => string[])(["a"])).toEqual(["a"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect((onChange.mock.calls[2][0] as (c: string[]) => string[])(["a"])).toEqual([]);
  });

  it("computes add/remove against the current list, not the one it rendered from", () => {
    const onChange = vi.fn();
    render(<TagInput label="Tags" value={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Tags") as HTMLInputElement;

    // Adding "b": a sibling write already added it (plus "c") by the time this applies --
    // must not be duplicated, and the sibling addition must survive.
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const add = onChange.mock.calls[0][0] as (c: string[]) => string[];
    expect(add(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(add(["a", "c"])).toEqual(["a", "c", "b"]);

    // Removing "a": a sibling write already added "c" by the time this applies -- "a" must be
    // removed by value, without losing that concurrent addition.
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    const remove = onChange.mock.calls[1][0] as (c: string[]) => string[];
    expect(remove(["a", "c"])).toEqual(["c"]);
  });

  it("TagInput emits a re-add even when the rendered value still shows the tag", () => {
    const onChange = vi.fn();
    render(<TagInput label="Tags" value={["a"]} onChange={onChange} />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0]([])).toEqual(["a"]);
    expect(onChange.mock.lastCall![0](["a"])).toEqual(["a"]);
  });
});

describe("UrlField", () => {
  it("offers an Open link only for http(s) values", () => {
    const { rerender } = render(<UrlField label="Website" value="https://shopify.com" onCommit={() => {}} />);
    expect(screen.getByRole("link", { name: "Open Website" }).getAttribute("href")).toBe("https://shopify.com");
    rerender(<UrlField label="Website" value="javascript:alert(1)" onCommit={() => {}} />);
    expect(screen.queryByRole("link", { name: "Open Website" })).toBeNull();
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

describe("disabled fields", () => {
  it("RatingField, TagInput and TriStateField ignore input while disabled", () => {
    const onRating = vi.fn(); const onTags = vi.fn(); const onTri = vi.fn();
    render(<>
      <RatingField label="Desire" value={2} onChange={onRating} disabled />
      <TagInput label="Tags" value={["a"]} onChange={onTags} disabled />
      <TriStateField label="Sponsorship needed" value={null} onChange={onTri} disabled />
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Desire 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    const tagInput = screen.getByLabelText("Tags") as HTMLInputElement;
    expect(tagInput.disabled).toBe(true);
    expect((screen.getByLabelText("Sponsorship needed") as HTMLSelectElement).disabled).toBe(true);
    expect(onRating).not.toHaveBeenCalled();
    expect(onTags).not.toHaveBeenCalled();
    expect(onTri).not.toHaveBeenCalled();
  });
});
