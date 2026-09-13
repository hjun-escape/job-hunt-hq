import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
