// Usage: npm run dataset:validate
// Checks every profile in data/companies. Prints one "file: path: message" line per problem and exits 1 if any.
import { loadProfiles } from "../profiles/load";

async function main(): Promise<void> {
  const { profiles, problems } = await loadProfiles();
  if (problems.length > 0) {
    for (const p of problems) console.log(`${p.file}: ${p.path}: ${p.message}`);
    process.exit(1);
  }
  console.log(`0 problems in ${profiles.length} profiles`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
