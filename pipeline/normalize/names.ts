import { createHash } from "node:crypto";

const CORPORATE_TOKENS = new Set([
  "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "LTEE", "CORP", "CORPORATION",
  "CO", "COMPANY", "LP", "LLP", "PLLC", "PC", "PA", "GMBH", "SA", "ULC",
  "NA", "PBC", "FSB", "PLC", "NV", "BV", "AG", "SE", "SPA", "SAS", "SARL", "KK", "PTY", "PTE",
  "AB", "OY", "SRL", "LTDA", "LLLP", "LC",
]);

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
