// Applies db/schema.sql to the configured sqld instance. Idempotent.
// Usage: node --env-file=.env.local scripts/migrate.mjs

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const client = createClient({
  url: process.env.LIBSQL_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

await client.executeMultiple(sql);

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log("Tables:", tables.rows.map((r) => r.name).join(", "));
