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

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log("Tables:", tables.rows.map((r) => r.name).join(", "));
