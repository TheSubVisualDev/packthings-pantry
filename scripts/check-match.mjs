// Checks that a recipe line resolves to the pantry row a cook would point at.
//
//   npm run check:match
//
// Every smart thing the app does rests on this join - the "cook with what you
// have" ranking, the rescues panel, the shortfall list, and what cooking takes
// off the shelf. Before lib/pantry-match.ts it was a lowercased string
// equality in four separate places, so "firm tofu" against a row called "Tofu"
// read as an ingredient this kitchen has never heard of.
//
// The bias under test is the receipt parser's: miss one rather than invent
// one. A `maybe` is a success, not a failure - it means the app asked instead
// of spending the wrong jar.

import { indexStock, resolveLine, isStocked } from "../lib/pantry-match.ts";

/** A pantry row, with only the fields matching and stock levels read. */
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

// A pantry with the shapes that actually catch this out: near-duplicates,
// qualified names, plurals, and things stored only as sealed packs.
const PANTRY = [
  item(1, "Tofu"),
  item(2, "Spaghetti"),
  item(3, "Onions", { canonical_unit: "count", dimension: "count" }),
  item(4, "Soy sauce", { canonical_unit: "ml", dimension: "volume" }),
  item(5, "Dark soy sauce", { canonical_unit: "ml", dimension: "volume" }),
  item(6, "Plum tomatoes"),
  // Nothing in the open tin, three sealed ones behind it. quantity is 0 and
  // this is emphatically in stock: the bug AGENTS.md keeps warning about.
  item(7, "Chickpeas", { quantity: 0, sealed_count: 3, pack_size: 400 }),
  // Bought, finished, never taken off the list. Matched, but not dinner.
  item(8, "Coriander", { quantity: 0 }),
  item(9, "Gochujang"),
  item(10, "Milk", { canonical_unit: "ml", dimension: "volume" }),
  item(11, "Butter"),
  // "Some, I do not know how much" - always enough to cook with.
  item(12, "Salt", { quantity: 0, unspecified: 1 }),
];

const stock = indexStock(PANTRY);

// [ line as the recipe writes it, expected row name or null, expected confidence ]
const CASES = [
  // Word for word. Still most lines, and must stay free.
  ["Tofu", "Tofu", "exact"],
  ["tofu", "Tofu", "exact"],
  ["Spaghetti", "Spaghetti", "exact"],

  // The whole point. A qualifier the pantry does not bother with.
  ["Firm tofu", "Tofu", "likely"],
  ["Silken tofu", "Tofu", "likely"],
  ["Dried spaghetti", "Spaghetti", "likely"],

  // Plurals meet in the middle, which is what stem() is for.
  ["Onion", "Onions", "likely"],
  ["2 large onions", "Onions", "likely"],

  // An exact name wins over a longer one containing it, even though both score.
  ["Soy sauce", "Soy sauce", "exact"],
  ["Dark soy sauce", "Dark soy sauce", "exact"],

  // Container-aware. Three sealed tins is in stock; an empty jar is not.
  ["Chickpeas", "Chickpeas", "exact"],
  ["Tinned chickpeas", "Chickpeas", "likely"],

  // Never heard of it. A normal state for a recipe, not an error.
  ["Saffron", null, "none"],
  ["Star anise", null, "none"],
  ["Lemongrass", null, "none"],

  // Sharing one broad word is not being the same thing. These are the ones
  // that matter: a wrong `likely` spends the wrong jar.
  ["Milk chocolate", null, "maybe"],
  ["Peanut butter", null, "maybe"],
  // Not "maybe" but "none": with the head noun missing there is nothing in
  // this kitchen worth offering, and saying so is better than a shrug.
  ["Tomato puree", null, "none"],
];

let failures = 0;

for (const [line, expectedName, expectedConfidence] of CASES) {
  const resolution = resolveLine(line, stock);
  const gotName = resolution.item?.name ?? null;

  // A `maybe` is the app asking, so the row it would offer is not the
  // assertion - only that it declined to decide.
  const nameOk = expectedConfidence === "maybe" ? true : gotName === expectedName;
  const confidenceOk = resolution.confidence === expectedConfidence;

  if (!nameOk || !confidenceOk) {
    failures += 1;
    console.error(
      `  ${line}\n    expected ${expectedName ?? "nothing"} (${expectedConfidence})` +
        `\n    got      ${gotName ?? "nothing"} (${resolution.confidence}, ${resolution.score.toFixed(2)})`,
    );
  }
}

// Availability is a separate question from identity, and the difference is
// what the shortfall list is made of.
const STOCKED = [
  ["Tofu", true],
  ["Firm tofu", true],
  ["Chickpeas", true], // sealed packs only
  ["Coriander", false], // matched, but the jar is empty
  ["Salt", true], // unspecified: there is some
  ["Saffron", false], // no such row
];

for (const [line, expected] of STOCKED) {
  const got = isStocked(resolveLine(line, stock));
  if (got !== expected) {
    failures += 1;
    console.error(`  ${line}: expected stocked=${expected}, got ${got}`);
  }
}

const total = CASES.length + STOCKED.length;
if (failures > 0) {
  console.error(`\ncheck:match - ${failures} of ${total} failed`);
  process.exit(1);
}
console.log(`check:match - ${total} cases pass`);
