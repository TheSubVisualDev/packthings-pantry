// What actually gets uploaded, and what it costs.
//
//   npm run build && npm run check:bundle
//
// Vercel bills Functions Storage on the bundle of EVERY function, in EVERY
// deployment it retains - and it always keeps the last 20 production ones, so
// the steady state is about twenty times whatever this prints. At 540MB that
// is 10.8GB and the 10GB free tier is gone, which is exactly what happened.
//
// `du` on .next/server does not tell you this and will talk you out of
// worrying: it showed 8.9MB while the real figure was 540MB. The difference is
// node_modules, traced per route by the *.nft.json files and duplicated into
// each one. A package pulled into every function is paid for every time, which
// is why this sorts by size-times-count rather than by size.
import { readFile, stat } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";

const PKG = /node_modules\/((?:@[^/]+\/)?[^/]+)/;
const pkgOf = (abs) => {
  const m = abs.split(path.sep).join("/").match(PKG);
  return m ? m[1] : "(app code)";
};

const sizes = new Map();
async function sizeOf(p) {
  if (sizes.has(p)) return sizes.get(p);
  let s = 0;
  try {
    s = (await stat(p)).size;
  } catch {}
  sizes.set(p, s);
  return s;
}

const routes = [];
for await (const f of glob(".next/**/*.nft.json")) {
  const dir = path.dirname(f);
  let json;
  try {
    json = JSON.parse(await readFile(f, "utf8"));
  } catch {
    continue;
  }
  const perPkg = new Map();
  let total = 0;
  for (const rel of json.files ?? []) {
    const abs = path.resolve(dir, rel);
    const s = await sizeOf(abs);
    total += s;
    const k = pkgOf(abs);
    perPkg.set(k, (perPkg.get(k) ?? 0) + s);
  }
  routes.push({
    name: f.replace(/.*[\\/]app[\\/]/, "").replace(".js.nft.json", ""),
    total,
    perPkg,
  });
}

const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const summed = routes.reduce((a, r) => a + r.total, 0);

// Cost = size x how many functions carry it. This is the storage bill.
const cost = new Map();
const inHowMany = new Map();
for (const r of routes) {
  for (const [k, v] of r.perPkg) {
    cost.set(k, (cost.get(k) ?? 0) + v);
    inHowMany.set(k, (inHowMany.get(k) ?? 0) + 1);
  }
}

console.log(`${routes.length} functions, ${mb(summed)} stored per deployment\n`);
console.log("What that is made of (size x number of functions carrying it):");
for (const [k, v] of [...cost].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(
    "  ",
    mb(v).padStart(9),
    `in ${String(inHowMany.get(k)).padStart(2)}/${routes.length}`,
    k,
  );
}

// What dropping a package would save, and from how many functions.
const CANDIDATES = ["@img/sharp-wasm32", "@img/sharp-win32-x64", "sharp", "@img/colour"];
console.log("\nIf excluded from tracing:");
let saved = 0;
for (const c of CANDIDATES) {
  const v = cost.get(c) ?? 0;
  saved += v;
  console.log("  ", mb(v).padStart(9), c);
}
console.log(`   ${mb(saved).padStart(9)} total -> ${mb(summed - saved)} per deployment`);
