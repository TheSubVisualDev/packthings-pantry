// Every name that gets counted is a name the server will accept, and every
// name the server will accept is counted somewhere.
//
//   npm run check:usage
//
// This exists because the failure mode of usage tracking is silence. A
// `data-track` with a typo in it, or a `track("stock.swpie")`, is dropped by
// the route without a word - and what arrives in the report is a zero, which
// reads exactly like "nobody uses this". A count that is wrong in that
// direction is worse than no count, because it is a number somebody will act
// on: the honest reading of a zero is "delete this feature".
//
// So both directions are checked. An unknown name is a typo. A known name
// that appears nowhere is a thing that was added to the list and never wired
// up, which produces the same misleading zero by a different route.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { ACTIONS } from "../lib/usage.ts";

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = [".ts", ".tsx"];

/** Where a name is written: the markup attribute, the client helper, the server call. */
const USES = [
  /data-track="([a-z.]+)"/g,
  /\btrack\(\s*"([a-z.]+)"/g,
  /\brecord\(\s*"([a-z.]+)"/g,
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) yield path;
  }
}

const known = new Set(ACTIONS);
const seen = new Map(); // name -> [where]
let failures = 0;

for (const path of ROOTS.flatMap((root) => [...walk(root)])) {
  // lib/usage.ts is the definition of the list, not a use of it.
  if (path.split(sep).join("/") === "lib/usage.ts") continue;
  const source = readFileSync(path, "utf8");

  for (const pattern of USES) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push(path);
    }
  }
}

for (const [name, wheres] of seen) {
  if (known.has(name)) continue;
  failures += 1;
  console.error(`  unknown action "${name}"`);
  console.error(`    the server drops this silently and it counts as nothing`);
  for (const where of wheres) console.error(`    at ${where}`);
}

for (const name of ACTIONS) {
  if (seen.has(name)) continue;
  failures += 1;
  console.error(`  "${name}" is in ACTIONS and recorded nowhere`);
  console.error(`    it will report as zero, which reads as "unused"`);
}

if (failures > 0) {
  console.error(`\n${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log(`usage: ${ACTIONS.length} actions, all wired, all known.`);
