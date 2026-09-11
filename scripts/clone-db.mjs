// Clones the live database into a local SQLite file, DDL and rows both, so a
// migration can be rehearsed against real data without touching real data.
//
// Usage: node --env-file=.env.local scripts/clone-db.mjs <target-file>

import { createClient } from "@libsql/client";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.argv[2] ?? "clone.db");
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${target}${suffix}`, { force: true });
}

const live = createClient({
  url: process.env.LIBSQL_URL.replace(/^https:/, "wss:"),
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});
const local = createClient({ url: `file:${target}` });

const objects = await live.execute(
  `SELECT type, name, sql FROM sqlite_master
   WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END`,
);

for (const object of objects.rows) {
  await local.execute(object.sql);
}
console.log(`schema: ${objects.rows.length} objects replayed`);

/**
 * Every row of every table, in one transaction.
 *
 * Not one batch per table, and not a topological sort: `defer_foreign_keys`
 * holds enforcement until commit, so tables can be copied in any order and the
 * whole clone is still checked for consistency once, at the end. Ordinary
 * `foreign_keys=OFF` is a no-op inside a transaction, which is what a batch is.
 */
const statements = [{ sql: "PRAGMA defer_foreign_keys=ON", args: [] }];
const counts = [];

for (const { name } of objects.rows.filter((o) => o.type === "table")) {
  const rows = (await live.execute(`SELECT * FROM "${name}"`)).rows;
  counts.push([name, rows.length]);
  if (rows.length === 0) continue;

  const columns = Object.keys(rows[0]);
  const sql = `INSERT INTO "${name}" (${columns.map((c) => `"${c}"`).join(", ")})
               VALUES (${columns.map(() => "?").join(", ")})`;

  for (const row of rows) {
    statements.push({ sql, args: columns.map((c) => row[c] ?? null) });
  }
}

await local.batch(statements, "write");

for (const [name, n] of counts) console.log(`  ${name}: ${n}`);

const violations = (await local.execute("PRAGMA foreign_key_check")).rows;
if (violations.length > 0) {
  console.error(`FAILED: ${violations.length} foreign key violations in the clone`);
  process.exit(1);
}

const total = counts.reduce((sum, [, n]) => sum + n, 0);
console.log(`\ncloned ${total} rows into ${target}, foreign keys intact`);
process.exit(0);
