import type { ComponentType } from "react";
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

/** Later tasks push into these two registries; the key is the first hash segment. */
export const NAV: NavItem[] = [{ key: "", to: "/", label: "Dashboard" }];
export const PAGES: Record<string, ComponentType<PageProps>> = { "": DashboardPage };
