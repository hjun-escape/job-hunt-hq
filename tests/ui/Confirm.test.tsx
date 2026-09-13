import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "../../src/ui/Confirm";

function Harness({ typed, onResult }: { typed?: string; onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return <button onClick={() => void confirm({ title: "Delete?", message: "Gone forever.", confirmLabel: "Delete", typed }).then(onResult)}>open</button>;
}

describe("useConfirm", () => {
  it("resolves true on confirm and false on cancel", async () => {
    const results: boolean[] = [];
    render(<ConfirmProvider><Harness onResult={(v) => results.push(v)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual([true, false]);
  });

  it("keeps the confirm button disabled until the typed phrase matches", async () => {
    render(<ConfirmProvider><Harness typed="REPLACE" onResult={() => {}} /></ConfirmProvider>);
    fireEvent.click(screen.getByText("open"));
    const button = (await screen.findByRole("button", { name: "Delete" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/type REPLACE/i), { target: { value: "REPLACE" } });
    expect(button.disabled).toBe(false);
  });

  it("cancels on Escape", async () => {
    const results: boolean[] = [];
    render(<ConfirmProvider><Harness onResult={(v) => results.push(v)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText("open"));
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual([false]);
  });
});
