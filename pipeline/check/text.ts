// Readable text of an HTML page, used to fingerprint a cited source. Deliberately simple (no DOM):
// the same HTML always gives the same text, which is all the weekly re-check needs.
import { createHash } from "node:crypto";

/** Pages with less readable text than this are stored as "manual" (probably script-rendered or blocked). */
export const MIN_TEXT = 200;

const DROP = ["script", "style", "noscript", "nav", "header", "footer", "svg"];

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

export function extractText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of DROP) {
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
