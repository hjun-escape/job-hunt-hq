// Readable text of an HTML page, used to fingerprint a cited source. Deliberately simple (no DOM):
// the same HTML always gives the same text, which is all the weekly re-check needs.
import { createHash } from "node:crypto";

/** Pages with less readable text than this are stored as "manual" (probably script-rendered or blocked). */
export const MIN_TEXT = 200;

const DROP = ["script", "style", "noscript", "nav", "header", "footer", "svg"];
/** Page chrome: dropped from the whole-page text, kept for passages (a company's values can live in its footer). */
const CHROME = ["nav", "header", "footer"];

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** The page's readable text. `chrome: true` keeps nav, header and footer text, which is otherwise dropped. */
export function extractText(html: string, opts: { chrome?: boolean } = {}): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of DROP) {
    if (opts.chrome && CHROME.includes(tag)) continue;
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
  }
  s = s.replace(/<[^>]*>/g, " ");
  // Long opaque ids (nonces, request ids, cache busters) change on every fetch and are never policy text.
  s = decode(s).replace(/\b\d{12,}\b/g, " ").replace(/\b[0-9a-f]{20,}\b/gi, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * One passage of a text fragment (`#:~:text=[prefix-,]start[,end][,-suffix]`), percent-decoded. Empty strings
 * stand for the optional parts that are absent. A browser highlights from `start` through `end`; prefix and suffix
 * only say which occurrence.
 */
export type Passage = { prefix: string; start: string; end: string; suffix: string };

const decodePart = (s: string) => {
  if (!s) throw new Error("empty part");
  return decodeURIComponent(s);
};

/**
 * The passages a URL's text fragment names, in order: [] when the URL has none (no `#:~:`, or only an ordinary
 * anchor). Throws on a malformed one, including raw whitespace (a copied link always percent-encodes it).
 */
export function textFragment(url: string): Passage[] {
  const hash = url.indexOf("#");
  const at = hash < 0 ? -1 : url.indexOf(":~:", hash);
  if (at < 0) return [];
  const out: Passage[] = [];
  for (const directive of url.slice(at + 3).split("&")) {
    if (!directive.startsWith("text=")) continue;
    if (/\s/.test(directive)) throw new Error("text fragment has raw whitespace");
    const parts = directive.slice(5).split(",");
    const prefix = parts.length > 1 && parts[0].endsWith("-") ? decodePart(parts.shift()!.slice(0, -1)) : "";
    const suffix = parts.length > 1 && parts[parts.length - 1].startsWith("-") ? decodePart(parts.pop()!.slice(1)) : "";
    if (parts.length < 1 || parts.length > 2) throw new Error("text fragment needs a start and at most one end");
    out.push({ prefix, start: decodePart(parts[0]), end: parts.length === 2 ? decodePart(parts[1]) : "", suffix });
  }
  return out;
}

const FOLD: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'", "\u201c": '"', "\u201d": '"', "\u201e": '"',
  "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u2026": "...",
};

/**
 * Text in the form passages are matched and fingerprinted in: no whitespace (so a tag boundary inside a word, or
 * reflowed spacing, never matters), lower case, typographic quotes and dashes folded the way `extractText`
 * decodes their entities.
 */
function squash(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u2010-\u2014\u2212\u2026]/g, (c) => FOLD[c])
    .toLowerCase();
}

/** Where one passage sits in squashed text, as [from, to), or undefined when it is not there. */
function locate(text: string, p: Passage): [number, number] | undefined {
  const [prefix, start, end, suffix] = [p.prefix, p.start, p.end, p.suffix].map(squash);
  if (!start) return undefined;
  for (let i = text.indexOf(prefix + start); i >= 0; i = text.indexOf(prefix + start, i + 1)) {
    const from = i + prefix.length;
    if (!end) {
      if (text.startsWith(suffix, from + start.length)) return [from, from + start.length];
      continue;
    }
    const j = text.indexOf(end + suffix, from + start.length);
    return j < 0 ? undefined : [from, j + end.length];
  }
  return undefined;
}

/**
 * The text of every passage in `text` (squashed, one line each), or undefined when any of them is missing.
 * Each runs from the first `start` (after `prefix`) through the first `end` (before `suffix`) after it; a passage
 * without an end is just its start phrase, which only checks that the phrase is still on the page.
 */
export function passageText(text: string, passages: Passage[]): string | undefined {
  const flat = squash(text);
  const out: string[] = [];
  for (const p of passages) {
    const span = locate(flat, p);
    if (!span) return undefined;
    out.push(flat.slice(span[0], span[1]));
  }
  return out.join("\n");
}
