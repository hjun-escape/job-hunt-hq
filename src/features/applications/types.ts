import type { Application } from "../../domain/types";

/** A patch either replaces fields directly, or is computed from the current record --
 * required for any nested object/array (e.g. answerIds) so a stale render never clobbers
 * a concurrent change. See Repository.modify. */
export type AppPatch = Partial<Application> | ((current: Application) => Partial<Application>);
