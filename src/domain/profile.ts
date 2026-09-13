import type { Profile } from "./types";

export type ProfileSection = "identity" | "education" | "employment" | "links";

/** Plain-text rendering of a profile section for pasting into application forms. */
export function profileSectionText(p: Profile, section: ProfileSection): string {
  switch (section) {
    case "identity":
      return [p.name, p.email, ...p.phones.map((ph) => `${ph.label}: ${ph.value}`)].filter((s) => s.trim()).join("\n");
    case "education":
      return p.education.map((e) => `${e.school} — ${e.degree}, ${e.field} (${e.start} – ${e.end})${e.gpa ? `, GPA ${e.gpa}` : ""}`).join("\n");
    case "employment":
      return p.employment.map((j) => `${j.company} — ${j.title} (${j.start} – ${j.end || "present"})${j.summary ? `\n${j.summary}` : ""}`).join("\n\n");
    case "links":
      return p.links.map((l) => `${l.label}: ${l.url}`).join("\n");
  }
}

/** Default currency for a country's salary expectations. */
export const COUNTRY_CURRENCY: Record<string, string> = { CA: "CAD", US: "USD", KR: "KRW" };
