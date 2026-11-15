// Personal-text scan shared by profile validation and the site writer. Contact details and the names of
// personal source columns must never reach a published string. A hit is reported by kind and place only,
// never echoed, because validation problems and build errors end up in public pull requests and issues.

const PATTERNS: { pattern: RegExp; what: string }[] = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/, what: "an email address" },
  // Upper case only: postal codes are written that way, while lower-case runs such as the a1b2c3 of a short
  // link are common.
  { pattern: /\b[A-Z]\d[A-Z] ?\d[A-Z]\d\b/, what: "what looks like a postal code" },
  { pattern: /EMPLOYER_POC|EMP_POC|PREPARER_|DECL_PREP_|ATTY_AG_|LAWFIRM_/, what: "a contact or preparer column name" },
];

/** The kind of personal text `text` holds, such as "an email address", or null. */
export function personalText(text: string): string | null {
  for (const { pattern, what } of PATTERNS) if (pattern.test(text)) return what;
  return null;
}

/** True when the whole value is one https URL (no spaces). Links are not free text, so the scan skips them. */
export function isHttpsUrl(value: string): boolean {
  if (!/^https:\/\/\S+$/.test(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Every free-text string inside a JSON-like value, with its path in the style `mission.value.en` or
 * `links[0].label`. URL fields are skipped: any field named `url` (profile `sources[].url`, `links[].url`)
 * and any value that is an https URL. Object keys are not scanned.
 */
export function textFields(value: unknown): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (v: unknown, at: string, key?: string) => {
    if (typeof v === "string") {
      if (key !== "url" && !isHttpsUrl(v)) out.push({ path: at || "(value)", text: v });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${at}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k, k);
    }
  };
  walk(value, "");
  return out;
}
