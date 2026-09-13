// Checks how an amount is read, written and said.
//
//   npm run check:amounts
//
// Three things arrived together and all three touch the same numbers: the ~
// that means "about this much", the "some" unit for a line nobody measured,
// and the two-line format that leads with the amount instead of burying it.
//
// The one worth defending hardest is "some". It is a unit with no dimension,
// which means every conversion refuses it - and there are five places that
// convert a recipe line. Each of them has to tell "nobody measured this" apart
// from "this unit is broken", because the first is a decision to respect and
// the second is a mistake to report. A single miss puts salt on the shopping
// list for ever, or ends every cook with a list of seasonings it could not
// work out.

import {
  describeLine,
  readQuantity,
  resolveAmount,
  sayAmount,
  splitAmount,
  toCanonical,
  UNMEASURED,
  writeQuantity,
} from "../lib/units.ts";
import { parseRecipeDocument } from "../lib/recipe-schema.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

const NO_PACK = { size: null, unit: null };

/* --- saying a number with its unit --- */

// The complaint that started this: "2 tin" reads like a form field.
check("one tin", sayAmount(1, "tin"), "1 tin");
check("two tins", sayAmount(2, "tin"), "2 tins");
check("two jars", sayAmount(2, "jar"), "2 jars");
check("half a pack", sayAmount(0.5, "pack"), "0.5 packs");

// Symbols hug the number and are never pluralised - "100gs" is not a word.
check("grams", sayAmount(100, "g"), "100g");
check("litres", sayAmount(2, "l"), "2l");

// Spoons are words, but nobody says "2 tbsps".
check("tablespoons", sayAmount(2, "tbsp"), "2 tbsp");

// A count says nothing: the row's name is doing that job.
check("a count", sayAmount(3, "count"), "3");

/* --- splitting a line into its two halves --- */

check("plain weight", splitAmount(100, "g", NO_PACK), {
  primary: "100g",
  secondary: null,
});

// The tortellini line from the screenshot that started this.
check("two packs of 300g", splitAmount(2, "pack", { size: 300, unit: "g" }), {
  primary: "2 packs",
  secondary: "600g",
});

check("approximate onion", splitAmount(70, "g", NO_PACK, true), {
  primary: "~70g",
  secondary: null,
});

// The tilde belongs on both halves or neither: "~2 packs" of an exact 600g
// would be claiming a precision the first half just disclaimed.
check("approximate pack", splitAmount(2, "pack", { size: 300, unit: "g" }, true), {
  primary: "~2 packs",
  secondary: "~600g",
});

// Nothing to print. The name and the note are the whole line.
check("unmeasured", splitAmount(1, UNMEASURED, NO_PACK), {
  primary: "",
  secondary: null,
});

/* --- the label a step chip shows --- */

check(
  "measured chip",
  describeLine(2, "tin", { size: 400, unit: "g" }, "Chopped tomato"),
  "2 tins Chopped tomato",
);
// Not "1 some Salt", which is what both chip builders did before they shared one.
check("unmeasured chip", describeLine(1, UNMEASURED, NO_PACK, "Salt"), "Salt");
check(
  "approximate chip",
  describeLine(70, "g", NO_PACK, "Brown Onion", true),
  "~70g Brown Onion",
);

/* --- reading what somebody typed --- */

check("a plain number", readQuantity("70"), { quantity: 70, approx: false });
check("a tilde", readQuantity("~70"), { quantity: 70, approx: true });
check("a tilde and a space", readQuantity("~ 70"), { quantity: 70, approx: true });
check("empty", readQuantity(""), { quantity: null, approx: false });
// A lone tilde is somebody mid-type, not a number.
check("a lone tilde", readQuantity("~"), { quantity: null, approx: true });
check("nonsense", readQuantity("about a bit"), { quantity: null, approx: false });
// Zero and below are not amounts, tilde or no tilde.
check("zero", readQuantity("0"), { quantity: null, approx: false });
check("negative", readQuantity("~-5"), { quantity: null, approx: true });

// Round trip: what the editor shows for what the database holds.
check("write exact", writeQuantity(70, false), "70");
check("write approximate", writeQuantity(70, true), "~70");
check("round trip", readQuantity(writeQuantity(2.5, true)), {
  quantity: 2.5,
  approx: true,
});

/* --- every conversion refuses "some", with its own reason --- */

// This is the load-bearing one. Callers branch on the reason, and a "some"
// line arriving as "unknown-unit" would be flagged to the cook as a broken
// recipe rather than skipped as a pinch of salt.
check("toCanonical refuses", toCanonical(1, UNMEASURED, "mass"), {
  ok: false,
  reason: "unmeasured",
});
check("resolveAmount refuses", resolveAmount(1, UNMEASURED, NO_PACK, "mass"), {
  ok: false,
  reason: "unmeasured",
});
// A pack size cannot rescue a line that has no amount, and must not try.
check(
  "a pack size cannot rescue it",
  resolveAmount(1, UNMEASURED, { size: 400, unit: "g" }, "mass"),
  { ok: false, reason: "unmeasured" },
);
// A genuinely wrong unit still reads as wrong.
check("a real typo", toCanonical(1, "cups", "volume"), {
  ok: false,
  reason: "unknown-unit",
});

/* --- the document parser --- */

const ITEMS = [
  {
    id: 1,
    name: "Salt",
    dimension: "mass",
    canonical_unit: "g",
    quantity: 500,
    sealed_count: 0,
    pack_size: null,
    pack_unit: null,
    unspecified: 0,
    count_noun: null,
  },
];

const doc = (ingredients) => ({ name: "Test", base_servings: 2, ingredients });
const parse = (ingredients) => parseRecipeDocument(doc(ingredients), ITEMS);

// An unmeasured line needs no quantity, and is not a problem.
const toTaste = parse([{ item_name: "Salt", unit: UNMEASURED, note: "to taste" }]);
check("to taste parses", toTaste.ok, true);
check("to taste keeps its unit", toTaste.recipe?.ingredients[0].unit, UNMEASURED);
// Stored as 1 to keep the NOT NULL column honest. Never shown.
check("to taste stores a 1", toTaste.recipe?.ingredients[0].quantity, 1);

// A measured line still must have one.
check(
  "a missing quantity is still a problem",
  parse([{ item_name: "Salt", unit: "g" }]).ok,
  false,
);

// A gram line against a gram item is fine; a tablespoon one warns. An
// unmeasured line must do neither - there is no dimension to mismatch.
check(
  "unmeasured never warns about units",
  toTaste.warnings.filter((w) => w.kind === "unit-mismatch").length,
  0,
);
check(
  "a real mismatch still warns",
  parse([{ item_name: "Salt", quantity: 1, unit: "tbsp" }]).warnings.filter(
    (w) => w.kind === "unit-mismatch",
  ).length,
  1,
);

// A pack size on an unmeasured line is a caller who wanted something else.
// Refused rather than dropped, so they find out.
check(
  "no pack size without an amount",
  parse([{ item_name: "Salt", unit: UNMEASURED, pack_size: 400, pack_unit: "g" }]).ok,
  false,
);

// approx rides through as a flag.
const rough = parse([{ item_name: "Salt", quantity: 70, unit: "g", approx: true }]);
check("approx survives the parse", rough.recipe?.ingredients[0].approx, true);
// Meaningless on a line with no amount to be approximate about.
check(
  "approx is dropped when there is no amount",
  parse([{ item_name: "Salt", unit: UNMEASURED, approx: true }]).recipe
    ?.ingredients[0].approx,
  false,
);

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("amounts: all good");
