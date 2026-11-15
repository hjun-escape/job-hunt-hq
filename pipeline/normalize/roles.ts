// Role categories. US filings are classified by title phrases limited to plausible SOC codes, Canadian
// rows by NOC 2021 code. Both fall back to the occupation group. Classification is deterministic: the
// first role in file order that matches wins.
import { readFileSync } from "node:fs";
import { parse } from "yaml";

export type RoleDef = { id: string; label: string; soc: string[]; titles: string[]; noc: string[] };

export type RoleSet = {
  us(title: string, soc: string): string;
  ca(noc: string): string;
  label(id: string): string;
  ids: string[];
  defs: RoleDef[];
};

const SOC_MAJOR_GROUPS: Record<string, string> = {
  "11": "Management",
  "13": "Business and financial operations",
  "15": "Computer and mathematical",
  "17": "Architecture and engineering",
  "19": "Life, physical and social science",
  "21": "Community and social service",
  "23": "Legal",
  "25": "Educational instruction and library",
  "27": "Arts, design, entertainment, sports and media",
  "29": "Healthcare practitioners and technical",
  "31": "Healthcare support",
  "33": "Protective service",
  "35": "Food preparation and serving",
  "37": "Building and grounds cleaning and maintenance",
  "39": "Personal care and service",
  "41": "Sales and related",
  "43": "Office and administrative support",
  "45": "Farming, fishing and forestry",
  "47": "Construction and extraction",
  "49": "Installation, maintenance and repair",
  "51": "Production",
  "53": "Transportation and material moving",
  "55": "Military specific",
};

const NOC_BROAD_CATEGORIES: Record<string, string> = {
  "0": "Legislative and senior management",
  "1": "Business, finance and administration",
  "2": "Natural and applied sciences",
  "3": "Health",
  "4": "Education, law and social, community and government services",
  "5": "Art, culture, recreation and sport",
  "6": "Sales and service",
  "7": "Trades, transport and equipment operators",
  "8": "Natural resources, agriculture and related production",
  "9": "Manufacturing and utilities",
};

const UNKNOWN_LABEL = "Unknown occupation";

/** Lower-case, strip accents, turn non-alphanumerics into spaces and collapse them. */
export function normalizeTitle(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "15-1252.00", "151252" and " 15-1252 " all become "15-1252"; anything else is null. */
function normalizeSoc(raw: string): string | null {
  const m = /^(\d{2})-?(\d{4})(?:\.\d+)?$/.exec(raw.trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

function loadDefs(path: string): RoleDef[] {
  const parsed: unknown = parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${path}: expected a list of roles`);
  return parsed.map((entry, i) => {
    const d = entry as Partial<RoleDef>;
    if (typeof d.id !== "string" || typeof d.label !== "string") throw new Error(`${path}: role ${i} needs id and label`);
    return {
      id: d.id,
      label: d.label,
      soc: d.soc ?? [],
      titles: (d.titles ?? []).map((t) => normalizeTitle(t)),
      noc: (d.noc ?? []).map(String),
    };
  });
}

export function loadRoles(path = "data/roles.yaml"): RoleSet {
  const defs = loadDefs(path);
  const nocToRole = new Map<string, string>();
  for (const d of defs) for (const code of d.noc) if (!nocToRole.has(code)) nocToRole.set(code, d.id);
  const labels = new Map(defs.map((d) => [d.id, d.label]));

  return {
    ids: defs.map((d) => d.id),
    defs,
    us(title, soc) {
      const code = normalizeSoc(soc);
      if (code === null) return "soc-unknown";
      const padded = ` ${normalizeTitle(title)} `;
      for (const d of defs) {
        if (!d.soc.some((p) => code.startsWith(p))) continue;
        if (d.titles.some((t) => padded.includes(` ${t} `))) return d.id;
      }
      return `soc-${code.slice(0, 2)}`;
    },
    ca(noc) {
      const m = /^\s*(\d{5})(?!\d)/.exec(noc);
      if (!m) return "noc-unknown";
      return nocToRole.get(m[1]) ?? `noc-${m[1][0]}`;
    },
    label(id) {
      const role = labels.get(id);
      if (role) return role;
      if (id === "soc-unknown" || id === "noc-unknown") return UNKNOWN_LABEL;
      const soc = /^soc-(\d{2})$/.exec(id);
      if (soc && SOC_MAJOR_GROUPS[soc[1]]) return `${SOC_MAJOR_GROUPS[soc[1]]} (other)`;
      const noc = /^noc-(\d)$/.exec(id);
      if (noc && NOC_BROAD_CATEGORIES[noc[1]]) return `${NOC_BROAD_CATEGORIES[noc[1]]} (other)`;
      return id;
    },
  };
}
