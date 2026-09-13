import type { Answer, Application, AssetDoc, Company, Contact, Interview, PrepItem } from "./types";

type Base = "id" | "createdAt" | "updatedAt";

export type NewApplication = Pick<Application, "companyId" | "title" | "countryId" | "channelId" | "statusId"> &
  Partial<Omit<Application, Base>>;
export function buildApplication(input: NewApplication, id: string, now: string): Application {
  return {
    id, createdAt: now, updatedAt: now,
    tier: null, desire: null, fit: null, likelihood: null,
    needsSponsorship: null, sponsorshipOffered: null,
    answerIds: [], tags: [], notes: "", activity: [], maxStageRank: 0,
    ...input,
  };
}

export type NewCompany = Pick<Company, "name"> & Partial<Omit<Company, Base>>;
export function buildCompany(input: NewCompany, id: string, now: string): Company {
  return { id, createdAt: now, updatedAt: now, cities: [], techStack: [], sponsorship: {}, interviewProcess: "", sources: [], notes: "", ...input };
}

export type NewContact = Pick<Contact, "name" | "relationshipId"> & Partial<Omit<Contact, Base>>;
export function buildContact(input: NewContact, id: string, now: string): Contact {
  return { id, createdAt: now, updatedAt: now, notes: "", ...input };
}

export type NewAsset = Pick<AssetDoc, "kindId" | "name"> & Partial<Omit<AssetDoc, Base>>;
export function buildAsset(input: NewAsset, id: string, now: string): AssetDoc {
  return { id, createdAt: now, updatedAt: now, version: "v1", targetCountryIds: [], targetRoleFamilyIds: [], changelog: "", notes: "", ...input };
}

export type NewAnswer = Pick<Answer, "kindId" | "title"> & Partial<Omit<Answer, Base>>;
export function buildAnswer(input: NewAnswer, id: string, now: string): Answer {
  return { id, createdAt: now, updatedAt: now, body: "", themeIds: [], language: "en", tags: [], ...input };
}

export type NewInterview = Pick<Interview, "applicationId" | "roundTypeId"> & Partial<Omit<Interview, Base>>;
export function buildInterview(input: NewInterview, id: string, now: string): Interview {
  return {
    id, createdAt: now, updatedAt: now, format: "video", interviewerContactIds: [], prepChecklist: [],
    questionsAsked: "", selfRating: null, outcome: "pending", notes: "", ...input,
  };
}

export type NewPrep = Pick<PrepItem, "kindId" | "title"> & Partial<Omit<PrepItem, Base>>;
export function buildPrep(input: NewPrep, id: string, now: string): PrepItem {
  return { id, createdAt: now, updatedAt: now, patterns: [], difficulty: null, companyTags: [], attempts: 0, confidence: null, notes: "", ...input };
}
