import type { ColorToken, PickEntry, PickLists, Profile, Settings, StatusEntry } from "./types";

export const SCHEMA_VERSION = 1;

const entry = (id: string, label: string, color?: ColorToken): PickEntry => (color ? { id, label, color } : { id, label });
const status = (id: string, label: string, group: StatusEntry["group"], stageRank: number, color: ColorToken): StatusEntry => ({
  id, label, group, stageRank, color,
});

export function defaultPickLists(): PickLists {
  return {
    statuses: [
      status("saved", "Saved", "open", 1, "gray"),
      status("preparing", "Preparing", "open", 2, "gray"),
      status("applied", "Applied", "open", 3, "blue"),
      status("screening", "Screening", "open", 4, "blue"),
      status("oa", "Online assessment", "open", 5, "blue"),
      status("interviewing", "Interviewing", "open", 6, "purple"),
      status("final", "Final round", "open", 7, "purple"),
      status("offer", "Offer", "open", 8, "green"),
      status("negotiating", "Negotiating", "open", 9, "green"),
      status("accepted", "Accepted", "won", 10, "green"),
      status("rejected", "Rejected", "lost", 0, "red"),
      status("withdrawn", "Withdrawn", "lost", 0, "red"),
      status("ghosted", "Ghosted", "lost", 0, "red"),
    ],
    channels: [
      entry("company-site", "Company site"), entry("linkedin", "LinkedIn"), entry("referral", "Referral"),
      entry("recruiter-inbound", "Recruiter inbound"), entry("indeed", "Indeed"), entry("glassdoor", "Glassdoor"),
      entry("wanted", "Wanted"), entry("saramin", "사람인"), entry("jobkorea", "JobKorea"),
      entry("programmers", "프로그래머스"), entry("linkareer", "링커리어"), entry("career-fair", "Career fair"),
      entry("cold-outreach", "Cold outreach"), entry("other", "Other"),
    ],
    countries: [entry("CA", "Canada"), entry("US", "United States"), entry("KR", "Korea")],
    workModes: [entry("remote", "Remote"), entry("hybrid", "Hybrid"), entry("onsite", "Onsite")],
    employmentTypes: [
      entry("full-time", "Full-time"), entry("contract", "Contract"), entry("internship", "Internship"),
      entry("new-grad", "New grad"), entry("part-time", "Part-time"),
    ],
    hiringTracks: [entry("gongchae", "공채 (mass hiring)"), entry("susi", "수시 (rolling)"), entry("na", "Not applicable")],
    levels: [
      entry("intern", "Intern"), entry("new-grad", "New grad"), entry("junior", "Junior"), entry("mid", "Mid"),
      entry("senior", "Senior"), entry("staff", "Staff"), entry("lead", "Lead"), entry("manager", "Manager"),
    ],
    roleFamilies: [
      entry("swe", "Software Engineer"), entry("backend", "Backend"), entry("frontend", "Frontend"),
      entry("fullstack", "Full-stack"), entry("mobile", "Mobile"), entry("data-eng", "Data Engineer"),
      entry("ml-eng", "ML Engineer"), entry("pm", "Product Manager"), entry("other", "Other"),
    ],
    roundTypes: [
      entry("recruiter-screen", "Recruiter screen"), entry("hm-screen", "Hiring manager screen"),
      entry("oa", "Online assessment"), entry("coding", "Coding interview"), entry("system-design", "System design"),
      entry("behavioral", "Behavioral"), entry("take-home", "Take-home"), entry("onsite", "Onsite loop"),
      entry("aptitude", "인적성검사"), entry("executive", "임원면접"), entry("final", "Final"), entry("other", "Other"),
    ],
    contactRelationships: [
      entry("recruiter", "Recruiter"), entry("referrer", "Referrer"), entry("hiring-manager", "Hiring manager"),
      entry("interviewer", "Interviewer"), entry("reference", "Reference"), entry("peer", "Peer"), entry("other", "Other"),
    ],
    assetKinds: [
      entry("resume", "Resume"), entry("cv", "CV"), entry("cover-letter", "Cover letter"), entry("portfolio", "Portfolio"),
      entry("transcript", "Transcript"), entry("certificate", "Certificate"), entry("other", "Other"),
    ],
    answerKinds: [entry("answer", "Answer"), entry("star", "STAR story"), entry("email", "Email template")],
    answerThemes: [
      entry("about-me", "Tell me about yourself"), entry("why-company", "Why this company"), entry("why-role", "Why this role"),
      entry("strengths", "Strengths"), entry("weaknesses", "Weaknesses"), entry("conflict", "Conflict"),
      entry("leadership", "Leadership"), entry("failure", "Failure"), entry("salary", "Salary expectations"),
      entry("visa", "Visa/authorization"), entry("referral-request", "Referral request"),
      entry("reference-request", "Reference request"), entry("follow-up", "Follow-up"), entry("thank-you", "Thank-you"),
      entry("motivation-ko", "지원동기"), entry("growth-ko", "성장과정"), entry("aspiration-ko", "입사 후 포부"),
    ],
    prepKinds: [entry("coding", "Coding"), entry("system-design", "System design"), entry("behavioral", "Behavioral"), entry("domain", "Domain knowledge")],
    closedReasons: [
      entry("no-response", "No response"), entry("rejected-screen", "Rejected after screen"),
      entry("rejected-oa", "Rejected after OA"), entry("rejected-interview", "Rejected after interview"),
      entry("position-closed", "Position closed"), entry("declined-offer", "Declined offer"),
      entry("visa", "Visa/sponsorship"), entry("compensation", "Compensation"), entry("location", "Location"), entry("other", "Other"),
    ],
  };
}

export function defaultSettings(homeTz: string, now: string): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    homeTz,
    displayCurrency: "CAD",
    fxRates: {},
    priorityWeights: { desire: 0.4, fit: 0.35, likelihood: 0.25 },
    followUpCadenceDays: 7,
    pickLists: defaultPickLists(),
    updatedAt: now,
  };
}

export function defaultProfile(now: string): Profile {
  const auth = { status: "", needsSponsorship: null, formSentence: "" };
  return {
    name: "",
    email: "",
    phones: [],
    addresses: [],
    links: [],
    education: [],
    employment: [],
    salaryExpectations: {},
    workAuth: { CA: { ...auth }, US: { ...auth }, KR: { ...auth } },
    sensitiveNote: "",
    updatedAt: now,
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
