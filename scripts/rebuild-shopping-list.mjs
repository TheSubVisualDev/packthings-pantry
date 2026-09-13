// Rebuilds `shopping_list` so a line can belong to a person instead of a
// kitchen. Somebody with no kitchen could not write a shopping list until this
// has run.
//
//   node --env-file=.env.local scripts/rebuild-shopping-list.mjs          (dry run)
//   node --env-file=.env.local scripts/rebuild-shopping-list.mjs --apply
//
// A tester asked for it and the app already half agrees: /kitchens says in as
// many words that an account without one is a normal state, "you can follow
// people and write recipes without ever tracking a tin of beans". Writing down
// what to buy is squarely in that category - it needs no shelves, only a pen.
//
// Why it is a rebuild rather than an ALTER: kitchen_id is NOT NULL, SQLite
// cannot drop a column constraint, and sqld refuses every pragma that would
// make recreating a table simple - see AGENTS.md. scripts/rebuild-items.mjs is
// the worked example this follows. This one is the easy case: nothing in the
// schema has a foreign key pointing AT shopping_list, so the drop destroys
// only the table's own rows and its index, and both are put back here.

import { createClient } from "@libsql/client";

const apply = process.argv.includes("--apply");
const db = createClient({
  url: (process.env.LIBSQL_URL ?? "").replace(/^https:/, "wss:").replace(/^http:/, "ws:"),
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const one = async (sql, args = []) => (await rows(sql, args))[0];
const count = async (sql) => Number((await one(sql)).n);

const existing = await one(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='shopping_list'",
);
if (!existing) {
  console.error("No shopping_list table. Run the migration first.");
  process.exit(1);
}

if (/owner_id/i.test(existing.sql)) {
  console.log("Already rebuilt: shopping_list has owner_id. Nothing to do.");
  process.exit(0);
}

/**
 * Anything pointing at this table, discovered rather than assumed.
 *
 * Expected to be empty - nothing references a shopping list line - but the
 * rebuild-items comment exists because a hand-written list of referencing
 * tables missed one and silently deleted every row in it. Checking costs one
 * query and refusing costs nothing.
 */
const referencing = [];
for (const { name } of await rows(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
)) {
  for (const fk of await rows(`PRAGMA foreign_key_list("${name}")`)) {
    if (fk.table === "shopping_list") referencing.push(`${name}.${fk.from}`);
  }
}
if (referencing.length > 0) {
  console.error(
    `REFUSING: ${referencing.join(", ")} points at shopping_list, which this script does not know how to put back.`,
  );
  console.error("Follow scripts/rebuild-items.mjs, which does.");
  process.exit(1);
}

/**
 * The new DDL, derived from the old rather than written out fresh.
 *
 * Retyping the columns by hand is how a rebuild quietly drops one. Exactly
 * three things change: kitchen_id stops being NOT NULL, owner_id arrives, and
 * a CHECK says a line belongs to one or the other and never to both.
 */
const newDdl = existing.sql
  .replace(/CREATE TABLE\s+["`]?shopping_list["`]?/i, "CREATE TABLE shopping_list_rebuilt")
  .replace(
    /kitchen_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES/i,
    "kitchen_id INTEGER REFERENCES",
  )
  .replace(
    /\)\s*$/,
    `,
  -- A list with no shelves behind it. Somebody who has not made a kitchen can
  -- still write down what to buy; there is simply nothing to compare it to.
  owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- One or the other, never both and never neither. Without this the two
  -- scopes would eventually overlap on some row and no query would agree
  -- about whose line it was.
  CHECK ((kitchen_id IS NULL) <> (owner_id IS NULL))
)`,
  );

if (!/owner_id/.test(newDdl) || /kitchen_id\s+INTEGER\s+NOT\s+NULL/i.test(newDdl)) {
  console.error("REFUSING: the new definition did not come out as expected:\n" + newDdl);
  process.exit(1);
}

const columns = await rows("PRAGMA table_info(shopping_list)");
const columnList = columns.map((column) => `"${column.name}"`).join(", ");

const before = {
  total: await count("SELECT COUNT(*) n FROM shopping_list"),
  bought: await count("SELECT COUNT(*) n FROM shopping_list WHERE bought_at IS NOT NULL"),
  linked: await count("SELECT COUNT(*) n FROM shopping_list WHERE item_id IS NOT NULL"),
};

console.log(`shopping_list rows: ${before.total}`);
console.log(`  already bought:   ${before.bought}`);
console.log(`  linked to stock:  ${before.linked}`);
console.log(`columns carried:    ${columns.length}`);
console.log(`nothing points at it: ${referencing.length === 0}`);
console.log(`\nnew definition:\n${newDdl}\n`);

// Every existing row belongs to a kitchen, so every one satisfies the CHECK.
// Said out loud rather than assumed, because a row that failed it would abort
// the whole batch halfway and the message would be about a constraint rather
// than about this.
const orphans = await count("SELECT COUNT(*) n FROM shopping_list WHERE kitchen_id IS NULL");
if (orphans > 0) {
  console.error(`REFUSING: ${orphans} rows already have no kitchen_id.`);
  process.exit(1);
}
console.log("every existing row satisfies the new CHECK");

if (!apply) {
  console.log("\nDry run. Re-run with --apply to perform the rebuild.");
  process.exit(0);
}

/**
 * One batch, so sqld runs it in a single transaction.
 *
 * Between the drop and the restore the list is genuinely gone, which is
 * exactly why it is one transaction rather than eight statements. Either all
 * of it lands or none of it does.
 */
console.log("\napplying as one transaction...");
await db.batch(
  [
    newDdl,
    `INSERT INTO shopping_list_rebuilt (${columnList}) SELECT ${columnList} FROM shopping_list`,
    "DROP TABLE shopping_list",
    "ALTER TABLE shopping_list_rebuilt RENAME TO shopping_list",
    // The index went with the old table.
    "CREATE INDEX IF NOT EXISTS idx_shopping_list_kitchen ON shopping_list(kitchen_id, bought_at)",
    "CREATE INDEX IF NOT EXISTS idx_shopping_list_owner ON shopping_list(owner_id, bought_at)",
  ],
  "write",
);
console.log("committed");

// Verification is the whole point of the exercise, so it is not optional.
const after = {
  total: await count("SELECT COUNT(*) n FROM shopping_list"),
  bought: await count("SELECT COUNT(*) n FROM shopping_list WHERE bought_at IS NOT NULL"),
  linked: await count("SELECT COUNT(*) n FROM shopping_list WHERE item_id IS NOT NULL"),
};

let ok = true;
for (const key of ["total", "bought", "linked"]) {
  const same = before[key] === after[key];
  if (!same) ok = false;
  console.log(`${same ? "ok  " : "LOST"} ${key}: ${before[key]} -> ${after[key]}`);
}

const broken = await rows("PRAGMA foreign_key_check");
if (broken.length > 0) {
  ok = false;
  console.error(`foreign_key_check: ${broken.length} broken references`);
} else {
  console.log("ok   foreign_key_check clean");
}

process.exit(ok ? 0 : 1);
