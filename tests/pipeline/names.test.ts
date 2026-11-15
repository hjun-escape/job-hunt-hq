// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  caEmployerId,
  companyIdFromUrl,
  looksLikePersonName,
  normalizeName,
  usEmployerId,
} from "../../pipeline/normalize/names";

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
