// Rebuilds the `items` table so `name` is unique per kitchen rather than
// globally. Two kitchens could not both hold "Milk" until this has run.
//
//   node --env-file=.env.local scripts/rebuild-items.mjs          (dry run)
//   node --env-file=.env.local scripts/rebuild-items.mjs --apply
//
// Why it is this involved: SQLite cannot drop a column constraint, so the table
// has to be recreated - and sqld refuses every pragma that would make that
// simple. `foreign_keys=OFF` is accepted and silently ignored, `defer_foreign_keys`
// likewise, and `legacy_alter_table` will not even parse. So DROP TABLE items
// runs every foreign key action pointing at it, and the only way through is to
// write down what those actions would destroy and put it back - inside one
// transaction, so a failure anywhere leaves the database exactly as it was.
//
// Referencing tables are discovered rather than listed. A hand-written list had
// recipe_ingredients, products and shopping_list on it and missed item_tags,
// which cascades rather than nulls; a clone run caught it, having silently
// deleted every tag link. Nothing about that mistake was unusual, so the fix is
// to stop making it possible.

import { createClient } from "@libsql/client";

const apply = process.argv.includes("--apply");
const db = createClient({
  url: (process.env.LIBSQL_URL ?? "").replace(/^https:/, "wss:"),
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const one = async (sql, args = []) => (await rows(sql, args))[0];
const count = async (sql) => (await one(sql)).n;

const existing = await one(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'",
);
if (!existing) {
  console.error("No items table.");
  process.exit(1);
}

if (!/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(existing.sql)) {
  console.log("Already rebuilt: items.name carries no global UNIQUE. Nothing to do.");
  process.exit(0);
}

/** Every table with a foreign key pointing at items, and what the drop does to it. */
const referencing = [];
for (const { name } of await rows(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
)) {
  for (const fk of await rows(`PRAGMA foreign_key_list("${name}")`)) {
    if (fk.table !== "items") continue;
    referencing.push({
      table: name,
      column: fk.from,
      // CASCADE deletes the row; anything else leaves it and changes the column.
      cascades: String(fk.on_delete).toUpperCase() === "CASCADE",
    });
  }
}

/**
 * The new DDL, derived from the old rather than written out fresh.
 *
 * Retyping twenty-odd columns by hand is how a rebuild quietly drops one. This
 * changes exactly two things: the inline UNIQUE goes, and a table-level
 * UNIQUE (kitchen_id, name) arrives in its place.
 */
const newDdl = existing.sql
  .replace(/CREATE TABLE\s+["`]?items["`]?/i, "CREATE TABLE items_rebuilt")
  .replace(/(name\s+TEXT\s+NOT\s+NULL)\s+UNIQUE/i, "$1")
  .replace(/\)\s*$/, ",\n  UNIQUE (kitchen_id, name)\n)");

const columnList = (await rows("PRAGMA table_info(items)"))
  .map((c) => `"${c.name}"`)
  .join(", ");

const before = { items: await count("SELECT COUNT(*) n FROM items"), tables: {} };
for (const ref of referencing) {
  before.tables[ref.table] = {
    total: await count(`SELECT COUNT(*) n FROM "${ref.table}"`),
    linked: await count(
      `SELECT COUNT(*) n FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`,
    ),
  };
}

console.log(`items rows:      ${before.items}`);
console.log(`columns carried: ${(await rows("PRAGMA table_info(items)")).length}`);
console.log("\ntables pointing at items:");
for (const ref of referencing) {
  const state = before.tables[ref.table];
  console.log(
    `  ${ref.table}.${ref.column} - the drop would ${ref.cascades ? "DELETE all " + state.total + " rows" : "null " + state.linked + " links"}`,
  );
}
console.log(`\nnew definition:\n${newDdl}\n`);

const clashes = await rows(
  `SELECT kitchen_id, name, COUNT(*) n FROM items
   GROUP BY kitchen_id, name HAVING n > 1`,
);
if (clashes.length > 0) {
  console.error(`REFUSING: ${clashes.length} rows would collide under the new constraint.`);
  for (const c of clashes) console.error(`  kitchen ${c.kitchen_id}: ${c.name} x${c.n}`);
  process.exit(1);
}
console.log("no collisions under the new constraint");

if (!apply) {
  console.log("\nDry run. Re-run with --apply to perform the rebuild.");
  process.exit(0);
}

const cascading = referencing.filter((r) => r.cascades);
const nulling = referencing.filter((r) => !r.cascades);

/**
 * The rebuild, as one batch so sqld runs it in a single transaction.
 *
 * Nothing here is safe on its own - between the drop and the restore the links
 * are genuinely gone - which is exactly why it is one transaction rather than a
 * dozen statements. Either all of it lands or none of it does.
 *
 * Backup tables are real tables, not temp ones: a temp table belongs to a
 * connection and there is no promise the batch keeps one.
 */
const statements = [
  // 1. Whole rows for the tables the drop would delete outright.
  ...cascading.flatMap(({ table }) => [
    `DROP TABLE IF EXISTS "_rebuild_${table}"`,
    `CREATE TABLE "_rebuild_${table}" AS SELECT * FROM "${table}"`,
  ]),

  // 2. Just the links for the tables it would merely null. rowid rather than a
  //    primary key, because products is keyed by barcode and shopping_list by
  //    id - and rowid is the one thing every table here has.
  "DROP TABLE IF EXISTS _rebuild_links",
  `CREATE TABLE _rebuild_links (
     source  TEXT NOT NULL,
     row_id  INTEGER NOT NULL,
     item_id INTEGER NOT NULL
   )`,
  ...nulling.map(
    ({ table, column }) =>
      `INSERT INTO _rebuild_links (source, row_id, item_id)
       SELECT '${table}', rowid, "${column}" FROM "${table}" WHERE "${column}" IS NOT NULL`,
  ),

  // 3. The new table, every row copied with its id intact - which is what lets
  //    the links be restored by value further down.
  newDdl,
  `INSERT INTO items_rebuilt (${columnList}) SELECT ${columnList} FROM items`,

  // 4. The destructive moment. Every foreign key action pointing at items fires
  //    as this runs, which is what steps 1 and 2 exist to survive.
  "DROP TABLE items",
  "ALTER TABLE items_rebuilt RENAME TO items",

  // 5. Put everything back.
  ...cascading.map(
    ({ table }) => `INSERT INTO "${table}" SELECT * FROM "_rebuild_${table}"`,
  ),
  ...nulling.map(
    ({ table, column }) =>
      `UPDATE "${table}" SET "${column}" = (
         SELECT b.item_id FROM _rebuild_links b
         WHERE b.source = '${table}' AND b.row_id = "${table}".rowid
       )
       WHERE EXISTS (
         SELECT 1 FROM _rebuild_links b
         WHERE b.source = '${table}' AND b.row_id = "${table}".rowid
       )`,
  ),

  // 6. The index the old table carried, which the drop took with it.
  "CREATE INDEX IF NOT EXISTS idx_items_kitchen ON items(kitchen_id)",

  ...cascading.map(({ table }) => `DROP TABLE "_rebuild_${table}"`),
  "DROP TABLE _rebuild_links",
];

console.log(`\napplying ${statements.length} statements as one transaction...`);
await db.batch(statements, "write");
console.log("committed");

// Verification is the whole point of the exercise, so it is not optional.
let ok = true;
const check = (label, was, now) => {
  const same = was === now;
  if (!same) ok = false;
  console.log(`  ${label.padEnd(34)} ${was} -> ${now} ${same ? "ok" : "MISMATCH"}`);
};

console.log("");
check("items", before.items, await count("SELECT COUNT(*) n FROM items"));
for (const ref of referencing) {
  const was = before.tables[ref.table];
  check(`${ref.table} rows`, was.total, await count(`SELECT COUNT(*) n FROM "${ref.table}"`));
  check(
    `${ref.table}.${ref.column} links`,
    was.linked,
    await count(`SELECT COUNT(*) n FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`),
  );
}

const violations = await rows("PRAGMA foreign_key_check");
if (violations.length > 0) {
  ok = false;
  console.error(`  foreign key violations: ${violations.length}`);
} else {
  console.log("  foreign key violations:            0 ok");
}

// An item filed under a tag it no longer carries is the exact damage a missed
// cascade does, and it is invisible in a row count.
const orphanFiling = await count(`
  SELECT COUNT(*) n FROM items i
  WHERE i.primary_tag_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM item_tags it
      WHERE it.item_id = i.id AND it.tag_id = i.primary_tag_id
    )`);
if (orphanFiling > 0) ok = false;
console.log(`  items filed under a lost tag:      ${orphanFiling} ${orphanFiling === 0 ? "ok" : "MISMATCH"}`);

const ddl = await one("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'");
const perKitchen = /UNIQUE\s*\(\s*kitchen_id\s*,\s*name\s*\)/i.test(ddl.sql);
const globalGone = !/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(ddl.sql);
if (!perKitchen || !globalGone) ok = false;
console.log(`  constraint now per kitchen:        ${perKitchen}`);
console.log(`  global unique gone:                ${globalGone}`);

console.log(ok ? "\nREBUILD OK" : "\nREBUILD FAILED VERIFICATION - restore from the backup");
process.exit(ok ? 0 : 1);
