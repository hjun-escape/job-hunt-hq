import type { AgendaItem } from "../../domain/agenda";
import { formatForHome } from "../../domain/dates";
import { Chip } from "../../ui/Chip";

interface Props {
  title: string;
  items: AgendaItem[];
  homeTz: string;
  emptyText: string;
  tone?: "red" | "amber" | "blue";
}

export function AgendaList({ title, items, homeTz, emptyText, tone = "blue" }: Props) {
  const id = `agenda-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {items.length === 0 ? <p className="muted">{emptyText}</p> : (
        <ul className="agenda">
          {items.map((it) => {
            const f = formatForHome({ at: it.at, tz: it.tz ?? homeTz, dateOnly: it.dateOnly }, homeTz);
            const href = it.kind === "interview" && it.interviewId ? `#/interviews/${it.interviewId}` : `#/applications/${it.applicationId}`;
            return (
              <li key={`${it.kind}-${it.applicationId}-${it.interviewId ?? ""}-${it.at}`} className="agenda-item">
                <Chip color={tone} title={f.source ?? undefined}>{f.home}</Chip>
                <a href={href}>{it.company} · {it.title}</a>
                <span className="muted">{it.detail}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
