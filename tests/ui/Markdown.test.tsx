import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "../../src/ui/Markdown";

describe("Markdown", () => {
  it("renders paragraphs, lists, headings and inline styles as elements", () => {
    const { container } = render(<Markdown text={"# Why us\n\nI **love** the *scale*.\n\n- one\n- two\n\nSee [site](https://example.com) and `code`."} />);
    expect(container.querySelector("h3")?.textContent).toBe("Why us");
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("love");
    expect(container.querySelector("em")?.textContent).toBe("scale");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noreferrer");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });
  it("never emits raw HTML and refuses non-http links", () => {
    const { container } = render(<Markdown text={"<img src=x onerror=alert(1)> [bad](javascript:alert(1))"} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("bad");
  });
});
