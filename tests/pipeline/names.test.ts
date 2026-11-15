// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  caEmployerId,
  companyIdFromUrl,
  isNumberedCompanyName,
  isPlaceholderName,
  looksLikePersonName,
  looksLikeStreetAddress,
  personNameSignal,
  feinTokens,
  normalizeName,
  stripFeinTokens,
  usEmployerId,
} from "../../pipeline/normalize/names";

describe("isNumberedCompanyName (R37)", () => {
  it("is true for a 6 to 10 digit registry number, a province or Canada, then a corporate word", () => {
    for (const name of [
      "101234567 Saskatchewan Ltd.", "123456789 Canada Inc.", "1234567 Ontario Inc.", "123456 Alberta Ltd",
      "1234567890 B.C. Ltd.", "123456789 BC LTD", "987654321 Québec inc.", "987654321 QUEBEC INC", "123456789 Sask. Ltd.",
      "123456789 Ont. Limited", "123456789 Alta Corp.", "123456789 Man. Ltd", "123456789 Nova Scotia Limited",
      "123456789 N.S. Ltd.", "123456789 New Brunswick Inc.", "123456789 N.B. Ltée", "123456789 Newfoundland and Labrador Inc.",
      "123456789 Prince Edward Island Inc.", "123456789 P.E.I. Inc.", "123456789 Yukon Inc.", "123456789 Northwest Territories Ltd.",
      "123456789 Nunavut Ltd.", "123456789 Canadian Corporation", "123456789 Canada ULC", "123456789 Canada Co.",
      "123456789 Québec Limitée", "123456789 Colombie-Britannique Ltée", "101234567 Saskatchewan, Ltd.", "101234567 saskatchewan ltd",
    ]) {
      expect(isNumberedCompanyName(name), name).toBe(true);
    }
  });

  it("is false for anything else", () => {
    for (const name of [
      "12345 Ontario Inc.", "12345678901 Ontario Inc.", "ACME 123456789 Ontario Inc.", "123456789 Ontario", "123456789 Inc.",
      "123456789 Ontario Holdings Inc.", "12-3456789 Ontario Inc.", "ACME INC 12-3456789", "123456789", "Saskatchewan Ltd.",
      "9123-4567 Québec inc.",
    ]) {
      expect(isNumberedCompanyName(name), name).toBe(false);
    }
  });
});

describe("feinTokens", () => {
  it("finds FEIN-shaped tokens by digit boundaries, with a hyphen, en dash, underscore or no separator", () => {
    expect(feinTokens("ACME 12-3456789")).toEqual(["123456789"]);
    expect(feinTokens("123456789.")).toEqual(["123456789"]);
    expect(feinTokens("12-3456789-0001")).toEqual(["123456789"]);
    expect(feinTokens("ACME_123456789")).toEqual(["123456789"]);
    expect(feinTokens("12\u20133456789 and 98_7654321")).toEqual(["123456789", "987654321"]);
    expect(feinTokens("ABC123456789DEF")).toEqual(["123456789"]);
  });

  it("does not match a space separator, 8 digits or 10 digits", () => {
    expect(feinTokens("12 3456789")).toEqual([]);
    expect(feinTokens("ACME 12345678 LLC")).toEqual([]);
    expect(feinTokens("ACME 1234567890 LLC")).toEqual([]);
  });
});

describe("stripFeinTokens", () => {
  it("removes the new separator forms and the punctuation they leave", () => {
    expect(stripFeinTokens("ACME_123456789")).toBe("ACME");
    expect(stripFeinTokens("ACME 123456789.")).toBe("ACME");
    expect(stripFeinTokens("ACME - 12\u20133456789 - INC")).toBe("ACME INC");
    expect(stripFeinTokens("ACME 12-3456789-0001")).not.toMatch(/3456789/);
    expect(stripFeinTokens("ACME 12 3456789")).toBe("ACME 12 3456789");
  });

  it("strips FEIN-shaped tokens but keeps a numbered-company name whole", () => {
    expect(stripFeinTokens("ACME INC 12-3456789")).toBe("ACME INC");
    expect(stripFeinTokens("101234567 Saskatchewan Ltd.")).toBe("101234567 Saskatchewan Ltd.");
    expect(stripFeinTokens("123456789 Canada Inc.")).toBe("123456789 Canada Inc.");
    expect(stripFeinTokens("123456789 Ontario Holdings Inc.")).toBe("Ontario Holdings Inc.");
    expect(stripFeinTokens("1234567 Ontario Inc.")).toBe("1234567 Ontario Inc.");
  });
});

describe("normalizeName", () => {
  it("drops corporate suffixes and a leading THE", () => {
    expect(normalizeName("Google LLC")).toBe("GOOGLE");
    expect(normalizeName("GOOGLE, L.L.C.")).toBe("GOOGLE");
    expect(normalizeName("The Boeing Company")).toBe("BOEING");
    expect(normalizeName("Acme Co Inc")).toBe("ACME");
  });
  it("deletes dots, keeps the rest joined", () => {
    expect(normalizeName("Amazon.com Services LLC")).toBe("AMAZONCOM SERVICES");
  });
  it("strips accents", () => {
    expect(normalizeName("Société Générale Ltée")).toBe("SOCIETE GENERALE");
  });
  it("turns & into AND and other punctuation into spaces", () => {
    expect(normalizeName("Johnson & Johnson")).toBe("JOHNSON AND JOHNSON");
    expect(normalizeName("Foo-Bar/Baz, Inc.")).toBe("FOO BAR BAZ");
  });
});

describe("looksLikePersonName", () => {
  it("flags people", () => {
    for (const n of ["JANE DOE MD PC", "John A. Smith", "Dr. Jane Doe, DDS", "KIM & LEE CPA LLP", "Maria O’Brien", "Maria O'Brien"]) {
      expect(looksLikePersonName(n), n).toBe(true);
    }
  });
  it("keeps companies", () => {
    for (const n of ["Palo Alto Networks, Inc.", "Amazon.com Services LLC", "Smith Dental Care PLLC", "Google LLC", "Do It Best Corp", "AT&T SERVICES INC", "ERNST & YOUNG U.S. LLP"]) {
      expect(looksLikePersonName(n), n).toBe(false);
    }
  });
  it("keeps institutional sponsors", () => {
    for (const n of ["Stanford University", "University of Michigan", "Mayo Clinic", "Cleveland Clinic Foundation"]) {
      expect(looksLikePersonName(n), n).toBe(false);
    }
  });
  it("still flags a professional suffix on an institutional-looking name", () => {
    expect(looksLikePersonName("Jane Clinic MD")).toBe(true);
  });
});

describe("corporate tokens and person signals", () => {
  it("normalizes N.A. and the added suffixes away", () => {
    expect(normalizeName("Citibank, N.A.")).toBe("CITIBANK");
    expect(normalizeName("Citibank N. A.")).toBe("CITIBANK");
    expect(normalizeName("Anthropic, PBC")).toBe("ANTHROPIC");
    expect(normalizeName("Siemens AG")).toBe("SIEMENS");
    expect(normalizeName("Acme Pty Ltd")).toBe("ACME");
  });
  it("does not treat institutions as people", () => {
    for (const n of ["Citibank, N.A.", "Citibank N. A.", "Anthropic, PBC", "Brookhaven National Laboratory"]) {
      expect(looksLikePersonName(n), n).toBe(false);
    }
  });
  it("splits strong and weak signals", () => {
    expect(personNameSignal("JANE DOE MD PC")).toBe("strong");
    expect(personNameSignal("John A. Smith")).toBe("weak");
    expect(personNameSignal("General Motors")).toBe("weak");
    expect(personNameSignal("Google LLC")).toBeNull();
  });
});

describe("professional-entity suffixes on a person's name (R42)", () => {
  it("keeps the weak signal when a two- or three-word name ends in PC, PA, PLLC, PSC, APC or SC", () => {
    for (const n of [
      "Jane Smith, P.C.", "John A. Doe PLLC", "JANE SMITH PA", "Jane Smith, P. C.", "Mary Lee APC", "John Doe PSC",
      "Jane Roe, S.C.", "Jane Smith,P.C.", "Kim & Lee PA",
    ]) {
      expect(personNameSignal(n), n).toBe("weak");
    }
  });
  it("gives null when what is left is one word, has an organisation word, or the suffix is a corporate one", () => {
    for (const n of ["Smith Dental Care PLLC", "Google LLC", "Smith PC", "Acme Software PA", "Jane Smith Holdings PC", "Lee Family Medicine PLLC"]) {
      expect(personNameSignal(n), n).toBeNull();
    }
  });
  it("leaves the strong rule as it was", () => {
    expect(personNameSignal("JANE DOE MD PC")).toBe("strong");
    expect(personNameSignal("John Smith DDS, PLLC")).toBe("strong");
    expect(personNameSignal("Dr. Jane Doe, DDS")).toBe("strong");
  });
});

describe("filler and street addresses typed as names", () => {
  it("recognises placeholders in any case, with edge punctuation, dots and spaced slashes", () => {
    for (const n of ["N/A", "n/a", "NA", "N.A.", "N / A", "(none)", "None.", "SAME", "Same as above", "NOT APPLICABLE", "null", "NIL", "-", "---", "...", ". .", "", "  ", "*"]) {
      expect(isPlaceholderName(n), JSON.stringify(n)).toBe(true);
    }
  });
  it("keeps names that only contain such a word", () => {
    for (const n of ["NA Holdings", "Same Day Delivery LLC", "Nil Labs", "None Such Inc", "N/A Group", "ACME BOTS", "3M"]) {
      expect(isPlaceholderName(n), n).toBe(false);
    }
  });
  it("recognises a street address: a house number, a street word and no corporate word", () => {
    for (const n of [
      "123 Main St", "1600 Amphitheatre Pkwy", "1 Infinite Loop Suite 200", "500 SE 1st Ave.", "99-15 Ulmer Street",
      "2000 Market Street, Philadelphia, PA 19103", "1 Main St Denver CO", "45 Fremont St. 9th Floor", "12A Elm Rd",
    ]) {
      expect(looksLikeStreetAddress(n), n).toBe(true);
    }
  });
  it("keeps company names with numbers or street words", () => {
    for (const n of [
      "3M COMPANY", "7-ELEVEN, INC.", "1 WORLD TRADE CENTER LLC", "21ST CENTURY FOX", "45TH STREET HOMES",
      "9TH AVENUE PHARMACY", "Main Street Bank", "600 Grant Street LLC", "123 DATA LLC", "2-Spirited People of the 1 st Nations",
      "ACME WAY", "14 Street Medical PC", "",
    ]) {
      expect(looksLikeStreetAddress(n), n).toBe(false);
    }
  });
});

describe("employer ids", () => {
  it("uses the FEIN when present", () => {
    expect(usEmployerId("123456789", "GOOGLE", "CA")).toBe(usEmployerId("123456789", "OTHER", "NY"));
    expect(usEmployerId("123456789", "GOOGLE", "CA")).toMatch(/^us-[0-9a-f]{10}$/);
  });
  it("falls back to name and state", () => {
    expect(usEmployerId(null, "ACME", "CA")).not.toBe(usEmployerId(null, "ACME", "NY"));
    expect(usEmployerId(null, "ACME", "CA")).toBe(usEmployerId(null, "ACME", "CA"));
    expect(usEmployerId(null, "ACME", null)).toMatch(/^us-[0-9a-f]{10}$/);
  });
  it("treats a blank FEIN as absent", () => {
    const base = usEmployerId(null, "ACME", "CA");
    expect(usEmployerId("", "ACME", "CA")).toBe(base);
    expect(usEmployerId("   ", "ACME", "CA")).toBe(base);
    expect(usEmployerId(null, "ACME", "CA")).toBe(base);
    expect(usEmployerId("123456789", "ACME", "CA")).not.toBe(base);
  });
  it("pins golden ids so the hashed strings never change unnoticed", () => {
    expect(usEmployerId("123456789", "X", null)).toBe("us-9004d1148f");
    expect(usEmployerId(null, "ACME", "CA")).toBe("us-0009722150");
    expect(caEmployerId("SHOPIFY", "ON")).toBe("ca-d5bdabb1eb");
  });
  it("builds Canadian ids from name and province", () => {
    expect(caEmployerId("SHOPIFY", "ON")).toMatch(/^ca-[0-9a-f]{10}$/);
    expect(caEmployerId("SHOPIFY", "ON")).not.toBe(caEmployerId("SHOPIFY", "BC"));
  });
});

describe("companyIdFromUrl", () => {
  it("reduces to the registrable domain", () => {
    expect(companyIdFromUrl("https://about.gitlab.com/")).toBe("gitlab.com");
    expect(companyIdFromUrl("aws.amazon.com")).toBe("amazon.com");
    expect(companyIdFromUrl("https://www.toss.im")).toBe("toss.im");
    expect(companyIdFromUrl("x.ai")).toBe("x.ai");
    expect(companyIdFromUrl("https://www.samsung.co.kr/careers")).toBe("samsung.co.kr");
    expect(companyIdFromUrl("jobs.bbc.co.uk")).toBe("bbc.co.uk");
  });
  it("handles case, query, port and bare hosts with paths", () => {
    expect(companyIdFromUrl("HTTPS://WWW.Stripe.com")).toBe("stripe.com");
    expect(companyIdFromUrl("https://www.stripe.com:8080/a?b=c#d")).toBe("stripe.com");
    expect(companyIdFromUrl("stripe.com/jobs?x=1")).toBe("stripe.com");
  });
});
