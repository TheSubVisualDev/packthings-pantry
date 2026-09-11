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
  // Once-opened tracking: the date on the packet stops applying when it's open.
  { table: "items", column: "opened_at", definition: "TIMESTAMP" },
  { table: "items", column: "shelf_life_days", definition: "INTEGER" },

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
  // shopping_list and its index arrive as whole-table creates from schema.sql.

  // Which tag an item is filed under. One column, so "exactly one primary"
  // needs no trigger to enforce.
  { table: "items", column: "primary_tag_id", definition: "INTEGER REFERENCES tags(id) ON DELETE SET NULL" },

  // Containers. An item is sealed_count full packs plus whatever is left in
  // the open one, which is what `quantity` now means - so a bar can show
  // two-thirds of a bottle instead of a total that moves every time you shop.
  { table: "items", column: "pack_size", definition: "REAL" },
  { table: "items", column: "pack_unit", definition: "TEXT" },
  { table: "items", column: "sealed_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  // How many containers you want on hand, which is what the shopping list
  // fills the gap to. Null means nobody has said.
  { table: "items", column: "restock_to", definition: "INTEGER" },
  // Where you buy it. Its own field rather than a tag: tags describe the
  // ingredient, this describes the errand, and the shopping list groups by it.
  { table: "items", column: "shop", definition: "TEXT" },

  // Nutrition per 100g or 100ml, as Open Food Facts reports it. Added here
  // rather than in a later migration because the columns cost nothing empty,
  // and a second ALTER pass over a live table is a second chance to be wrong.
  { table: "items", column: "kcal_100", definition: "REAL" },
  { table: "items", column: "protein_100", definition: "REAL" },
  { table: "items", column: "carbs_100", definition: "REAL" },
  { table: "items", column: "fat_100", definition: "REAL" },
  { table: "items", column: "fibre_100", definition: "REAL" },
  { table: "items", column: "salt_100", definition: "REAL" },

  // "I have some, I do not know how much." quantity is NOT NULL and making it
  // nullable would mean another table rebuild, so the honest answer is a flag
  // saying the number should not be read rather than a number pretending.
  { table: "items", column: "unspecified", definition: "INTEGER NOT NULL DEFAULT 0" },

  // Where you usually buy it, of however many places sell it.
  { table: "items", column: "preferred_shop_id", definition: "INTEGER REFERENCES shops(id) ON DELETE SET NULL" },
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
 * Turns every existing `category` string into a tag, and files the item under
 * it.
 *
 * Additive in both directions: `category` is left exactly where it is, so this
 * can be re-run and can be ignored. Only items whose primary_tag_id is still
 * null are filed, which means a tag chosen by hand is never overwritten by the
 * old category string.
 *
 * Items with no kitchen are skipped rather than guessed at - a tag belongs to a
 * kitchen, and this script has no way to know which one.
 */
const tagged = await client.execute(`
  INSERT OR IGNORE INTO tags (kitchen_id, name)
  SELECT DISTINCT kitchen_id, TRIM(category) FROM items
  WHERE kitchen_id IS NOT NULL
    AND category IS NOT NULL
    AND TRIM(category) <> ''
`);
console.log(`tags: ${tagged.rowsAffected} created from existing categories`);

const linkedTags = await client.execute(`
  INSERT OR IGNORE INTO item_tags (item_id, tag_id)
  SELECT i.id, t.id
  FROM items i
  JOIN tags t
    ON t.kitchen_id = i.kitchen_id
   AND LOWER(t.name) = LOWER(TRIM(i.category))
  WHERE i.category IS NOT NULL AND TRIM(i.category) <> ''
`);
console.log(`item_tags: ${linkedTags.rowsAffected} items tagged`);

const filed = await client.execute(`
  UPDATE items SET primary_tag_id = (
    SELECT t.id FROM tags t
    WHERE t.kitchen_id = items.kitchen_id
      AND LOWER(t.name) = LOWER(TRIM(items.category))
  )
  WHERE primary_tag_id IS NULL
    AND kitchen_id IS NOT NULL
    AND category IS NOT NULL
    AND TRIM(category) <> ''
`);
console.log(`filed: ${filed.rowsAffected} items given a primary tag`);

const untagged = await client.execute(
  "SELECT COUNT(*) AS n FROM items WHERE primary_tag_id IS NULL",
);
console.log(`untagged: ${untagged.rows[0].n} items with nothing to file them under`);

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

/**
 * Turns the old single `items.shop` string into rows in shops and item_shops.
 *
 * Same shape and same rules as the category-to-tag migration above: additive in
 * both directions, `items.shop` left exactly where it is, and only items with
 * no preferred shop yet are filled in - so a choice made by hand is never
 * overwritten by the old column.
 */
const shopsMade = await client.execute(`
  INSERT OR IGNORE INTO shops (kitchen_id, name)
  SELECT DISTINCT kitchen_id, TRIM(shop) FROM items
  WHERE kitchen_id IS NOT NULL AND shop IS NOT NULL AND TRIM(shop) <> ''
`);
console.log(`shops: ${shopsMade.rowsAffected} created from the old column`);

const shopsLinked = await client.execute(`
  INSERT OR IGNORE INTO item_shops (item_id, shop_id)
  SELECT i.id, s.id
  FROM items i
  JOIN shops s ON s.kitchen_id = i.kitchen_id AND LOWER(s.name) = LOWER(TRIM(i.shop))
  WHERE i.shop IS NOT NULL AND TRIM(i.shop) <> ''
`);
console.log(`item_shops: ${shopsLinked.rowsAffected} links made`);

const preferred = await client.execute(`
  UPDATE items SET preferred_shop_id = (
    SELECT s.id FROM shops s
    WHERE s.kitchen_id = items.kitchen_id AND LOWER(s.name) = LOWER(TRIM(items.shop))
  )
  WHERE preferred_shop_id IS NULL
    AND kitchen_id IS NOT NULL
    AND shop IS NOT NULL
    AND TRIM(shop) <> ''
`);
console.log(`preferred: ${preferred.rowsAffected} items given a usual shop`);
