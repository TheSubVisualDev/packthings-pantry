// Fills in nutrition for barcodes scanned before the pantry started keeping it.
//
//   node --import ./scripts/ts-imports.mjs --env-file=.env.local scripts/fetch-nutrition.mjs
//
// Open Food Facts is free and volunteer-run, so this asks once per barcode it
// has never asked about, pauses between requests, and stamps every answer -
// including "they do not know" - so a second run costs them nothing at all.

import { createClient } from "@libsql/client";
import { lookupOpenFoodFacts } from "../lib/off.ts";

const PAUSE_MS = 1200;

const db = createClient({
  url: (process.env.LIBSQL_URL ?? "").replace(/^https:/, "wss:"),
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const pending = (
  await db.execute(
    `SELECT barcode, name FROM products
     WHERE nutrition_checked_at IS NULL
     ORDER BY seen_at DESC`,
  )
).rows;

if (pending.length === 0) {
  console.log("Nothing to fetch - every barcode has been asked about already.");
  process.exit(0);
}

console.log(`${pending.length} barcodes never asked about\n`);

let found = 0;
for (const [index, row] of pending.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

  const product = await lookupOpenFoodFacts(String(row.barcode));
  const n = product?.nutrition ?? null;

  await db.execute({
    sql: `UPDATE products
          SET kcal_100 = ?, protein_100 = ?, carbs_100 = ?, fat_100 = ?,
              fibre_100 = ?, salt_100 = ?, nutrition_checked_at = CURRENT_TIMESTAMP
          WHERE barcode = ?`,
    args: [n?.kcal ?? null, n?.protein ?? null, n?.carbs ?? null, n?.fat ?? null,
           n?.fibre ?? null, n?.salt ?? null, row.barcode],
  });

  if (n) found += 1;
  const summary = n
    ? `${n.kcal ?? "?"}kcal  P${n.protein ?? "?"} C${n.carbs ?? "?"} F${n.fat ?? "?"}`
    : "catalogue has no figures";
  console.log(`  ${String(row.name ?? row.barcode).slice(0, 28).padEnd(30)} ${summary}`);
}

// Copy onto the items those barcodes belong to, filling blanks only - anything
// entered by hand is a better answer than whichever packet was scanned last.
const copied = await db.execute(`
  UPDATE items SET
    kcal_100    = COALESCE(items.kcal_100,    (SELECT p.kcal_100    FROM products p WHERE p.item_id = items.id AND p.kcal_100    IS NOT NULL LIMIT 1)),
    protein_100 = COALESCE(items.protein_100, (SELECT p.protein_100 FROM products p WHERE p.item_id = items.id AND p.protein_100 IS NOT NULL LIMIT 1)),
    carbs_100   = COALESCE(items.carbs_100,   (SELECT p.carbs_100   FROM products p WHERE p.item_id = items.id AND p.carbs_100   IS NOT NULL LIMIT 1)),
    fat_100     = COALESCE(items.fat_100,     (SELECT p.fat_100     FROM products p WHERE p.item_id = items.id AND p.fat_100     IS NOT NULL LIMIT 1)),
    fibre_100   = COALESCE(items.fibre_100,   (SELECT p.fibre_100   FROM products p WHERE p.item_id = items.id AND p.fibre_100   IS NOT NULL LIMIT 1)),
    salt_100    = COALESCE(items.salt_100,    (SELECT p.salt_100    FROM products p WHERE p.item_id = items.id AND p.salt_100    IS NOT NULL LIMIT 1))
  WHERE EXISTS (SELECT 1 FROM products p WHERE p.item_id = items.id)
`);

console.log(`\n${found} of ${pending.length} had figures; ${copied.rowsAffected} items updated`);
process.exit(0);
