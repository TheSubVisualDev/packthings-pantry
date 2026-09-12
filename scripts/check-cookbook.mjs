// Checks that an agreed link beats a guess, including when it says "nothing".
//
//   npm run check:cookbook
//
// The cookbook exists so the app asks once, at the point of adopting a recipe,
// and never again at the stove. That only holds if the answer is actually
// honoured afterwards - and the tempting bug is to treat a link of null as
// "no answer yet" and quietly re-resolve over the top of it. A person said
// their kitchen has no such thing; re-guessing is how an app stops being
// trusted.

import { indexStock, resolveLine } from "../lib/pantry-match.ts";
import { resolveWithLinks, countStockedLines } from "../lib/cookbook.ts";

function item(id, name, extra = {}) {
  return {
    id,
    kitchen_id: 1,
    name,
    quantity: 1,
    canonical_unit: "g",
    dimension: "mass",
    sealed_count: 0,
    pack_size: null,
    pack_unit: null,
    unspecified: 0,
    ...extra,
  };
}

const PANTRY = [
  item(1, "Tofu"),
  item(2, "Butter"),
  item(3, "Peanut butter"),
  item(4, "Coriander", { quantity: 0 }),
  item(5, "Chickpeas", { quantity: 0, sealed_count: 2, pack_size: 400 }),
];

const stock = indexStock(PANTRY);
const byId = new Map(PANTRY.map((row) => [row.id, row]));

function line(id, name, unit = "g") {
  return { id, item_name: name, unit };
}

let failures = 0;
function check(what, got, expected) {
  if (got !== expected) {
    failures += 1;
    console.error(`  ${what}: expected ${expected}, got ${got}`);
  }
}

// An agreed link wins outright, even against a name that would have resolved
// somewhere else. This is the whole point: a person disambiguated it once.
{
  const links = new Map([[10, 3]]);
  const { item: got, agreed } = resolveWithLinks(line(10, "Butter"), links, stock, byId);
  check("agreed link overrides the name", got?.name, "Peanut butter");
  check("agreed link reports as agreed", agreed, true);
}

// The dangerous one. Null means "asked, and this kitchen has none" - it must
// not fall through to the resolver, which would happily find Tofu.
{
  const links = new Map([[11, null]]);
  const { item: got, agreed } = resolveWithLinks(line(11, "Firm tofu"), links, stock, byId);
  check("an agreed 'nothing' stays nothing", got, null);
  check("an agreed 'nothing' still reports as agreed", agreed, true);
  // Guard against the null being mistaken for a missing key.
  check(
    "the same line without a link does resolve",
    resolveWithLinks(line(11, "Firm tofu"), new Map(), stock, byId).item?.name,
    "Tofu",
  );
}

// No link at all is a line added by an edit after the recipe was adopted. It
// falls through to the resolver rather than being treated as unavailable.
{
  const { item: got, agreed } = resolveWithLinks(line(12, "Firm tofu"), new Map(), stock, byId);
  check("an unasked line resolves", got?.name, "Tofu");
  check("an unasked line reports as not agreed", agreed, false);
}

// A line the resolver only half-believes is not acted on without a link, for
// the same reason cooking never guesses: spending the wrong jar is worse.
{
  const resolution = resolveLine("Peanut butter", indexStock([item(2, "Butter")]));
  check("peanut butter against butter alone stays a maybe", resolution.confidence, "maybe");
  check(
    "and so links to nothing without a human",
    resolveWithLinks(line(13, "Peanut butter"), new Map(), indexStock([item(2, "Butter")]), byId)
      .item,
    null,
  );
}

// Readiness counts availability, not identity - and counts containers, so
// sealed packs behind an empty open one are stock.
{
  const links = new Map([
    [20, 1], // Tofu, has some
    [21, 4], // Coriander, agreed but the jar is empty
    [22, 5], // Chickpeas, nothing open, two sealed tins
    [23, null], // agreed: not in this kitchen
  ]);
  const lines = [
    line(20, "Firm tofu"),
    line(21, "Fresh coriander"),
    line(22, "Tinned chickpeas"),
    line(23, "Saffron"),
  ];
  const { have, total } = countStockedLines(lines, links, stock, byId);
  check("readiness counts what is actually there", have, 2);
  check("readiness counts every line as the denominator", total, 4);
}

if (failures > 0) {
  console.error(`\ncheck:cookbook - ${failures} failed`);
  process.exit(1);
}
console.log("check:cookbook - all cases pass");
