const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const ID_PREFIX = {
  applications: "app",
  companies: "co",
  contacts: "ct",
  assets: "as",
  answers: "an",
  interviews: "iv",
  prep: "pr",
} as const;

export function newId(prefix: string, now: number = Date.now()): string {
  return `${prefix}_${now.toString(36)}_${randomChars(6)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
