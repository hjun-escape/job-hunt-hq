import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RowsEditor } from "../../src/ui/RowsEditor";

type Row = { label: string; value: string };

describe("RowsEditor", () => {
  it("adds, edits and removes rows through labelled inputs", () => {
    const onChange = vi.fn();
    const rows: Row[] = [{ label: "CA", value: "" }];
    render(<RowsEditor<Row> label="Phone numbers" rows={rows} columns={[{ key: "label", label: "Label" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={onChange} addLabel="Add phone" />);
    const number = screen.getByLabelText("Phone numbers 1 Number");
    fireEvent.change(number, { target: { value: "+1 416" } });
    fireEvent.blur(number);
    expect(onChange.mock.lastCall![0](rows)).toEqual([{ label: "CA", value: "+1 416" }]);
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    expect(onChange.mock.lastCall![0](rows)).toEqual([{ label: "CA", value: "" }, { label: "", value: "" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone numbers 1" }));
    expect(onChange.mock.lastCall![0](rows)).toEqual([]);
  });

  it("applies an edit to the caller's current rows, not the rows it rendered", () => {
    const onChange = vi.fn();
    const rows: Row[] = [{ label: "CA", value: "" }];
    render(<RowsEditor<Row> label="Phone numbers" rows={rows} columns={[{ key: "label", label: "Label" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={onChange} addLabel="Add phone" />);
    const number = screen.getByLabelText("Phone numbers 1 Number");
    fireEvent.change(number, { target: { value: "+1 416" } });
    fireEvent.blur(number);
    // Take the updater and apply it to a different current state
    const updater = onChange.mock.lastCall![0];
    const differentCurrent = [{ label: "KR", value: "" }];
    expect(updater(differentCurrent)).toEqual([{ label: "KR", value: "+1 416" }]);
  });

  it("keeps focus on the next field when a committed edit re-renders the rows", async () => {
    const onChange = vi.fn();
    const rows: Row[] = [{ label: "", value: "" }];
    const { rerender } = render(<RowsEditor<Row> label="Phone numbers" rows={rows} columns={[{ key: "label", label: "Label" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={onChange} addLabel="Add phone" />);
    const label = screen.getByLabelText("Phone numbers 1 Label");
    const number = screen.getByLabelText("Phone numbers 1 Number");
    fireEvent.change(label, { target: { value: "CA" } });
    fireEvent.blur(label);
    number.focus();
    // Simulate the parent re-rendering with the updated rows after the save
    const updatedRows = [{ label: "CA", value: "" }];
    rerender(<RowsEditor<Row> label="Phone numbers" rows={updatedRows} columns={[{ key: "label", label: "Label" }, { key: "value", label: "Number" }]} blank={() => ({ label: "", value: "" })} onChange={onChange} addLabel="Add phone" />);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Phone numbers 1 Number"));
    });
  });
});
