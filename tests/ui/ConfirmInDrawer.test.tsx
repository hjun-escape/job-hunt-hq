import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "../../src/ui/Confirm";
import { Drawer } from "../../src/ui/Drawer";

/** A drawer whose body can open a confirm dialog -- the shape every real editor uses
 * (delete buttons, discard-changes prompts, etc). */
function Harness({ onClose, onResult }: { onClose: () => void; onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <Drawer open title="Editor" onClose={onClose}>
      <button onClick={() => void confirm({ title: "Delete?", message: "Gone forever.", confirmLabel: "Delete" }).then(onResult)}>ask</button>
    </Drawer>
  );
}

describe("Confirm rendered inside a Drawer", () => {
  it("Escape resolves the confirm but does not also close the drawer beneath it", async () => {
    const onClose = vi.fn();
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onClose={onClose} onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByText("ask"));
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual([false]);
    expect(onClose).not.toHaveBeenCalled();
  });
});
