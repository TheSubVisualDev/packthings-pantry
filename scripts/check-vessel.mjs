// What shape the shelf draws a thing as.
//
//   npm run check:vessel
//
// The shelf redesign draws every item as the vessel it really is, filled to
// the level you really have. Nothing in the database says which shape that is,
// so it is worked out from the name and the unit - and the cases below are the
// ones that were actually wrong when it was first run over the real kitchen,
// which is why they are pinned rather than reasoned about.
//
// The lesson they encode: THE NAME BEATS THE UNIT. Half this kitchen is
// placeholder rows carrying "there is some, nobody said how much", and every
// one of those is stored as mass whatever it is - so Olive oil and Milk came
// out as bags. It fails the other way too: Paprika, Cumin and MSG are stored
// as `1 count`, so a count-first rule drew three spice jars as a row of pips.
//
// Being wrong here is cheap - a bottle drawn as a jar still shows the right
// amount at the right level - so this checks the cases that look silly, not
// every possible name. fillFor is the part that must never be wrong, because
// that IS the number.

import { vesselFor, fillFor } from "../lib/vessel.ts";

let failures = 0;
function is(name, unit, dimension, expected) {
  const got = vesselFor(name, unit, dimension);
  if (got !== expected) {
    failures += 1;
    console.error(`  ${name} (${unit}/${dimension})\n    expected ${expected}\n    got      ${got}`);
  }
}
function eq(what, got, expected) {
  if (got !== expected) {
    failures += 1;
    console.error(`  ${what}\n    expected ${expected}\n    got      ${got}`);
  }
}

/* The ones that were wrong, stored exactly as the real rows store them. */
is("Olive oil", "g", "mass", "bottle");
is("Vegetable oil", "g", "mass", "bottle");
is("Milk", "g", "mass", "carton");
is("Eggs", "g", "mass", "pips");
is("Stock cubes", "g", "mass", "pips");
is("Salt", "g", "mass", "spice");
is("Black pepper", "g", "mass", "spice");
is("Paprika", "count", "count", "spice");
is("Cumin", "count", "count", "spice");
is("MSG", "count", "count", "spice");

/* And the ones that were right, so a fix cannot quietly break them. */
is("Whole Milk", "ml", "volume", "carton");
is("Almond milk", "ml", "volume", "carton");
is("Dark soy sauce", "ml", "volume", "bottle");
is("Extra thick double cream", "ml", "volume", "tub");
is("Gochujang", "g", "mass", "jar");
is("Hot Broadbeans Paste clh", "g", "mass", "jar");
is("Tinned tomatoes", "g", "mass", "tin");
is("Unsalted butter", "g", "mass", "block");
is("2% turkey mince", "g", "mass", "tray");
is("Salmon  fillet", "g", "mass", "tray");
is("British Carrots", "g", "mass", "bag");
is("Plain Flour", "g", "mass", "bag");
is("Spaghetti", "g", "mass", "bag");
is("Free Range Eggs", "count", "count", "pips");
is("Brown Onions", "count", "count", "pips");
is("Sweet Peppers", "count", "count", "pips");

/**
 * A pepper is not pepper. "Sweet Peppers" and "Black pepper" differ by one
 * word and belong in different halves of the kitchen, which is exactly the
 * kind of collision a keyword list produces.
 */
is("Sweet Peppers", "count", "count", "pips");
is("Red Pepper Powder", "g", "mass", "spice");

/** Whole words only: "oil" must not fire inside another word. */
is("Boiled sweets", "g", "mass", "bag");

/** Nothing recognised falls back to a bag, never to a confident tin or jar. */
for (const unknown of ["Xyzzy", "Furnace Noritama Bonito Flavour", "Nerds"]) {
  is(unknown, "g", "mass", "bag");
}

/* ---------------------------------------------------------------------------
   The fill, which is the half that must never lie
   --------------------------------------------------------------------------- */

eq("900 of 1136 is 79%", Math.round(fillFor({ quantity: 900, pack_size: 1136 }) * 100), 79);
eq("empty pack is 0", fillFor({ quantity: 0, pack_size: 500 }), 0);
eq("full pack is 1", fillFor({ quantity: 300, pack_size: 300 }), 1);

/**
 * The three ways there is no honest level. `unspecified` is 17 of 47 items -
 * drawing those full would be the single most misleading thing the redesign
 * could do, so it must come back null and be drawn hollow.
 */
eq("unspecified has no level", fillFor({ quantity: 0, pack_size: 500, unspecified: 1 }), null);
eq("no pack size has no level", fillFor({ quantity: 250, pack_size: null }), null);
eq("a zero pack size has no level", fillFor({ quantity: 250, pack_size: 0 }), null);

/** More in the jar than the jar holds is still a full jar, never 140%. */
eq("overfull clamps", fillFor({ quantity: 1400, pack_size: 1000 }), 1);

if (failures > 0) {
  console.error(`\n${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("vessel: the shelf draws the right shapes, and never a level it does not have.");
