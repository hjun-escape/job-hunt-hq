import { createHash } from "node:crypto";

const CORPORATE_TOKENS = new Set([
  "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "LTEE", "CORP", "CORPORATION",
  "CO", "COMPANY", "LP", "LLP", "PLLC", "PC", "PA", "GMBH", "SA", "ULC",
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
  "AMERICA", "USA", "US", "OF", "AND",
]);

const PUNCT_EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function looksLikePersonName(raw: string): boolean {
  const tokens = raw
    .toUpperCase()
    .split(/\s+/)
    .map((t) => t.replace(PUNCT_EDGES, "").replace(/\./g, ""))
    .filter(Boolean);
  if (tokens.slice(-3).some((t) => PROFESSIONAL_SUFFIXES.has(t))) return true;
  if (tokens.length < 2 || tokens.length > 3) return false;
  if (tokens.some((t) => CORPORATE_TOKENS.has(t) || ORGANISATION_WORDS.has(t))) return false;
  return tokens.every((t) => /^\p{L}+(?:['-]\p{L}+)*$/u.test(t));
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 10);
}

export function usEmployerId(fein: string | null, normName: string, state: string | null): string {
  return `us-${shortHash(fein ? `fein:${fein}` : `name:${normName}|${state}`)}`;
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
