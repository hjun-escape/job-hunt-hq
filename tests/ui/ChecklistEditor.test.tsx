import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChecklistEditor } from "../../src/features/interviews/ChecklistEditor";
import type { ChecklistItem } from "../../src/domain/types";

const items: ChecklistItem[] = [
  { id: "ck_1", text: "Review consistent hashing", done: false },
  { id: "ck_2", text: "Re-read the job description", done: true },
];

describe("ChecklistEditor", () => {
  it("adds a new item as a function that appends to the current list", () => {
    const onChange = vi.fn();
    render(<ChecklistEditor items={items} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("New checklist item"), { target: { value: "Practice system design" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const add = onChange.mock.calls[0][0] as (c: ChecklistItem[]) => ChecklistItem[];
    // A sibling write already appended a third item by the time this applies -- the new item
    // (a fresh id) must still land, and the sibling addition must survive.
    const current = [...items, { id: "ck_3", text: "Something else", done: false }];
    const result = add(current);
    expect(result).toHaveLength(4);
    expect(result.slice(0, 3)).toEqual(current);
    expect(result[3]).toMatchObject({ text: "Practice system design", done: false });
  });

  it("toggles done by item id against the current list", () => {
    const onChange = vi.fn();
    render(<ChecklistEditor items={items} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Review consistent hashing"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const toggle = onChange.mock.calls[0][0] as (c: ChecklistItem[]) => ChecklistItem[];
    // A sibling write already reordered/extended the list -- the toggle must still find ck_1
    // by id and leave everything else (including the new item) untouched.
    const current = [items[1], items[0], { id: "ck_3", text: "New", done: false }];
    const result = toggle(current);
    expect(result.find((x) => x.id === "ck_1")?.done).toBe(true);
    expect(result.find((x) => x.id === "ck_2")).toEqual(items[1]);
    expect(result.find((x) => x.id === "ck_3")).toEqual({ id: "ck_3", text: "New", done: false });
  });

  it("removes by item id against the current list, not by rendered position", () => {
    const onChange = vi.fn();
    render(<ChecklistEditor items={items} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Review consistent hashing (item 1)" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const remove = onChange.mock.calls[0][0] as (c: ChecklistItem[]) => ChecklistItem[];
    // A sibling write already prepended a new item -- removing "by position 0" would drop the
    // wrong one; removal must go by id.
    const current = [{ id: "ck_3", text: "Prepended", done: false }, items[0], items[1]];
    expect(remove(current)).toEqual([{ id: "ck_3", text: "Prepended", done: false }, items[1]]);
  });

  it("ignores the remove button while disabled", () => {
    // Note: jsdom fires React's onChange for a disabled checkbox's simulated click regardless
    // of the `disabled` attribute (unlike a disabled <button>), so the checkbox toggle isn't
    // exercised here -- this mirrors the pattern the existing TagInput disabled test uses.
    const onChange = vi.fn();
    render(<ChecklistEditor items={items} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Review consistent hashing (item 1)" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("names remove buttons uniquely even for duplicate texts", () => {
    render(<ChecklistEditor items={[{ id: "a", text: "Same", done: false }, { id: "b", text: "Same", done: false }]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove Same (item 1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Same (item 2)" })).toBeTruthy();
  });
});
