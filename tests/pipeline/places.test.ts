// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkZipListing, validateAliases, zipModes } from "../../pipeline/cli/reference";
import {
  caProvinceCode,
  createPlaceIndex,
  parseCaAddress,
  usStateCode,
  type CaCsdRow,
  type UsCountyRow,
} from "../../pipeline/normalize/places";

const us: UsCountyRow[] = [
  { state: "CA", county: "Santa Clara County", cbsa: "41940", title: "San Jose-Sunnyvale-Santa Clara, CA" },
  { state: "MO", county: "St. Louis County", cbsa: "41180", title: "St. Louis, MO-IL" },
  { state: "LA", county: "Jefferson Parish", cbsa: "35380", title: "New Orleans-Metairie, LA" },
  { state: "AK", county: "Anchorage Municipality", cbsa: "11260", title: "Anchorage, AK" },
  { state: "TX", county: "Dup County", cbsa: "11111", title: "One, TX" },
  { state: "TX", county: "Dup County", cbsa: "22222", title: "Two, TX" },
];
const ca: CaCsdRow[] = [
  { province: "ON", csd: "Toronto", cma: "535", title: "Toronto" },
  { province: "ON", csd: "Mississauga", cma: "535", title: "Toronto" },
  { province: "QC", csd: "Montréal", cma: "462", title: "Montréal" },
  { province: "QC", csd: "Saint-Jean-sur-Richelieu", cma: "462", title: "Montréal" },
  { province: "QC", csd: "Sainte-Julie", cma: "462", title: "Montréal" },
  { province: "ON", csd: "Ottawa", cma: "505", title: "Ottawa - Gatineau" },
  { province: "QC", csd: "Gatineau", cma: "505", title: "Ottawa - Gatineau" },
  { province: "ON", csd: "Clash", cma: "100", title: "A" },
  { province: "ON", csd: "Clash", cma: "200", title: "B" },
];
const idx = createPlaceIndex(
  us,
  ca,
  [
    { zip: "02139", cbsa: "14460" },
    { zip: "95054", cbsa: "41940" },
  ],
  [
    { province: "ON", alias: "Scarborough", csd: "Toronto" },
    { province: "QC", alias: "Saint-Laurent", csd: "Montréal" },
    { province: "ON", alias: "Ghost", csd: "Nowhere" },
    { province: "ON", alias: "Mississauga", csd: "Ottawa" },
  ],
);

describe("PlaceIndex.us", () => {
  it("places counties and normalises both sides", () => {
    expect(idx.us("Santa Clara County", "CA")).toEqual({ metro: "cbsa:41940", region: "US-CA" });
    expect(idx.us("SANTA CLARA", "CA")).toEqual({ metro: "cbsa:41940", region: "US-CA" });
    expect(idx.us("Saint Louis", "MO").metro).toBe("cbsa:41180");
    expect(idx.us("Jefferson", "LA").metro).toBe("cbsa:35380");
    expect(idx.us("Anchorage Borough", "AK").metro).toBe("cbsa:11260");
    expect(idx.us("Santa Clara  (OLD DEF)", "CA").metro).toBe("cbsa:41940");
  });

  it("falls back to the region when there is no metro", () => {
    expect(idx.us(null, "WA")).toEqual({ metro: null, region: "US-WA" });
    expect(idx.us("Unknownia", "TX")).toEqual({ metro: null, region: "US-TX" });
    expect(idx.us(null, null)).toEqual({ metro: null, region: "US" });
    expect(idx.us("Santa Clara", null)).toEqual({ metro: null, region: "US" });
  });

  it("accepts a lower-case code or a full state name", () => {
    expect(idx.us("Santa Clara", "ca").region).toBe("US-CA");
    expect(idx.us("Santa Clara", "California")).toEqual({ metro: "cbsa:41940", region: "US-CA" });
  });

  it("gives no metro when a county name maps to two metros", () => {
    expect(idx.us("Dup", "TX")).toEqual({ metro: null, region: "US-TX" });
  });
});

describe("PlaceIndex.us with a ZIP", () => {
  it("lets a ZIP that maps to a metro win, even when the county is missing or a town name", () => {
    expect(idx.us(null, "MA", "02139")).toEqual({ metro: "cbsa:14460", region: "US-MA" });
    expect(idx.us("CAMBRIDGE CITY", "MA", "02139").metro).toBe("cbsa:14460");
    expect(idx.us("Santa Clara", "CA", "02139").metro).toBe("cbsa:14460");
  });

  it("uses the first five digits of ZIP+4 and ignores anything that is not a ZIP", () => {
    expect(idx.us(null, "CA", "95054-1234").metro).toBe("cbsa:41940");
    expect(idx.us(null, "CA", "950541234").metro).toBeNull();
    expect(idx.us(null, "CA", "9505").metro).toBeNull();
    expect(idx.us(null, "CA", "ABCDE").metro).toBeNull();
  });

  it("falls back to the county when the ZIP is unknown, and to the region when both are blank", () => {
    expect(idx.us("Santa Clara", "CA", "99999")).toEqual({ metro: "cbsa:41940", region: "US-CA" });
    expect(idx.us("", "CA", "")).toEqual({ metro: null, region: "US-CA" });
    expect(idx.us(null, "CA", null)).toEqual({ metro: null, region: "US-CA" });
    expect(idx.us(null, null, undefined)).toEqual({ metro: null, region: "US" });
  });
});

describe("PlaceIndex.ca aliases", () => {
  it("places a former municipality through its alias", () => {
    expect(idx.ca("Scarborough", "ON")).toEqual({ metro: "cma:535", region: "CA-ON" });
    expect(idx.ca("Saint Laurent", "QC").metro).toBe("cma:462");
    expect(idx.ca("Scarborough", "QC").metro).toBeNull();
  });

  it("ignores an alias whose CSD is unknown, and prefers a direct CSD match over an alias", () => {
    expect(idx.ca("Ghost", "ON").metro).toBeNull();
    expect(idx.ca("Mississauga", "ON").metro).toBe("cma:535");
  });
});

describe("PlaceIndex.ca", () => {
  it("places cities", () => {
    expect(idx.ca("Mississauga", "ON")).toEqual({ metro: "cma:535", region: "CA-ON" });
    expect(idx.ca("Montreal", "QC").metro).toBe("cma:462");
    expect(idx.ca("MONTRÉAL", "Quebec").metro).toBe("cma:462");
    expect(idx.ca("Montréal", "Québec").region).toBe("CA-QC");
  });

  it("matches Saint, Sainte and hyphens in Quebec names", () => {
    expect(idx.ca("St-Jean-sur-Richelieu", "QC").metro).toBe("cma:462");
    expect(idx.ca("Saint Jean sur Richelieu", "QC").metro).toBe("cma:462");
    expect(idx.ca("Ste. Julie", "QC").metro).toBe("cma:462");
  });

  it("maps both provinces of a cross-province CMA to the same code", () => {
    expect(idx.ca("Ottawa", "ON").metro).toBe("cma:505");
    expect(idx.ca("Gatineau", "QC").metro).toBe("cma:505");
    expect(idx.ca("Gatineau", "ON").metro).toBeNull();
  });

  it("falls back to the region, and gives no metro for an ambiguous name", () => {
    expect(idx.ca("Nowhere", "ON")).toEqual({ metro: null, region: "CA-ON" });
    expect(idx.ca(null, "BC")).toEqual({ metro: null, region: "CA-BC" });
    expect(idx.ca("Toronto", null)).toEqual({ metro: null, region: "CA" });
    expect(idx.ca(null, null)).toEqual({ metro: null, region: "CA" });
    expect(idx.ca("Clash", "ON")).toEqual({ metro: null, region: "CA-ON" });
  });
});

describe("PlaceIndex.label", () => {
  it("labels metros and regions", () => {
    expect(idx.label("cbsa:41940")).toBe("San Jose-Sunnyvale-Santa Clara, CA");
    expect(idx.label("cma:505")).toBe("Ottawa - Gatineau");
    expect(idx.label("US-CA")).toBe("California");
    expect(idx.label("US-DC")).toBe("District of Columbia");
    expect(idx.label("CA-QC")).toBe("Quebec");
    expect(idx.label("US")).toBe("United States");
    expect(idx.label("CA")).toBe("Canada");
  });

  it("returns the key itself when it is unknown", () => {
    expect(idx.label("cbsa:00000")).toBe("cbsa:00000");
  });
});

describe("code lookups", () => {
  it("resolves state and province names and codes", () => {
    expect(usStateCode("New York")).toBe("NY");
    expect(usStateCode("puerto rico")).toBe("PR");
    expect(usStateCode("tx")).toBe("TX");
    expect(usStateCode("Atlantis")).toBeNull();
    expect(caProvinceCode("Ontario")).toBe("ON");
    expect(caProvinceCode("Québec")).toBe("QC");
    expect(caProvinceCode("Colombie-Britannique")).toBe("BC");
    expect(caProvinceCode("Newfoundland and Labrador")).toBe("NL");
    expect(caProvinceCode("yt")).toBe("YT");
    expect(caProvinceCode("Texas")).toBeNull();
  });
});

describe("parseCaAddress", () => {
  it("takes the city from before the province and postal code", () => {
    expect(parseCaAddress("123 King St W, Toronto, ON M5V 1J2")).toEqual({ city: "Toronto", province: "ON" });
    expect(parseCaAddress("Montréal, QC")).toEqual({ city: "Montréal", province: "QC" });
    expect(parseCaAddress("")).toEqual({ city: null, province: null });
  });

  it("handles a missing postal code, extra commas and a postal code in its own part", () => {
    expect(parseCaAddress("10 Main St, Calgary, AB")).toEqual({ city: "Calgary", province: "AB" });
    expect(parseCaAddress("Suite 5, 10 Main St, Unit 2, Calgary, AB T2P 1A1")).toEqual({ city: "Calgary", province: "AB" });
    expect(parseCaAddress("10 Main St, Calgary, AB, T2P 1A1")).toEqual({ city: "Calgary", province: "AB" });
    expect(parseCaAddress("10 Main St, Calgary, ab t2p1a1")).toEqual({ city: "Calgary", province: "AB" });
  });

  it("tolerates truncated or mistyped postal codes", () => {
    expect(parseCaAddress("5 Rue Notre-Dame, Trois-Rivières, QC G9P 1R")).toEqual({ city: "Trois-Rivières", province: "QC" });
    expect(parseCaAddress("5 Rue X, Laval, QC H7  1")).toEqual({ city: "Laval", province: "QC" });
  });

  it("handles province names in English and French", () => {
    expect(parseCaAddress("5 Rue Sherbrooke, Montréal, Québec H2X 1Y4")).toEqual({ city: "Montréal", province: "QC" });
    expect(parseCaAddress("5 Rue Sherbrooke, Montréal, Quebec")).toEqual({ city: "Montréal", province: "QC" });
    expect(parseCaAddress("1 Hwy, Surrey, British Columbia V3T 0A3")).toEqual({ city: "Surrey", province: "BC" });
    expect(parseCaAddress("1 Rue X, Moncton, Nouveau-Brunswick E1C 1A1")).toEqual({ city: "Moncton", province: "NB" });
  });

  it("handles addresses with no street or no commas before the province", () => {
    expect(parseCaAddress("Toronto ON M5V 1J2")).toEqual({ city: "Toronto", province: "ON" });
    expect(parseCaAddress("Whitehorse, YT")).toEqual({ city: "Whitehorse", province: "YT" });
  });

  it("never returns street text", () => {
    expect(parseCaAddress("123 King St W Toronto ON M5V 1J2")).toEqual({ city: null, province: "ON" });
    expect(parseCaAddress("123 Main St, ON")).toEqual({ city: null, province: "ON" });
    expect(parseCaAddress("123 Main St, Nowhereland")).toEqual({ city: null, province: null });
    expect(parseCaAddress("   ")).toEqual({ city: null, province: null });
  });
});

describe("reference CLI safety checks", () => {
  const plain = ["-rw-r--r--", "drwxr-xr-x"];
  it("accepts a plain listing", () => {
    expect(() => checkZipListing(["a.csv", "dir/b.csv"], plain)).not.toThrow();
  });

  it("rejects traversal, absolute paths, backslashes and an empty archive", () => {
    expect(() => checkZipListing(["../x"], plain)).toThrow(/unsafe path/);
    expect(() => checkZipListing(["a/../../x"], plain)).toThrow(/unsafe path/);
    expect(() => checkZipListing(["/etc/x"], plain)).toThrow(/unsafe path/);
    expect(() => checkZipListing(["a\\b"], plain)).toThrow(/unsafe path/);
    expect(() => checkZipListing([], [])).toThrow(/empty/);
  });

  it("rejects a symlink entry, read from unzip -Z output", () => {
    const out = [
      "Archive:  x.zip",
      "-rw-r--r--  3.0 unx      10 tx stor 22-Jan-27 14:29 a.csv",
      "lrwxr-xr-x  3.0 unx       5 tx stor 22-Jan-27 14:29 attributes.utf8.csv",
      "2 files, 15 bytes uncompressed",
    ].join("\n");
    expect(zipModes(out)).toEqual(["-rw-r--r--", "lrwxr-xr-x"]);
    expect(() => checkZipListing(["a.csv", "attributes.utf8.csv"], zipModes(out))).toThrow(/non-regular/);
  });

  it("validates the alias table against the CSD table", () => {
    const csds: CaCsdRow[] = [{ province: "ON", csd: "Toronto", cma: "535", title: "Toronto" }];
    expect(() => validateAliases([{ province: "ON", alias: "York", csd: "Toronto" }], csds)).not.toThrow();
    expect(() => validateAliases([{ province: "ON", alias: "York", csd: "Nowhere" }], csds)).toThrow(/unknown CSD/);
    expect(() =>
      validateAliases(
        [{ province: "ON", alias: "York", csd: "Toronto" }, { province: "ON", alias: "Etobicoke", csd: "Toronto" }],
        csds,
      ),
    ).toThrow(/not sorted/);
  });
});
