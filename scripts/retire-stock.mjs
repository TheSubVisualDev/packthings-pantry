// Deletes every stock row, once, for v2. See docs/ROADMAP-V2.md.
//
// Decided 18 Oct 2026: stock tracking goes and its rows go with it - 31 in
// Pack Kitchen, 17 in Lindsey's - rather than being frozen in place. The
// tables themselves stay, empty, because sqld will not let a table with
// foreign keys pointing at it be dropped cheaply (see rebuild-items.mjs), and
// an empty table costs nothing.
//
// Not part of migrate.mjs on purpose. Migrations are additive and re-runnable;
// this is neither, and it should take somebody deciding to run it.
//
// Take a backup first:
//   node --env-file=.env.local scripts/clone-db.mjs <backup-file>
// Then:
//   node --env-file=.env.local scripts/retire-stock.mjs --yes
//
// One transaction, so it either all goes or none of it does. The foreign keys
// do the rest: item_tags, item_shops, item_prices and cookbook_links cascade
// with their item, and recipe_ingredients.item_id and shopping_list.item_id
// are set null - which is what the recipe and the list mean without a shelf.

import { createClient } from "@libsql/client";

if (!process.argv.includes("--yes")) {
  console.error("This deletes every stock row. Back up first, then pass --yes.");
  process.exit(1);
}

const url = process.env.LIBSQL_URL.startsWith("https:")
  ? process.env.LIBSQL_URL.replace(/^https:/, "wss:")
  : process.env.LIBSQL_URL;
const client = createClient({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });

// Children before parents, so nothing depends on the cascade having been
// declared on an old copy of a table that predates it.
const TABLES = [
  "cookbook_links",
  "item_tags",
  "item_shops",
  "item_prices",
  "kitchen_products",
  "pinned_recipes",
  "products",
  "items",
  // Item tags only ever described stock. Recipe tags are recipe_tags.
  "tags",
];

const before = {};
for (const table of TABLES) {
  before[table] = (await client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n;
}

await client.batch(
  [
    "UPDATE recipe_ingredients SET item_id = NULL WHERE item_id IS NOT NULL",
    "UPDATE shopping_list SET item_id = NULL WHERE item_id IS NOT NULL",
    ...TABLES.map((table) => `DELETE FROM ${table}`),
  ],
  "write",
);

for (const table of TABLES) {
  const after = (await client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n;
  console.log(`${table}: ${before[table]} -> ${after}`);
}

const broken = await client.execute("PRAGMA foreign_key_check");
console.log(`foreign_key_check: ${broken.rows.length} problems`);

// A WebSocket client holds the process open until it is closed.
client.close();
