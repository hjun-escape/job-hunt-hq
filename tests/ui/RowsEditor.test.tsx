import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(onChange).toHaveBeenLastCalledWith([{ label: "CA", value: "+1 416" }]);
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    expect(onChange).toHaveBeenLastCalledWith([{ label: "CA", value: "" }, { label: "", value: "" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone numbers 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
