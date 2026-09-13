import type { ComponentType } from "react";
import { ApplicationsPage } from "../features/applications/ApplicationsPage";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { ContactsPage } from "../features/contacts/ContactsPage";
import { AssetsPage } from "../features/assets/AssetsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { DashboardPage } from "./DashboardPage";

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
  { key: "assets", to: "/assets", label: "Assets" },
  { key: "settings", to: "/settings", label: "Settings" },
];

export const PAGES: Record<string, ComponentType<PageProps>> = {
  "": DashboardPage,
  applications: ApplicationsPage,
  companies: CompaniesPage,
  contacts: ContactsPage,
  assets: AssetsPage,
  settings: SettingsPage,
};
