import type { RecordSets } from "./types";

export type SearchKind = "application" | "company" | "contact" | "answer";
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
const KIND_ORDER: SearchKind[] = ["company", "application", "contact", "answer"];

/** Spec §5: matches company name, application title (or its company), contact name, answer title. Prefix matches rank first. */
export function searchAll(records: Pick<RecordSets, "applications" | "companies" | "contacts" | "answers">, query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { hit: SearchHit; prefix: boolean }[] = [];
  const consider = (hit: SearchHit, ...fields: string[]) => {
    const lower = fields.map((f) => f.toLowerCase());
    if (!lower.some((f) => f.includes(q))) return;
    hits.push({ hit, prefix: lower.some((f) => f.startsWith(q)) });
  };
  for (const c of Object.values(records.companies)) consider({ kind: "company", id: c.id, title: c.name, subtitle: c.hq ?? c.industry ?? "", href: `#/companies/${c.id}` }, c.name);
  for (const a of Object.values(records.applications)) {
    const company = records.companies[a.companyId]?.name ?? "";
    consider({ kind: "application", id: a.id, title: a.title, subtitle: company, href: `#/applications/${a.id}` }, a.title, company);
  }
  for (const c of Object.values(records.contacts)) consider({ kind: "contact", id: c.id, title: c.name, subtitle: records.companies[c.companyId ?? ""]?.name ?? c.title ?? "", href: `#/contacts/${c.id}` }, c.name);
  for (const a of Object.values(records.answers)) consider({ kind: "answer", id: a.id, title: a.title, subtitle: a.question ?? "", href: `#/answers/${a.id}` }, a.title);
  return hits
    .sort((x, y) => Number(y.prefix) - Number(x.prefix) || KIND_ORDER.indexOf(x.hit.kind) - KIND_ORDER.indexOf(y.hit.kind) || x.hit.title.localeCompare(y.hit.title))
    .slice(0, limit)
    .map((h) => h.hit);
}
