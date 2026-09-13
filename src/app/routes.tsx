import type { ComponentType } from "react";
import { ApplicationsPage } from "../features/applications/ApplicationsPage";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { ContactsPage } from "../features/contacts/ContactsPage";
import { InterviewsPage } from "../features/interviews/InterviewsPage";
import { AssetsPage } from "../features/assets/AssetsPage";
import { AnswersPage } from "../features/answers/AnswersPage";
import { PrepPage } from "../features/prep/PrepPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { SearchPage } from "../features/search/SearchPage";

export interface PageProps {
  parts: string[];
  query: URLSearchParams;
}
export interface NavItem {
  key: string;
  to: string;
  label: string;
}

export const NAV: NavItem[] = [
  { key: "", to: "/", label: "Dashboard" },
  { key: "applications", to: "/applications", label: "Applications" },
  { key: "companies", to: "/companies", label: "Companies" },
  { key: "contacts", to: "/contacts", label: "Contacts" },
  { key: "interviews", to: "/interviews", label: "Interviews" },
  { key: "assets", to: "/assets", label: "Assets" },
  { key: "answers", to: "/answers", label: "Answers" },
  { key: "prep", to: "/prep", label: "Prep" },
  { key: "profile", to: "/profile", label: "Profile" },
  { key: "settings", to: "/settings", label: "Settings" },
];

export const PAGES: Record<string, ComponentType<PageProps>> = {
  "": DashboardPage,
  applications: ApplicationsPage,
  companies: CompaniesPage,
  contacts: ContactsPage,
  interviews: InterviewsPage,
  assets: AssetsPage,
  answers: AnswersPage,
  prep: PrepPage,
  profile: ProfilePage,
  settings: SettingsPage,
  search: SearchPage,
};
