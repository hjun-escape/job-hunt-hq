// Places: US worksites (county, state) onto metropolitan CBSAs, Canadian employers (city, province) onto
// CMAs. The index is built from two committed reference CSVs (see pipeline/cli/reference.ts). Only a city
// and a province ever come out of an address: street lines are never returned or stored.
import path from "node:path";
import { readRows } from "../load/rows";
import type { Place } from "../types";

export type UsCountyRow = { state: string; county: string; cbsa: string; title: string };
export type CaCsdRow = { province: string; csd: string; cma: string; title: string };

export type UsZipRow = { zip: string; cbsa: string };
/** A well-known name inside a CMA that is not a census subdivision, pointing at the CSD that contains it. */
export type CaAliasRow = { province: string; alias: string; csd: string };

export type PlaceIndex = {
  us(county: string | null, state: string | null, zip?: string | null): Place;
  ca(city: string | null, province: string | null): Place;
  label(key: string): string;
};

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa",
  MP: "Northern Mariana Islands",
};

export const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut",
  ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};

/** Other spellings seen in the source files: French names and retired postal codes. */
const CA_ALIASES: Record<string, string> = {
  "COLOMBIE BRITANNIQUE": "BC",
  "NOUVEAU BRUNSWICK": "NB",
  "TERRE NEUVE ET LABRADOR": "NL",
  "NEWFOUNDLAND": "NL",
  "NOUVELLE ECOSSE": "NS",
  "TERRITOIRES DU NORD OUEST": "NT",
  "ILE DU PRINCE EDOUARD": "PE",
  "QUEBEC": "QC",
  "PQ": "QC",
  "NF": "NL",
  "YK": "YT",
  "YUKON TERRITORY": "YT",
};

/** Accent and case folding. Hyphens and slashes become spaces, other punctuation is dropped. */
function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[-\u2010-\u2015/]/g, " ")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Folded key for place names: SAINT and SAINTE become ST and STE so "St.", "Saint-" and "Sainte-" meet. */
function nameKey(s: string): string {
  return fold(s)
    .split(" ")
    .map((t) => (t === "SAINT" ? "ST" : t === "SAINTE" ? "STE" : t))
    .join(" ");
}

const COUNTY_SUFFIXES = /^(.+?) (CITY AND BOROUGH|CENSUS AREA|COUNTY|PARISH|BOROUGH|MUNICIPALITY)$/;

function countyKey(s: string): string {
  // DOL sometimes annotates a county, e.g. "MIAMI-DADE (OLD DEF)".
  const k = nameKey(s.replace(/\([^)]*\)/g, " "));
  const m = COUNTY_SUFFIXES.exec(k);
  return m ? m[1] : k;
}

const US_BY_NAME = new Map(Object.entries(US_STATES).map(([code, name]) => [fold(name), code]));
const CA_BY_NAME = new Map<string, string>([
  ...Object.entries(CA_PROVINCES).map(([code, name]) => [fold(name), code] as [string, string]),
  ...Object.entries(CA_ALIASES),
]);

export function usStateCode(s: string | null): string | null {
  if (!s) return null;
  const k = fold(s);
  if (US_STATES[k]) return k;
  return US_BY_NAME.get(k) ?? null;
}

export function caProvinceCode(s: string | null): string | null {
  if (!s) return null;
  const k = fold(s);
  if (CA_PROVINCES[k]) return k;
  return CA_BY_NAME.get(k) ?? null;
}

/** key -> value, or null as soon as one key maps to two different values. */
function setUnique(map: Map<string, string | null>, key: string, value: string) {
  if (!map.has(key)) map.set(key, value);
  else if (map.get(key) !== value) map.set(key, null);
}

export function createPlaceIndex(
  usRows: UsCountyRow[],
  caRows: CaCsdRow[],
  zipRows: UsZipRow[] = [],
  aliasRows: CaAliasRow[] = [],
): PlaceIndex {
  const usMap = new Map<string, string | null>();
  const caMap = new Map<string, string | null>();
  const zipMap = new Map(zipRows.map((r) => [r.zip, r.cbsa]));
  const aliasMap = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const [code, name] of Object.entries(US_STATES)) labels.set(`US-${code}`, name);
  for (const [code, name] of Object.entries(CA_PROVINCES)) labels.set(`CA-${code}`, name);
  labels.set("US", "United States");
  labels.set("CA", "Canada");
  for (const r of usRows) {
    setUnique(usMap, `${r.state}|${countyKey(r.county)}`, r.cbsa);
    labels.set(`cbsa:${r.cbsa}`, r.title);
  }
  for (const r of caRows) {
    setUnique(caMap, `${r.province}|${nameKey(r.csd)}`, r.cma);
    labels.set(`cma:${r.cma}`, r.title);
  }

  for (const r of aliasRows) {
    const cma = caMap.get(`${r.province}|${nameKey(r.csd)}`);
    if (cma) aliasMap.set(`${r.province}|${nameKey(r.alias)}`, cma);
  }

  return {
    // A 5-digit ZIP (or the first five digits of ZIP+4) that maps to a metro wins; then the county; then region only.
    us(county, state, zip) {
      const st = usStateCode(state);
      const z = zip ? /^\s*(\d{5})(?:\D|$)/.exec(zip)?.[1] : undefined;
      const byZip = z ? zipMap.get(z) : undefined;
      const cbsa = byZip ?? (st && county ? usMap.get(`${st}|${countyKey(county)}`) : null);
      return { metro: cbsa ? `cbsa:${cbsa}` : null, region: st ? `US-${st}` : "US" };
    },
    ca(city, province) {
      const pr = caProvinceCode(province);
      if (!pr) return { metro: null, region: "CA" };
      const key = city ? `${pr}|${nameKey(city)}` : null;
      // Aliases are consulted only after a direct CSD miss; an ambiguous CSD name stays unplaced.
      const cma = key ? (caMap.has(key) ? caMap.get(key) : aliasMap.get(key)) : null;
      return { metro: cma ? `cma:${cma}` : null, region: `CA-${pr}` };
    },
    label: (key) => labels.get(key) ?? key,
  };
}

export const US_REFERENCE_FILE = "us-counties-cbsa.csv";
export const CA_REFERENCE_FILE = "ca-csd-cma.csv";
export const ZIP_REFERENCE_FILE = "us-zip-cbsa.csv";
export const CA_ALIAS_FILE = "ca-aliases.csv";

export async function loadPlaceIndex(dir = "data/reference"): Promise<PlaceIndex> {
  const us: UsCountyRow[] = [];
  const ca: CaCsdRow[] = [];
  for await (const r of readRows(path.join(dir, US_REFERENCE_FILE), ["state", "county", "cbsa", "title"])) {
    us.push({ state: r.state, county: r.county, cbsa: r.cbsa, title: r.title });
  }
  for await (const r of readRows(path.join(dir, CA_REFERENCE_FILE), ["province", "csd", "cma", "title"])) {
    ca.push({ province: r.province, csd: r.csd, cma: r.cma, title: r.title });
  }
  const zips: UsZipRow[] = [];
  for await (const r of readRows(path.join(dir, ZIP_REFERENCE_FILE), ["zip", "cbsa"])) zips.push({ zip: r.zip, cbsa: r.cbsa });
  const aliases: CaAliasRow[] = [];
  for await (const r of readRows(path.join(dir, CA_ALIAS_FILE), ["province", "alias", "csd"])) {
    aliases.push({ province: r.province, alias: r.alias, csd: r.csd });
  }
  return createPlaceIndex(us, ca, zips, aliases);
}

const PROVINCE_TOKEN = [
  ...Object.keys(CA_PROVINCES),
  ...["PQ", "NF", "YK"],
  ...Object.values(CA_PROVINCES),
  "Newfoundland",
  "Yukon Territory",
  "Colombie-Britannique",
  "Nouveau-Brunswick",
  "Terre-Neuve-et-Labrador",
  "Nouvelle-Écosse",
  "Territoires du Nord-Ouest",
  "Île-du-Prince-Édouard",
  "Québec",
]
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))
  .join("|");
const POSTAL = "[A-Za-z]\\d[A-Za-z]\\s*\\d[A-Za-z]\\d";
// The text after the province is a postal code, often truncated or mistyped in the source ("QC G9P 1R").
const TAIL = new RegExp(`^(?:(.*?)[\\s,]+)?(${PROVINCE_TOKEN})(?:[\\s,]+[A-Za-z0-9 ]{0,10})?$`, "iu");
const POSTAL_ONLY = new RegExp(`^${POSTAL}$`);

/**
 * City and province from an LMIA address such as "123 King St W, Toronto, ON M5V 1J2". Everything before
 * the city is dropped. A city containing a digit is street text, so it comes back as null.
 */
export function parseCaAddress(address: string): { city: string | null; province: string | null } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && POSTAL_ONLY.test(parts[parts.length - 1])) parts.pop();
  const last = parts.pop();
  if (!last) return { city: null, province: null };
  const m = TAIL.exec(last);
  if (!m) return { city: null, province: null };
  const province = caProvinceCode(m[2]);
  const city = (m[1]?.trim() || parts.pop() || "").trim();
  return { city: city && !/\d/.test(city) ? city : null, province };
}
