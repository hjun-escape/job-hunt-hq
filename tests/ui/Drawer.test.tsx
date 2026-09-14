import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Drawer } from "../../src/ui/Drawer";

describe("Drawer focus", () => {
  it("moves focus into the dialog on open and restores it on close", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const { rerender } = render(<Drawer open title="T" onClose={() => {}}>body</Drawer>);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    rerender(<Drawer open={false} title="T" onClose={() => {}}>body</Drawer>);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("Drawer closeGuard", () => {
  it("asks the close guard before Escape, ✕ and backdrop close it", async () => {
    const onClose = vi.fn();
    let allow = false;
    const closeGuard = vi.fn(() => allow);
    render(
      <Drawer open title="T" onClose={onClose} closeGuard={closeGuard}>
        body
      </Drawer>,
    );

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(closeGuard).toHaveBeenCalledTimes(3);

    allow = true;
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
