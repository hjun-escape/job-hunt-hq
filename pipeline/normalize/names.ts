import { createHash } from "node:crypto";

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
]);

const PUNCT_EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * "strong": a professional suffix (MD, DDS, CPA ...) in the last three words, almost always a person's practice.
 * "weak": two or three plain alphabetic words with no organisation or corporate word, which also fits many companies.
 */
export function personNameSignal(raw: string): "strong" | "weak" | null {
  const tokens = raw
    .toUpperCase()
    .split(/\s+/)
    .map((t) => t.replace(PUNCT_EDGES, "").replace(/\./g, ""))
    .filter(Boolean);
  const n = tokens.length;
  if (n > 2 && tokens[n - 2] === "N" && tokens[n - 1] === "A") tokens.splice(n - 2, 2, "NA");
  if (tokens.slice(-3).some((t) => PROFESSIONAL_SUFFIXES.has(t))) return "strong";
  if (tokens.length < 2 || tokens.length > 3) return null;
  if (tokens.some((t) => CORPORATE_TOKENS.has(t) || ORGANISATION_WORDS.has(t))) return null;
  return tokens.every((t) => /^\p{L}+(?:['\u2019-]\p{L}+)*$/u.test(t)) ? "weak" : null;
}

/** Filler typed into a trade-name field, compared upper-cased with edge punctuation trimmed. */
const PLACEHOLDERS = new Set(["N/A", "NA", "NONE", "SAME", "SAME AS ABOVE", "NOT APPLICABLE", "NULL", "NIL", ""]);

/**
 * True for a filed name that is filler, not a name: N/A, NA, NONE, SAME, SAME AS ABOVE, NOT APPLICABLE, NULL or
 * NIL (any case, edge punctuation trimmed, dots and spaces around a slash ignored, so "n.a." and "N / A" count),
 * or nothing at all once the punctuation is trimmed (a run of dashes or dots).
 */
export function isPlaceholderName(raw: string): boolean {
  const key = raw.normalize("NFKC").toUpperCase().replace(PUNCT_EDGES, "").replace(/\s+/g, " ");
  return PLACEHOLDERS.has(key) || PLACEHOLDERS.has(key.replace(/\./g, "").replace(/\s*\/\s*/g, "/"));
}

const STREET_WORDS = new Set([
  "ST", "STREET", "AVE", "AVENUE", "RD", "ROAD", "BLVD", "DR", "DRIVE", "LN", "LANE", "WAY", "SUITE", "STE",
  "FLOOR", "FL", "HWY", "PKWY", "CT", "PL",
]);
/**
 * Corporate words that end a company name and are never a US state or a compass point, so "123 MAIN ST DENVER CO"
 * or "500 SE 1ST AVE" still reads as an address. (CORPORATE_TOKENS also holds CO, PA, SE and the like.)
 */
const ADDRESS_CORPORATE_WORDS = new Set([
  "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "CORP", "CORPORATION", "COMPANY", "LP", "LLP", "PLLC", "LLLP",
  "PC", "GMBH", "ULC", "PLC", "PBC",
]);

/** A house number: digits, a Queens-style "99-15", or digits and one letter ("12A"); never an ordinal ("45TH"). */
const HOUSE_NUMBER = /^\d+(?:-\d+)?[A-Z]?$/;

/**
 * True for a filed name that reads as a street address: it starts with a house number, holds a street word (ST,
 * AVE, RD, SUITE, FL ...) and no corporate word (INC, LLC, CORP ...). Dots, commas and other punctuation split
 * words. A name that starts with an ordinal, such as "45TH STREET DELI", is a name.
 */
export function looksLikeStreetAddress(raw: string): boolean {
  const text = raw.normalize("NFKC").trim().toUpperCase();
  if (!HOUSE_NUMBER.test(text.split(/[\s,]+/)[0])) return false;
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.some((w) => STREET_WORDS.has(w)) && !words.some((w) => ADDRESS_CORPORATE_WORDS.has(w));
}

export function looksLikePersonName(raw: string): boolean {
  return personNameSignal(raw) !== null;
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 10);
}

export function usEmployerId(fein: string | null, normName: string, state: string | null): string {
  const cleanFein = fein?.trim();
  return `us-${shortHash(cleanFein ? `fein:${cleanFein}` : `name:${normName}|${state}`)}`;
}

export function caEmployerId(normName: string, province: string): string {
  return `ca-${shortHash(`${normName}|${province}`)}`;
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
