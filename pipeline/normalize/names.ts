import { createHash } from "node:crypto";
import { POSTAL } from "../check/text-scan";

const CORPORATE_TOKENS = new Set([
  "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "LTEE", "CORP", "CORPORATION",
  "CO", "COMPANY", "LP", "LLP", "PLLC", "PC", "PA", "GMBH", "SA", "ULC",
  "NA", "PBC", "FSB", "PLC", "NV", "BV", "AG", "SE", "SPA", "SAS", "SARL", "KK", "PTY", "PTE",
  "AB", "OY", "SRL", "LTDA", "LLLP", "LC",
]);

/**
 * FEIN-shaped tokens, shared by the loaders (R35) and the build's FEIN gate: nine digits, optionally split 2-7
 * by a hyphen, an en dash or an underscore (never a space), and not inside a longer run of digits. This also
 * covers 9-digit Canadian business numbers. It is global: use it with replace, match or matchAll only.
 */
export const FEIN_TOKEN = /(?<!\d)\d{2}[-\u2013_]?\d{7}(?!\d)/g;

/** The FEIN-shaped tokens in a text, as nine digits each. */
export function feinTokens(text: string): string[] {
  return [...text.matchAll(FEIN_TOKEN)].map((m) => m[0].replace(/\D/g, ""));
}

/** Separators a removed number leaves at either end of a name. A trailing full stop ("INC.") is kept. */
const EDGES = /^[\s,;:/#|_\-\u2013\u2014.]+|[\s,;:/#|_\-\u2013\u2014]+$/g;
/** A separator left standing alone between spaces, as in "ACME - - INC" or "ACME ." */
const LONE_SEPARATOR = /(^|\s)[,;:/#|_\-\u2013\u2014.]+(?=\s|$)/g;

/** Province and territory names and abbreviations (English and French), "Canada" and "Canadian", folded. */
const NUMBERED_PLACES = new Set([
  "ONTARIO", "ONT", "ON", "QUEBEC", "QUE", "QC", "SASKATCHEWAN", "SASK", "SK", "ALBERTA", "ALTA", "AB",
  "BRITISH COLUMBIA", "BC", "COLOMBIE BRITANNIQUE", "MANITOBA", "MAN", "MB", "NOVA SCOTIA", "NS", "NOUVELLE ECOSSE",
  "NEW BRUNSWICK", "NB", "NOUVEAU BRUNSWICK", "NEWFOUNDLAND AND LABRADOR", "NEWFOUNDLAND", "NFLD", "NL",
  "TERRE NEUVE ET LABRADOR", "PRINCE EDWARD ISLAND", "PEI", "PE", "ILE DU PRINCE EDOUARD", "YUKON", "YT",
  "NORTHWEST TERRITORIES", "NWT", "NT", "TERRITOIRES DU NORD OUEST", "NUNAVUT", "NU", "CANADA", "CANADIAN",
]);
const NUMBERED_CORP_WORDS = new Set(["INC", "LTD", "LTEE", "LIMITED", "LIMITEE", "CORP", "CORPORATION", "ULC", "CO"]);

/**
 * True for a Canadian numbered company, named by its registry number (R37): a leading run of 6 to 10 digits,
 * then only a province or territory (or "Canada", "Canadian"), then a corporate word, as in
 * "101234567 Saskatchewan Ltd.". The number is the public legal name, not a tax id, so it is never stripped.
 * Matching ignores case, accents and dots, and allows commas and hyphens between words.
 */
export function isNumberedCompanyName(raw: string): boolean {
  const t = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/&/g, " AND ")
    .replace(/[,\-\u2010-\u2015]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = /^\d{6,10} (.+) (\S+)$/.exec(t);
  return m !== null && NUMBERED_CORP_WORDS.has(m[2]) && NUMBERED_PLACES.has(m[1]);
}

/**
 * A filed name with every FEIN-shaped token removed (R35), then the empty brackets, doubled spaces and edge
 * separators the removal left. A name without such a token, or a Canadian numbered-company name (R37), comes
 * back unchanged; "" means it was only a number.
 */
export function stripFeinTokens(name: string): string {
  if (name.match(FEIN_TOKEN) === null || isNumberedCompanyName(name)) return name;
  return name
    .replace(FEIN_TOKEN, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(LONE_SEPARATOR, "$1")
    .replace(/\s+/g, " ")
    .replace(EDGES, "");
}

export function normalizeName(raw: string): string {
  const text = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[.,'"]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens[0] === "THE" && tokens.length > 1) tokens.shift();
  while (tokens.length > 1) {
    const n = tokens.length;
    if (n > 3 && tokens[n - 3] === "L" && tokens[n - 2] === "L" && tokens[n - 1] === "C") {
      tokens.length = n - 3;
    } else if (n > 2 && tokens[n - 2] === "N" && tokens[n - 1] === "A") {
      tokens.length = n - 2;
    } else if (CORPORATE_TOKENS.has(tokens[n - 1])) {
      tokens.pop();
    } else {
      break;
    }
  }
  return tokens.join(" ");
}

const PROFESSIONAL_SUFFIXES = new Set([
  "MD", "DDS", "DMD", "DO", "DPM", "OD", "DC", "DVM", "CPA", "ESQ", "PHD", "RN", "NP",
]);

// Words that mark an organisation, so a short all-alphabetic name containing one is kept.
const ORGANISATION_WORDS = new Set([
  "UNIVERSITY", "COLLEGE", "SCHOOL", "SCHOOLS", "INSTITUTE", "HOSPITAL", "HOSPITALS",
  "CLINIC", "CENTER", "CENTRE", "FOUNDATION", "HEALTH", "HEALTHCARE", "MEDICAL",
  "SYSTEM", "SYSTEMS", "TECHNOLOGY", "TECHNOLOGIES", "TECH", "SOLUTIONS", "SERVICES",
  "GROUP", "PARTNERS", "ASSOCIATES", "CONSULTING", "LABS", "LABORATORIES", "SOFTWARE",
  "BANK", "CAPITAL", "DISTRICT", "COUNTY", "CITY", "STATE", "DEPARTMENT", "BOARD",
  "AUTHORITY", "ACADEMY", "SOCIETY", "ASSOCIATION", "TRUST", "FUND", "NETWORK",
  "NETWORKS", "GLOBAL", "INTERNATIONAL", "INDUSTRIES", "ENTERPRISES", "HOLDINGS",
  "AMERICA", "USA", "US", "OF", "AND", "LABORATORY", "NATIONAL",
  // R42: DENTAL, like MEDICAL, so "Smith Dental Care PLLC" stays a business once its suffix no longer cancels.
  // Words such as FAMILY or CARE are left out on purpose: "Desai Family Household" is a household, a person.
  "DENTAL",
]);

/** Professional-entity suffixes (R42): the form of a practice in a person's own name, as in "Jane Smith, P.C.". */
const PROFESSIONAL_ENTITY = new Set(["PC", "PA", "PLLC", "PSC", "APC", "SC"]);

/** The words without one trailing professional-entity suffix, written whole ("PLLC") or letter by letter ("P C"). */
function withoutProfessionalEntity(tokens: string[]): string[] {
  for (let k = 1; k <= 4 && k < tokens.length; k++) {
    const tail = tokens.slice(-k);
    if ((k === 1 || tail.every((t) => t.length === 1)) && PROFESSIONAL_ENTITY.has(tail.join(""))) return tokens.slice(0, -k);
  }
  return tokens;
}

const PUNCT_EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Upper-cased words of a filed name: whitespace and commas split, edge punctuation and dots dropped. */
function wordsOf(raw: string): string[] {
  const tokens = raw
    .toUpperCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(PUNCT_EDGES, "").replace(/\./g, ""))
    .filter(Boolean);
  const n = tokens.length;
  if (n > 2 && tokens[n - 2] === "N" && tokens[n - 1] === "A") tokens.splice(n - 2, 2, "NA");
  return tokens;
}

/** The weak test: two or three alphabetic words (initials included), none a corporate token or organisation word. */
function plainPersonWords(words: string[]): boolean {
  if (words.length < 2 || words.length > 3) return false;
  if (words.some((t) => CORPORATE_TOKENS.has(t) || ORGANISATION_WORDS.has(t))) return false;
  return words.every((t) => /^\p{L}+(?:['\u2019-]\p{L}+)*$/u.test(t));
}

/** " AND " or " & " between words, any case: the joiner of two names. */
const JOINER = /\s+(?:AND|&)\s+/i;

/**
 * "strong": a professional suffix (MD, DDS, CPA ...) in the last three words, almost always a person's practice.
 * "weak": two or three plain alphabetic words with no organisation or corporate word, which also fits many companies.
 * For the weak test a trailing professional-entity suffix (PC, PA, PLLC, PSC, APC, SC; dots and commas ignored)
 * is dropped first, so "Jane Smith, P.C." is weak (R42) while "Smith Dental Care PLLC" keeps its organisation word.
 * A name joined by AND or & (R47) is weak only when it has exactly two sides and each side passes the weak test on
 * its own ("John Doe and Jane Roe"); one word a side ("Johnson & Johnson") or any corporate or organisation word
 * gives null.
 */
export function personNameSignal(raw: string): "strong" | "weak" | null {
  const tokens = wordsOf(raw);
  if (tokens.slice(-3).some((t) => PROFESSIONAL_SUFFIXES.has(t))) return "strong";
  const sides = raw.split(JOINER);
  if (sides.length > 1) return sides.length === 2 && sides.every((side) => plainPersonWords(wordsOf(side))) ? "weak" : null;
  // A suffix that would leave one word ("Surname PSC") is kept, so such a name is tested as before.
  const stripped = withoutProfessionalEntity(tokens);
  return plainPersonWords(stripped.length >= 2 ? stripped : tokens) ? "weak" : null;
}

/** Filler typed into a trade-name field, compared upper-cased with edge punctuation trimmed. */
const PLACEHOLDERS = new Set(["N/A", "NA", "NONE", "SAME", "SAME AS ABOVE", "NOT APPLICABLE", "NULL", "NIL", "UNKNOWN", "NO", ""]);

/**
 * True for a filed name that is filler, not a name: N/A, NA, NONE, SAME, SAME AS ABOVE, NOT APPLICABLE, NULL,
 * NIL, UNKNOWN or NO (any case, edge punctuation trimmed, dots and spaces around a slash ignored, so "n.a." and "N / A" count),
 * or nothing at all once the punctuation is trimmed (a run of dashes or dots).
 */
export function isPlaceholderName(raw: string): boolean {
  const key = raw.normalize("NFKC").toUpperCase().replace(PUNCT_EDGES, "").replace(/\s+/g, " ");
  if (PLACEHOLDERS.has(key) || PLACEHOLDERS.has(key.replace(/\./g, "").replace(/\s*\/\s*/g, "/"))) return true;
  // Filler strung together, such as "N/A - None" or "none-n/a": every word is a filler word.
  const words = key.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length > 0 && words.every((w) => PLACEHOLDER_WORDS.has(w));
}

const PLACEHOLDER_WORDS = new Set(["N", "A", "NA", "NONE", "SAME", "AS", "ABOVE", "NOT", "APPLICABLE", "NULL", "NIL", "UNKNOWN", "NO"]);

const STREET_WORDS = new Set([
  "ST", "STREET", "AVE", "AVENUE", "RD", "ROAD", "BLVD", "BOULEVARD", "DR", "DRIVE", "LN", "LANE", "WAY", "SUITE",
  "STE", "FLOOR", "FL", "HWY", "HIGHWAY", "PKWY", "PARKWAY", "CT", "COURT", "PL", "PLACE", "TER", "TERRACE", "CIR",
  "CIRCLE", "TRL", "TRAIL", "SQ", "SQUARE", "PLAZA", "ROUTE", "RTE",
]);
/**
 * Words that make a house-number name a company: corporate words that are never a US state or a compass point (so
 * "123 MAIN ST DENVER CO" or "500 SE 1ST AVE" still reads as an address; CORPORATE_TOKENS also holds CO, PA, SE),
 * and a few business words that are rarely part of a street name, as in "24 East 12th Street Associates".
 */
const ADDRESS_CORPORATE_WORDS = new Set([
  "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "CORP", "CORPORATION", "COMPANY", "LP", "LLP", "PLLC", "LLLP",
  "PC", "GMBH", "ULC", "PLC", "PBC",
  "ASSOCIATES", "PARTNERS", "PROPERTIES", "REALTY", "HOLDINGS", "GROUP", "VENTURES", "RESTAURANT", "HOTEL",
  "PHARMACY", "DELI", "CAFE", "GRILL", "CONSULTING", "STORE",
]);
/** A floor, suite, unit or mailbox on its own: "9th Floor", "21st FL", "Suite 200", "STE-4B", "PO Box 12", "PMB 9". */
const UNIT_FRAGMENT =
  /^(?:\d+(?:ST|ND|RD|TH)\s+(?:FLOOR|FL)|(?:SUITE|STE|UNIT|FLOOR|FL)[.\s#-]*\d+[A-Z]?|(?:P\.?\s*O\.?\s*)?BOX\s+\d+|PMB\s+\d+)\.?$/;
/** A US state or territory code followed by a ZIP or ZIP+4, as in "TX 75001" or "MA, 01034-1234". */
const STATE_ZIP = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|" +
    "NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|GU|VI|AS|MP)\\.?,?\\s+\\d{5}(?:-\\d{4})?(?!\\d)",
  "iu",
);

/** A house number: digits, a Queens-style "99-15", or digits and one letter ("12A"); never an ordinal ("45TH"). */
const HOUSE_NUMBER = /^\d+(?:-\d+)?[A-Z]?$/;

/**
 * True for a filed name (or one comma-separated part of it) that reads as a street address: it starts with a house
 * number, holds a street word (ST, AVE, PARKWAY, COURT, SUITE ...) and no corporate or company word (INC, LLC,
 * ASSOCIATES ...); or it is a floor, suite or unit on its own ("9th Floor"). Punctuation splits words. A name that
 * starts with an ordinal, such as "45TH STREET DELI", is a name.
 */
export function looksLikeStreetAddress(raw: string): boolean {
  const text = raw.normalize("NFKC").trim().toUpperCase();
  if (UNIT_FRAGMENT.test(text)) return true;
  if (!HOUSE_NUMBER.test(text.split(/[\s,]+/)[0])) return false;
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.some((w) => STREET_WORDS.has(w)) && !words.some((w) => ADDRESS_CORPORATE_WORDS.has(w));
}

const partsOf = (raw: string) => raw.normalize("NFKC").split(",").map((p) => p.trim());

/**
 * True for a filed name that holds an address anywhere (R46): a comma-separated part that is a street address or a
 * floor (see looksLikeStreetAddress), a US state and ZIP, or a Canadian postal code. A trade name like that is
 * blanked whole; one in `also` or an owner name fails the writer's gate.
 */
export function addressIn(raw: string): boolean {
  return STATE_ZIP.test(raw) || POSTAL.test(raw) || looksLikeStreetAddress(raw) || partsOf(raw).some(looksLikeStreetAddress);
}

/** True when a state and ZIP starts in `part`, possibly running on into the next part ("GRANVILLE MA, 01034"). */
function stateZipStartsIn(part: string, next: string | undefined): boolean {
  const m = STATE_ZIP.exec(next === undefined ? part : `${part}, ${next}`);
  return m !== null && m.index < part.length;
}

/**
 * An employer name without an appended address (R46): from the first comma-separated part that is a street address,
 * a floor, or starts a state and ZIP (or, after the first part, holds a Canadian postal code) on, every part is
 * removed. "" means the name was only an address, as is a name that still reads as one ("1234, 100th Avenue NE").
 * A Canadian numbered-company name (R37) keeps its first part, number included. A postal-code look-alike in the
 * first part ("A1B2C3 HOLDINGS INC") is a name, left to R33.
 */
export function stripTrailingAddress(name: string): string {
  if (isNumberedCompanyName(name)) return name;
  const raw = name.split(",");
  const parts = partsOf(name);
  let kept = name;
  for (let i = isNumberedCompanyName(parts[0]) ? 1 : 0; i < parts.length; i++) {
    const p = parts[i];
    if (looksLikeStreetAddress(p) || stateZipStartsIn(p, parts[i + 1]) || (i > 0 && POSTAL.test(p))) {
      kept = raw.slice(0, i).join(",").trim().replace(/[\s,;:/#|_\-\u2013\u2014]+$/, "");
      break;
    }
  }
  return looksLikeStreetAddress(kept) ? "" : kept;
}

export function looksLikePersonName(raw: string): boolean {
  return personNameSignal(raw) !== null;
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 10);
}

/** What a US employer id hashes: the FEIN when there is one, else the normalised name and state. */
export function usEmployerKey(fein: string | null, normName: string, state: string | null): string {
  const cleanFein = fein?.trim();
  return cleanFein ? `fein:${cleanFein}` : `name:${normName}|${state}`;
}

export function usEmployerId(fein: string | null, normName: string, state: string | null): string {
  return `us-${shortHash(usEmployerKey(fein, normName, state))}`;
}

/** What a Canadian employer id hashes: the normalised name and province. */
export function caEmployerKey(normName: string, province: string): string {
  return `${normName}|${province}`;
}

export function caEmployerId(normName: string, province: string): string {
  return `ca-${shortHash(caEmployerKey(normName, province))}`;
}

const TWO_LABEL_SUFFIXES = new Set([
  "co.kr", "or.kr", "ac.kr", "co.uk", "org.uk", "ac.uk", "com.au", "co.jp",
  "co.in", "com.br", "com.cn", "com.sg", "co.nz",
]);

export function companyIdFromUrl(urlOrHost: string): string {
  const host = urlOrHost
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^.*@/, "")
    .replace(/:\d*$/, "")
    .toLowerCase()
    .replace(/^www\./, "");
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return TWO_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}
