import type { ReactNode } from "react";

const SAFE_LINK = /^https?:\/\//i;
// Tokens: **bold**, *italic*, `code`, [label](url). Longest-first alternation keeps `**` from matching as two `*`.
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("*")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const url = tok.slice(close + 2, -1);
      out.push(SAFE_LINK.test(url) ? <a key={key} href={url} target="_blank" rel="noreferrer">{label}</a> : label);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal markdown: paragraphs, `#`/`##` headings, `-`/`*` bullets, bold, italic, code, http(s) links. Everything else is text. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={`p${blocks.length}`}>{renderInline(para.join(" "), `p${blocks.length}`)}</p>); para = []; } };
  const flushList = () => { if (list.length) { blocks.push(<ul key={`u${blocks.length}`}>{list.map((item, i) => <li key={i}>{renderInline(item, `l${blocks.length}-${i}`)}</li>)}</ul>); list = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") { flushPara(); flushList(); continue; }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) { flushPara(); list.push(bullet[1]); continue; }
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara(); flushList();
      const key = `h${blocks.length}`;
      blocks.push(heading[1].length === 1 ? <h3 key={key}>{renderInline(heading[2], key)}</h3> : <h4 key={key}>{renderInline(heading[2], key)}</h4>);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return <div className="markdown">{blocks}</div>;
}
