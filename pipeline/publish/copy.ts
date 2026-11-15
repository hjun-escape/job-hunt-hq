// Exact copy shown next to the numbers and in the licence notes. Stored in meta.json so every consumer shows
// the same words. Change wording here only, never in a consumer.

export const CAVEATS = {
  lca: "A Labor Condition Application (LCA) is a step before an H-1B, H-1B1 or E-3 visa petition, not an approved visa. One LCA can cover several workers, and counts include renewals unless shown separately.",
  perm: "A certified PERM labour certification is one step toward a green card, not the green card itself.",
  lmia: "A positive LMIA is not a work permit. The list counts positions later cancelled by employers and leaves out businesses whose names include a person's name.",
  general: "These figures show past filings, not whether a company will sponsor you.",
} as const;

/** The Canadian attribution is the licence's required statement; keep its EN dash (U+2013) exactly. */
export const LICENCES = {
  code: "MIT",
  profiles: "CC BY 4.0",
  us: "US government work, public domain",
  ca: "Contains information licensed under the Open Government Licence – Canada.",
} as const;

/**
 * Notice the Statistics Canada Open Licence asks for on a product adapted from its data: the Canadian metro
 * codes and names come from the 2021 Census Geographic Attribute File. Shown in the README, DATA-LICENSE.md
 * and the landing page (meta.json's `licences` has no field for it in v1).
 */
export const STATCAN_NOTICE =
  "Adapted from Statistics Canada, Geographic Attribute File (catalogue no. 92-151-X), 2021 Census. This does not constitute an endorsement by Statistics Canada of this product.";
