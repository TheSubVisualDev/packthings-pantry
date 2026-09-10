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
await client.executeMultiple(sql);

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
