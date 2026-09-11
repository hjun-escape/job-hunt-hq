import type { ComponentType } from "react";
import { DashboardPage } from "./DashboardPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export interface PageProps {
  parts: string[];
  query: URLSearchParams;
}
export interface NavItem {
  key: string;
  to: string;
  label: string;
}

/** Later tasks push into these two registries; the key is the first hash segment. */
export const NAV: NavItem[] = [
  { key: "", to: "/", label: "Dashboard" },
  { key: "settings", to: "/settings", label: "Settings" },
];
export const PAGES: Record<string, ComponentType<PageProps>> = {
  "": DashboardPage,
  settings: SettingsPage,
};
