// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadRoles } from "../../pipeline/normalize/roles";

const r = loadRoles();

const IDS = [
  "data-engineer", "ml-engineer", "data-scientist", "data-analyst", "frontend-engineer", "mobile-engineer",
  "devops-sre", "security-engineer", "qa-engineer", "embedded-engineer", "engineering-manager",
  "solutions-architect", "sales-engineer", "research-scientist", "software-engineer", "hardware-engineer",
  "network-engineer", "product-manager", "program-manager", "designer", "business-analyst",
  "financial-analyst", "accountant", "consultant", "electrical-engineer", "mechanical-engineer",
  "civil-engineer", "physician", "nurse", "professor", "teacher",
];

describe("US classification", () => {
  it("assigns the brief's examples", () => {
    expect(r.us("Senior Software Engineer", "15-1252.00")).toBe("software-engineer");
    expect(r.us("Data Engineer II", "15-1252")).toBe("data-engineer");
    expect(r.us("Machine Learning Engineer", "15-1252")).toBe("ml-engineer");
    expect(r.us("Data Scientist", "15-2051")).toBe("data-scientist");
    expect(r.us("Product Manager", "11-2021")).toBe("product-manager");
    expect(r.us("Registered Nurse", "29-1141")).toBe("nurse");
  });

  it("ignores a title phrase when the SOC code is implausible", () => {
    expect(r.us("Software Engineer", "29-1141")).toBe("soc-29");
  });

  it("falls back to the SOC major group, or unknown when the code is missing or malformed", () => {
    expect(r.us("Anything", "")).toBe("soc-unknown");
    expect(r.us("Anything", "n/a")).toBe("soc-unknown");
    expect(r.us("Systems Wizard", "15-1299.08")).toBe("soc-15");
    expect(r.us("Cook", "35-2014")).toBe("soc-35");
  });

  it("normalises titles: case, accents, punctuation and spacing", () => {
    expect(r.us("  FRONT-END   Developer ", "15-1254")).toBe("frontend-engineer");
    expect(r.us("Ingénieur Data Engineer", "15-1252")).toBe("data-engineer");
    expect(r.us("Software Engineer/Developer", "15-1252")).toBe("software-engineer");
  });

  it("matches phrases on word boundaries only", () => {
    expect(r.us("Contester Lead", "15-1252")).toBe("soc-15");
    expect(r.us("Pharmaqa Lead", "15-1252")).toBe("soc-15");
    expect(r.us("Tax Partner", "13-2011")).toBe("accountant");
    expect(r.us("Taxonomist", "13-2011")).toBe("soc-13");
    expect(r.us("Sdevelopment Lead", "15-1252")).toBe("soc-15");
  });

  it("accepts SOC codes without the hyphen or decimal part", () => {
    expect(r.us("Software Engineer", "151252")).toBe("software-engineer");
    expect(r.us("Software Engineer", " 15-1252.00 ")).toBe("software-engineer");
  });

  it("picks the first role in file order when several match", () => {
    expect(r.us("Machine Learning Data Engineer", "15-1252")).toBe("data-engineer");
    expect(r.us("Data Scientist, Machine Learning Engineer", "15-2051")).toBe("ml-engineer");
  });

  it("recognises common abbreviations", () => {
    expect(r.us("SDE II", "15-1252")).toBe("software-engineer");
    expect(r.us("SWE", "15-1252")).toBe("software-engineer");
    expect(r.us("Senior SRE", "15-1244")).toBe("devops-sre");
    expect(r.us("ML Engineer", "15-1252")).toBe("ml-engineer");
    expect(r.us("QA Analyst", "15-1253")).toBe("qa-engineer");
    expect(r.us("SDET", "15-1253")).toBe("qa-engineer");
  });

  it("reads comma-inverted manager titles as engineering manager, not software engineer", () => {
    for (const title of [
      "Manager, Software Engineering", "Manager, Software Development", "Manager, Engineering", "Senior Manager, Engineering",
      "Senior Manager, Software Engineering", "MANAGER - SOFTWARE ENGINEERING",
    ]) {
      expect(r.us(title, "11-3021"), title).toBe("engineering-manager");
      expect(r.us(title, "15-1252"), title).toBe("engineering-manager");
    }
  });

  it("assigns representative titles in every family", () => {
    expect(r.us("iOS Developer", "15-1252")).toBe("mobile-engineer");
    expect(r.us("DevOps Engineer", "15-1252")).toBe("devops-sre");
    expect(r.us("Information Security Analyst", "15-1212")).toBe("security-engineer");
    expect(r.us("Embedded Firmware Engineer", "15-1252")).toBe("embedded-engineer");
    expect(r.us("Engineering Manager", "11-3021")).toBe("engineering-manager");
    expect(r.us("Software Engineer", "15-1252")).toBe("software-engineer");
    expect(r.us("Solutions Architect", "15-1299")).toBe("solutions-architect");
    expect(r.us("Sales Engineer", "41-9031")).toBe("sales-engineer");
    expect(r.us("Research Scientist", "15-2051")).toBe("research-scientist");
    expect(r.us("ASIC Design Engineer", "17-2061")).toBe("hardware-engineer");
    expect(r.us("Network Engineer", "15-1244")).toBe("network-engineer");
    expect(r.us("Technical Program Manager", "11-3021")).toBe("program-manager");
    expect(r.us("UX Designer", "15-1255")).toBe("designer");
    expect(r.us("Business Systems Analyst", "15-1211")).toBe("business-analyst");
    expect(r.us("Financial Analyst", "13-2051")).toBe("financial-analyst");
    expect(r.us("Staff Accountant", "13-2011")).toBe("accountant");
    expect(r.us("Management Consultant", "13-1111")).toBe("consultant");
    expect(r.us("Electrical Engineer", "17-2071")).toBe("electrical-engineer");
    expect(r.us("Mechanical Engineer", "17-2141")).toBe("mechanical-engineer");
    expect(r.us("Civil Engineer", "17-2051")).toBe("civil-engineer");
    expect(r.us("Hospitalist Physician", "29-1216")).toBe("physician");
    expect(r.us("Assistant Professor", "25-1022")).toBe("professor");
    expect(r.us("Math Teacher", "25-2031")).toBe("teacher");
    expect(r.us("Data Analyst", "15-2051")).toBe("data-analyst");
  });

  it("covers common real-world title variants", () => {
    expect(r.us("Software Dev Engineer II", "15-1252")).toBe("software-engineer");
    expect(r.us("System Development Engineer I", "15-1244")).toBe("software-engineer");
    expect(r.us("Business Intelligence Engineer II", "15-1299")).toBe("data-engineer");
    expect(r.us("Technology Architect US", "15-1299")).toBe("solutions-architect");
    expect(r.us("Manager JC50 Computer Systems Engineers Architects", "15-1299")).toBe("soc-15");
    expect(r.us("Analyst Testing", "15-1253")).toBe("qa-engineer");
    expect(r.us("Performance Tester", "15-1253")).toBe("qa-engineer");
    expect(r.us("Business Analyst", "15-2031")).toBe("business-analyst");
    expect(r.us("Software Developers", "15-1252")).toBe("software-engineer");
    expect(r.us("Quality Engineering Lead", "15-1253")).toBe("qa-engineer");
  });

  it("is deterministic", () => {
    const a = loadRoles();
    const b = loadRoles();
    for (const [t, s] of [["Data Engineer", "15-1252"], ["Nurse", "29-1141"], ["x", "99-9999"]]) {
      expect(a.us(t, s)).toBe(b.us(t, s));
    }
  });
});

describe("Canadian classification", () => {
  it("maps NOC 2021 codes to roles", () => {
    expect(r.ca("21231")).toBe("software-engineer");
    expect(r.ca("21211")).toBe("data-scientist");
    expect(r.ca("21223")).toBe("data-engineer");
    expect(r.ca("21220")).toBe("security-engineer");
    expect(r.ca("21311")).toBe("hardware-engineer");
    expect(r.ca("20012")).toBe("engineering-manager");
    expect(r.ca("31301")).toBe("nurse");
    expect(r.ca("31303")).toBe("noc-3");
  });

  it("does not map telecommunication carriers managers to engineering manager", () => {
    expect(r.ca("10030")).toBe("noc-1");
  });

  it("accepts a full Occupation cell and falls back to the broad category", () => {
    expect(r.ca("21231 - Software engineers and designers")).toBe("software-engineer");
    expect(r.ca("63200")).toBe("noc-6");
    expect(r.ca("85100")).toBe("noc-8");
  });

  it("returns noc-unknown for invalid codes", () => {
    expect(r.ca("")).toBe("noc-unknown");
    expect(r.ca("2123")).toBe("noc-unknown");
    expect(r.ca("abcde")).toBe("noc-unknown");
  });
});

describe("labels and ids", () => {
  it("labels fallback groups", () => {
    expect(r.label("soc-15")).toBe("Computer and mathematical (other)");
    expect(r.label("noc-6")).toBe("Sales and service (other)");
    expect(r.label("soc-unknown")).toBe("Unknown occupation");
    expect(r.label("noc-unknown")).toBe("Unknown occupation");
    expect(r.label("data-engineer")).toBe("Data engineer");
  });

  it("covers the 23 SOC major groups and 10 NOC categories", () => {
    const soc = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55];
    for (const g of soc) expect(r.label(`soc-${g}`)).toMatch(/ \(other\)$/);
    for (let g = 0; g <= 9; g++) expect(r.label(`noc-${g}`)).toMatch(/ \(other\)$/);
  });

  it("lists the 31 role ids in the specified order", () => {
    expect(r.ids).toEqual(IDS);
    expect(new Set(r.ids).size).toBe(31);
  });

  it("gives every role a kebab-case id, a label, a SOC prefix and a title phrase", () => {
    for (const d of r.defs) {
      expect(d.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.soc.length).toBeGreaterThan(0);
      expect(d.titles.length).toBeGreaterThan(0);
      for (const t of d.titles) expect(t).toBe(t.toLowerCase().trim());
      for (const n of d.noc) expect(n).toMatch(/^\d{5}$/);
    }
  });
});
