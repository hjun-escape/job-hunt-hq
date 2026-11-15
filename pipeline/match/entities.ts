// Exact entity matching: maps a filing's employer to a profile id, or to a generated employer id.
// Fuzzy matching is never applied here; the coverage report only proposes it for a maintainer to review.
import type { Profile } from "../schema/profile";
import type { CaApproval, UsFiling } from "../types";
import { caEmployerId, normalizeName, usEmployerId } from "../normalize/names";

export type EntityMap = {
  us(e: UsFiling["employer"]): string | undefined;
  ca(e: CaApproval["employer"]): string | undefined;
};

/** Built once; every lookup is a constant-time map read. On a clash the first profile in the given order wins. */
export function buildEntityMap(profiles: Profile[]): EntityMap {
  const byFein = new Map<string, string>();
  const byUsName = new Map<string, string>();
  const byCa = new Map<string, string>();
  const put = (m: Map<string, string>, key: string, id: string) => {
    if (key && !m.has(key)) m.set(key, id);
  };
  for (const p of profiles) {
    for (const f of p.entities.usFeins ?? []) put(byFein, f.replace(/\D/g, ""), p.id);
    for (const n of p.entities.usNames ?? []) put(byUsName, normalizeName(n), p.id);
    for (const c of p.entities.caNames ?? []) put(byCa, `${normalizeName(c.name)}|${c.province}`, p.id);
  }
  return {
    us(e) {
      const fein = e.fein?.replace(/\D/g, "") ?? "";
      if (fein.length === 9) {
        const hit = byFein.get(fein);
        if (hit) return hit;
      }
      const byName = byUsName.get(normalizeName(e.name));
      if (byName) return byName;
      return e.tradeName ? byUsName.get(normalizeName(e.tradeName)) : undefined;
    },
    ca(e) {
      return byCa.get(`${normalizeName(e.name)}|${e.province}`);
    },
  };
}

export function ownerForUs(e: UsFiling["employer"], map: EntityMap): string {
  return map.us(e) ?? usEmployerId(e.fein, normalizeName(e.name), e.state);
}

export function ownerForCa(e: CaApproval["employer"], map: EntityMap): string {
  return map.ca(e) ?? caEmployerId(normalizeName(e.name), e.province);
}
