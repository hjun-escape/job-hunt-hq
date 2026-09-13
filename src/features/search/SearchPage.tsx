import type { PageProps } from "../../app/routes";
import { searchAll, type SearchHit, type SearchKind } from "../../domain/search";
import { useAppState } from "../../store/context";

const GROUPS: { kind: SearchKind; label: string }[] = [
  { kind: "company", label: "Companies" }, { kind: "application", label: "Applications" }, { kind: "contact", label: "Contacts" }, { kind: "answer", label: "Answers" },
];

export function SearchPage({ query }: PageProps) {
  const state = useAppState();
  const q = (query.get("q") ?? "").trim();
  const hits = searchAll(state, q);
  const grouped = new Map<SearchKind, SearchHit[]>();
  for (const h of hits) grouped.set(h.kind, [...(grouped.get(h.kind) ?? []), h]);
  return (
    <section>
      <h1>Search results</h1>
      {!q ? <p className="muted">Type in the search box above to find companies, applications, contacts and answers.</p>
        : hits.length === 0 ? <p className="muted">No matches for “{q}”.</p>
        : GROUPS.filter((g) => grouped.has(g.kind)).map((g) => (
          <section key={g.kind} className="section search-results" aria-labelledby={`search-${g.kind}`}>
            <h2 id={`search-${g.kind}`}>{g.label}</h2>
            <ul>
              {grouped.get(g.kind)!.map((h) => (
                <li key={h.id}><a href={h.href}>{h.title}</a>{h.subtitle ? <span className="muted"> · {h.subtitle}</span> : null}</li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  );
}
