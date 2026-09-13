export type ISODateTime = string; // "2026-09-11T14:00:00.000Z"
export type ISODate = string; // "2026-09-11"
export type Rating = 1 | 2 | 3 | 4 | 5;
export type Tier = "A" | "B" | "C";
export type ColorToken = "gray" | "blue" | "purple" | "green" | "red" | "amber";

export interface BaseDoc {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PickEntry {
  id: string;
  label: string;
  color?: ColorToken;
  archived?: boolean;
}

export interface StatusEntry extends PickEntry {
  group: "open" | "won" | "lost";
  stageRank: number;
}

export interface PickLists {
  statuses: StatusEntry[];
  channels: PickEntry[];
  countries: PickEntry[];
  workModes: PickEntry[];
  employmentTypes: PickEntry[];
  hiringTracks: PickEntry[];
  levels: PickEntry[];
  roleFamilies: PickEntry[];
  roundTypes: PickEntry[];
  contactRelationships: PickEntry[];
  assetKinds: PickEntry[];
  answerKinds: PickEntry[];
  answerThemes: PickEntry[];
  prepKinds: PickEntry[];
  closedReasons: PickEntry[];
}
export type PickListName = keyof PickLists;

export interface PriorityWeights {
  desire: number;
  fit: number;
  likelihood: number;
}

export interface Settings {
  schemaVersion: number;
  homeTz: string;
  displayCurrency: string;
  fxRates: Record<string, number>;
  priorityWeights: PriorityWeights;
  followUpCadenceDays: number;
  pickLists: PickLists;
  updatedAt: ISODateTime;
}

export interface ZonedInstant {
  at: ISODateTime;
  tz: string;
}
export interface Deadline extends ZonedInstant {
  dateOnly: boolean;
}

export type ActivityType = "status" | "note" | "interview" | "contact" | "file";
export interface ActivityEntry {
  at: ISODateTime;
  type: ActivityType;
  from?: string;
  to?: string;
  text?: string;
}

export interface Comp {
  min?: number;
  max?: number;
  currency: string;
  period: "year" | "month" | "hour";
  note?: string;
}

export interface Application extends BaseDoc {
  companyId: string;
  title: string;
  reqId?: string;
  url?: string;
  team?: string;
  countryId: string;
  city?: string;
  workModeId?: string;
  employmentTypeId?: string;
  hiringTrackId?: string;
  levelId?: string;
  roleFamilyId?: string;
  channelId: string;
  sourceNote?: string;
  deadline?: Deadline;
  appliedAt?: ISODate;
  statusId: string;
  closedReasonId?: string;
  closedAt?: ISODateTime;
  tier: Tier | null;
  desire: Rating | null;
  fit: Rating | null;
  likelihood: Rating | null;
  comp?: Comp;
  needsSponsorship: boolean | null;
  sponsorshipOffered: boolean | null;
  resumeAssetId?: string;
  coverLetterAssetId?: string;
  referrerContactId?: string;
  recruiterContactId?: string;
  answerIds: string[];
  nextAction?: string;
  nextActionDue?: ISODate;
  jobDescription?: string;
  tags: string[];
  notes: string;
  activity: ActivityEntry[];
  maxStageRank: number;
}

export interface SponsorshipPolicy {
  policy: "yes" | "no" | "unknown";
  note?: string;
}
export interface LabeledLink {
  label: string;
  url: string;
}

export interface Company extends BaseDoc {
  name: string;
  website?: string;
  industry?: string;
  size?: string;
  hq?: string;
  cities: string[];
  techStack: string[];
  sponsorship: Record<string, SponsorshipPolicy>;
  interviewProcess: string;
  sources: LabeledLink[];
  notes: string;
}

export type ReferralStatus = "not_asked" | "asked" | "agreed" | "submitted" | "declined";
export interface Contact extends BaseDoc {
  name: string;
  companyId?: string;
  title?: string;
  relationshipId: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  lastContactedAt?: ISODate;
  followUpEveryDays?: number;
  referral?: { status: ReferralStatus; askedAt?: ISODate; submittedAt?: ISODate };
  reference?: { consentAt?: ISODate; usedInApplicationIds: string[]; lastNotifiedAt?: ISODate };
  notes: string;
}

export interface StoredFile {
  assetId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: ISODateTime;
}
export interface AssetDoc extends BaseDoc {
  kindId: string;
  name: string;
  version: string;
  targetCountryIds: string[];
  targetRoleFamilyIds: string[];
  file?: StoredFile;
  changelog: string;
  notes: string;
}

export interface Answer extends BaseDoc {
  kindId: string;
  title: string;
  question?: string;
  body: string;
  themeIds: string[];
  language: "en" | "ko" | "other";
  tags: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export interface Interview extends BaseDoc {
  applicationId: string;
  roundTypeId: string;
  scheduledAt?: ZonedInstant;
  durationMin?: number;
  format: "video" | "phone" | "onsite" | "take_home" | "other";
  location?: string;
  meetingUrl?: string;
  interviewerContactIds: string[];
  interviewerNames?: string;
  prepChecklist: ChecklistItem[];
  questionsAsked: string;
  selfRating: Rating | null;
  outcome: "pending" | "passed" | "failed" | "cancelled";
  thankYouSentAt?: ISODate;
  notes: string;
}

export interface PrepItem extends BaseDoc {
  kindId: string;
  title: string;
  sourceUrl?: string;
  patterns: string[];
  difficulty: "easy" | "medium" | "hard" | null;
  companyTags: string[];
  lastAttemptedAt?: ISODate;
  attempts: number;
  confidence: Rating | null;
  notes: string;
}

export interface WorkAuth {
  status: string;
  permitType?: string;
  expiresAt?: ISODate;
  needsSponsorship: boolean | null;
  formSentence: string;
  notes?: string;
}
export interface Profile {
  name: string;
  email: string;
  phones: { label: string; value: string }[];
  addresses: { countryId: string; lines: string }[];
  links: LabeledLink[];
  education: { school: string; degree: string; field: string; start: string; end: string; gpa?: string; notes?: string }[];
  employment: { company: string; title: string; start: string; end?: string; location?: string; summary: string }[];
  salaryExpectations: Record<string, { min?: number; max?: number; currency: string }>;
  noticePeriod?: string;
  earliestStart?: string;
  workAuth: Record<string, WorkAuth>;
  sensitiveNote: string;
  updatedAt: ISODateTime;
}

export interface EntityMap {
  applications: Application;
  companies: Company;
  contacts: Contact;
  assets: AssetDoc;
  answers: Answer;
  interviews: Interview;
  prep: PrepItem;
}
export type CollectionName = keyof EntityMap;
export const COLLECTIONS: CollectionName[] = ["applications", "companies", "contacts", "assets", "answers", "interviews", "prep"];

/** The per-collection maps the store holds; domain code that needs "all records" depends on this, not on the store module. */
export interface RecordSets {
  applications: Record<string, Application>;
  companies: Record<string, Company>;
  contacts: Record<string, Contact>;
  assets: Record<string, AssetDoc>;
  answers: Record<string, Answer>;
  interviews: Record<string, Interview>;
  prep: Record<string, PrepItem>;
}
