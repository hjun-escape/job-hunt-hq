// Reads data/companies/*.yaml and validates every profile. Any other entry (a .yml file, a note, a folder) is a
// problem, so a contributor's file is never silently ignored. Dotfiles (.gitkeep, .DS_Store) are exempt.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { Profile } from "../schema/profile";
import { validateProfiles, type Problem } from "./validate";

export const DEFAULT_PROFILE_DIR = "data/companies";

export async function loadProfiles(
  dir: string = DEFAULT_PROFILE_DIR,
  today: Date = new Date(),
): Promise<{ profiles: Profile[]; problems: Problem[] }> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { profiles: [], problems: [] };
    throw e;
  }
  const files = names.filter((n) => n.endsWith(".yaml")).sort();
  const entries: { file: string; profile: unknown }[] = [];
  const problems: Problem[] = names
    .filter((n) => !n.endsWith(".yaml") && !n.startsWith("."))
    .sort()
    .map((file) => ({
      file,
      path: "(file)",
      message: "not a profile: profiles are files named <domain>.yaml (rename it, or move it out of this folder)",
    }));
  for (const file of files) {
    try {
      entries.push({ file, profile: parse(await readFile(path.join(dir, file), "utf8")) });
    } catch (e) {
      problems.push({ file, path: "(file)", message: `cannot parse YAML: ${(e as Error).message.split("\n")[0]}` });
    }
  }
  const result = validateProfiles(entries, today);
  return { profiles: result.profiles, problems: [...problems, ...result.problems] };
}
