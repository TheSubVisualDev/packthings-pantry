// Applies db/schema.sql to the configured sqld instance, then brings existing
// tables up to date with any columns added since they were created.
// Idempotent - safe to re-run.
//
// Usage: npm run migrate

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const client = createClient({
  url: process.env.LIBSQL_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

/**
 * Split into statements, with indexes held back.
 *
 * Order matters on a database that already exists. CREATE TABLE IF NOT EXISTS
 * is a no-op on an existing table, so a column added to the schema arrives via
 * ALTER TABLE below - which means an index over that column can't be created
 * until after that has run. Applying the file top to bottom fails on exactly
 * the indexes this migration adds.
 *
 * Comments are stripped before splitting because several of them contain a
 * semicolon, and a naive split would cut a statement in half.
 */
const statements = sql
  .replace(/--.*$/gm, "")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const isIndex = (statement) => /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(statement);

for (const statement of statements.filter((s) => !isIndex(s))) {
  await client.execute(statement);
}

/**
 * Columns added after the initial schema. CREATE TABLE IF NOT EXISTS is a
 * no-op on an existing table, so new columns need adding explicitly. Additive
 * only - no data is dropped or rewritten.
 */
const ADDED_COLUMNS = [
  { table: "items", column: "location", definition: "TEXT" },

  // Recipes became documents rather than lists: a blurb, timings, a source.
  { table: "recipes", column: "description", definition: "TEXT" },
  { table: "recipes", column: "prep_minutes", definition: "INTEGER" },
  { table: "recipes", column: "cook_minutes", definition: "INTEGER" },
  { table: "recipes", column: "source", definition: "TEXT" },
  // No DEFAULT CURRENT_TIMESTAMP: SQLite refuses a non-constant default on
  // ALTER TABLE ADD COLUMN, so writers set this explicitly instead.
  { table: "recipes", column: "updated_at", definition: "TIMESTAMP" },

  { table: "recipe_ingredients", column: "item_id", definition: "INTEGER REFERENCES items(id) ON DELETE SET NULL" },
  { table: "recipe_ingredients", column: "note", definition: "TEXT" },
  { table: "recipe_ingredients", column: "optional", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "recipe_ingredients", column: "section", definition: "TEXT" },
  { table: "recipe_ingredients", column: "position", definition: "INTEGER NOT NULL DEFAULT 0" },
  // "1 tin (400g)" - what one of a package unit amounts to.
  { table: "recipe_ingredients", column: "pack_size", definition: "REAL" },
  { table: "recipe_ingredients", column: "pack_unit", definition: "TEXT" },

  // Stock belongs to a kitchen now. Nullable, because rows written before
  // kitchens existed have no answer yet - the app adopts them into the first
  // kitchen anyone makes rather than this script guessing an owner.
  { table: "items", column: "kitchen_id", definition: "INTEGER REFERENCES kitchens(id) ON DELETE CASCADE" },
  { table: "products", column: "kitchen_id", definition: "INTEGER REFERENCES kitchens(id) ON DELETE CASCADE" },
  { table: "cook_events", column: "kitchen_id", definition: "INTEGER REFERENCES kitchens(id) ON DELETE CASCADE" },
  { table: "cook_events", column: "cooked_by", definition: "INTEGER REFERENCES users(id) ON DELETE SET NULL" },

  // Recipes became things somebody wrote, with a say in who sees them.
  // Nullable author for the same reason as kitchen_id: the app adopts these
  // on first sign-in rather than this script picking a name out of the air.
  { table: "recipes", column: "author_id", definition: "INTEGER REFERENCES users(id) ON DELETE SET NULL" },
  { table: "recipes", column: "visibility", definition: "TEXT NOT NULL DEFAULT 'private'" },
  { table: "recipes", column: "forked_from_id", definition: "INTEGER REFERENCES recipes(id) ON DELETE SET NULL" },

  // Photos, stored in Vercel Blob - these are just the URLs it returns.
  { table: "recipes", column: "photo_url", definition: "TEXT" },
  { table: "recipe_steps", column: "photo_url", definition: "TEXT" },
];

for (const { table, column, definition } of ADDED_COLUMNS) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((row) => row.name === column);
  if (exists) {
    console.log(`ok: ${table}.${column} already present`);
    continue;
  }
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`added: ${table}.${column}`);
}

// Safe now that every column the schema declares is present.
for (const statement of statements.filter(isIndex)) {
  await client.execute(statement);
}
console.log(`indexes: ${statements.filter(isIndex).length} ensured`);

/**
 * Links recipe lines to stock by name, for rows written before item_id existed.
 * Only ever fills in nulls, so re-running can't undo a link made by hand, and
 * a name the pantry doesn't have is left null - that's the "not in pantry"
 * case the cook flow already handles.
 */
const linked = await client.execute(`
  UPDATE recipe_ingredients
  SET item_id = (
    SELECT i.id FROM items i WHERE LOWER(i.name) = LOWER(recipe_ingredients.item_name)
  )
  WHERE item_id IS NULL
    AND EXISTS (
      SELECT 1 FROM items i WHERE LOWER(i.name) = LOWER(recipe_ingredients.item_name)
    )
`);
console.log(`linked: ${linked.rowsAffected} recipe lines matched to stock`);

const unlinked = await client.execute(
  "SELECT COUNT(*) AS n FROM recipe_ingredients WHERE item_id IS NULL",
);
console.log(`unlinked: ${unlinked.rows[0].n} lines the pantry has never held`);

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log("Tables:", tables.rows.map((r) => r.name).join(", "));
