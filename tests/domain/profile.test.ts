import { describe, it, expect } from "vitest";
import { defaultProfile } from "../../src/domain/defaults";
import { profileSectionText } from "../../src/domain/profile";

const NOW = "2026-09-11T00:00:00.000Z";

describe("profileSectionText", () => {
  const p = { ...defaultProfile(NOW), name: "Ada Lovelace", email: "me@example.com", phones: [{ label: "CA", value: "+1 416 555 0100" }],
    links: [{ label: "GitHub", url: "https://github.com/x" }],
    education: [{ school: "UofT", degree: "BSc", field: "CS", start: "2019-09", end: "2023-05", gpa: "3.8" }],
    employment: [{ company: "Analytical Engines", title: "Founder", start: "2023-06", summary: "Built the platform." }] };
  it("renders identity, education, employment and links as plain text lines", () => {
    expect(profileSectionText(p, "identity")).toBe("Ada Lovelace\nme@example.com\nCA: +1 416 555 0100");
    expect(profileSectionText(p, "education")).toBe("UofT — BSc, CS (2019-09 – 2023-05), GPA 3.8");
    expect(profileSectionText(p, "employment")).toBe("Analytical Engines — Founder (2023-06 – present)\nBuilt the platform.");
    expect(profileSectionText(p, "links")).toBe("GitHub: https://github.com/x");
  });
});
