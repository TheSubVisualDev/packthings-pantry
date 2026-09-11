// Empties every table, leaving the schema in place.
//
// Usage: npm run reset -- --yes-really
//
// The flag is not decoration. This is not recoverable: there is no backup of
// the sqld volume, so every account, kitchen, recipe and photo reference goes
// and does not come back. It prints what it is about to destroy and refuses
// without the flag, so a mistyped command can only ever produce a report.
//
// Photos in Vercel Blob are deliberately NOT deleted - blobs cost nothing to
// leave lying about, and a wipe that reaches outside the database is a wipe
// that can half-succeed.

import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.LIBSQL_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

/**
 * Children before parents. Foreign keys may or may not be enforced depending
 * on how sqld was started, so the order is correct rather than lucky.
 */
const TABLES = [
  "recipe_step_ingredients",
  "recipe_steps",
  "recipe_ingredients",
  "recipe_ratings",
  "recipe_likes",
  "recipe_comments",
  "cook_events",
  "shopping_list",
  "products",
  "items",
  "kitchen_locations",
  "kitchen_members",
  "recipes",
  "kitchens",
  "follows",
  "blocks",
  "invites",
  "users",
];

const confirmed = process.argv.includes("--yes-really");

console.log(confirmed ? "Wiping:" : "Would wipe (dry run):");

let total = 0;
for (const table of TABLES) {
  const { rows } = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  const count = rows[0].n;
  total += Number(count);
  if (count > 0) console.log(`  ${table}: ${count}`);
}

if (total === 0) {
  console.log("  (already empty)");
} else if (!confirmed) {
  console.log(`\n${total} rows. Nothing has been touched.`);
  console.log("Re-run with --yes-really to actually do it.");
  process.exit(0);
}

if (confirmed) {
  for (const table of TABLES) {
    await client.execute(`DELETE FROM ${table}`);
  }

  // Ids start from 1 again, which makes a fresh run easier to read.
  await client.execute("DELETE FROM sqlite_sequence").catch(() => {});

  console.log("\nDone. Every table is empty and the schema is untouched.");
  console.log("Open /login and it will offer to claim the pantry.");
}

client.close();
