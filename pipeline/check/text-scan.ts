// Personal-text scan shared by profile validation and the site writer. Contact details and the names of
// personal source columns must never reach a published string. A hit is reported by kind and place only,
// never echoed, because validation problems and build errors end up in public pull requests and issues.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const POSTAL = /\b[A-Z]\d[A-Z] ?\d[A-Z]\d\b/i;
const COLUMNS = /EMPLOYER_POC|EMP_POC|PREPARER_|DECL_PREP_|ATTY_AG_|LAWFIRM_/;

/** The value as an https URL when the whole value is one (no whitespace), else null. */
function httpsUrl(value: string): URL | null {
  if (/\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** What personalText returns for a postal-code-pattern hit. */
export const POSTAL_CODE = "what looks like a postal code";

/**
 * The kind of personal text a value holds, such as "an email address", or null. Every value is checked for
 * email-shaped text and personal column names. A value that is one https URL is also refused when it carries
 * a user name or password, and its path, query and fragment are checked percent-decoded too (so
 * `logo@2x.png` or `?contact=jane%40example.org` is refused: link the page instead). Only the postal-code
 * pattern skips URLs, whose short-link paths such as `a1b2c3` look like postal codes; it is case-insensitive
 * everywhere else. `{ postal: false }` skips the postal-code pattern, for callers that handle it apart.
 */
export function personalText(value: string, opts: { postal?: boolean } = {}): string | null {
  const url = httpsUrl(value);
  if (url && (url.username || url.password)) return "a user name or password in a URL";
  const texts = url ? [value, decoded(value)] : [value];
  if (texts.some((t) => EMAIL.test(t))) return "an email address";
  if (opts.postal !== false && !url && POSTAL.test(value)) return POSTAL_CODE;
  if (texts.some((t) => COLUMNS.test(t))) return "a contact or preparer column name";
  return null;
}

/** Every string inside a JSON-like value, with its path in the style `mission.value.en` or `links[0].url`. */
export function textFields(value: unknown): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (v: unknown, at: string) => {
    if (typeof v === "string") out.push({ path: at || "(value)", text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
  };
  walk(value, "");
  return out;
}
