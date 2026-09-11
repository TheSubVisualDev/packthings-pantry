// Checks that applyDelta() in lib/containers.ts and ADJUST_SQL agree.
//
// They are the same rule written twice - once so the server is atomic, once so
// a stepper can move before the round trip finishes - and a rule written twice
// is a rule that drifts. This runs both over the same cases and compares.
//
//   node scripts/check-cascade.mjs

import { createClient } from "@libsql/client";
import { readFileSync, rmSync } from "node:fs";

const source = readFileSync(new URL("../lib/containers.ts", import.meta.url), "utf8");
const ADJUST_SQL = source.split("export const ADJUST_SQL = `")[1].split("`")[0];

// The TypeScript is not importable from plain node, so the function is lifted
// out and evaluated. Keeps the check honest: it tests the shipped source.
const body = source
  .split("export function applyDelta(")[1]
  .split("\n/** Matching")[0];
const applyDelta = new Function(
  "item",
  "delta",
  `const round6 = (v) => Math.round(v * 1e6) / 1e6;
   ${body.slice(body.indexOf("): { quantity: number; sealedCount: number } {") + 44)}`,
);

const file = new URL("../.cascade-check.db", import.meta.url).pathname.slice(1);
rmSync(file, { force: true });
const db = createClient({ url: `file:${file}` });
await db.execute(`CREATE TABLE items (
  id INTEGER PRIMARY KEY, kitchen_id INTEGER, quantity REAL NOT NULL,
  sealed_count INTEGER NOT NULL DEFAULT 0, pack_size REAL, pack_unit TEXT,
  unspecified INTEGER NOT NULL DEFAULT 0, opened_at TIMESTAMP, updated_at TIMESTAMP,
  expiry_date DATE)`);

const cases = [];
for (const packSize of [null, 500, 400, 1]) {
  for (const sealed of [0, 1, 3]) {
    for (const open of [0, 0.5, 320, 500]) {
      for (const delta of [-1, -20, -400, -500, -900, -10000, 1, 250, 500, 1200]) {
        cases.push({ packSize, sealed, open, delta });
      }
    }
  }
}

let failures = 0;
for (const [index, c] of cases.entries()) {
  await db.execute({
    sql: `INSERT INTO items (id, kitchen_id, quantity, sealed_count, pack_size, pack_unit)
          VALUES (?, 1, ?, ?, ?, 'ml')`,
    args: [index + 1, c.open, c.sealed, c.packSize],
  });
  const sqlRow = (await db.execute({ sql: ADJUST_SQL, args: [c.delta, index + 1, 1] })).rows[0];
  const js = applyDelta(
    {
      quantity: c.open,
      sealed_count: c.sealed,
      pack_size: c.packSize,
      pack_unit: "ml",
      unspecified: 0,
      canonical_unit: "ml",
    },
    c.delta,
  );

  const same =
    Math.abs(sqlRow.quantity - js.quantity) < 1e-6 && sqlRow.sealed_count === js.sealedCount;
  if (!same) {
    failures += 1;
    console.error(
      `MISMATCH pack=${c.packSize} sealed=${c.sealed} open=${c.open} delta=${c.delta}` +
        ` -> sql ${sqlRow.sealed_count}/${sqlRow.quantity}, js ${js.sealedCount}/${js.quantity}`,
    );
  }
}

db.close();
try { rmSync(file, { force: true }); } catch {}
console.log(`${cases.length} cases, ${failures} mismatches`);
process.exit(failures === 0 ? 0 : 1);
