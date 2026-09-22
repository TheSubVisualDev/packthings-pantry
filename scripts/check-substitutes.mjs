// What the recipe page offers to stand in for a missing ingredient.
//
//   npm run check:substitutes
//
// Pinned because of one suggestion: "Instead of baking powder - Red Pepper
// Powder", found on the cinnamon cookies in the 22 Sep 2026 audit. A shared
// word that only names the form a thing comes in - powder, paste, sauce - was
// enough on its own to clear the name floor. The second half checks the
// substitutes that ARE right still come through, because the cheap fix (raise
// the floor) would have lost olive oil for vegetable oil to get rid of chilli
// for baking powder.

import { rankSubstitutes } from "../lib/substitutes.ts";

let failures = 0;
let nextId = 1;
const item = (name, quantity = 100) => ({
  id: nextId++, name, quantity, canonical_unit: "g", dimension: "mass",
  pack_size: null, sealed_count: 0, restock_target: null,
});

const shelf = [
  item("Red Pepper Powder"),
  item("Garlic powder"),
  item("Curry paste"),
  item("Light Soy Sauce"),
  item("Olive oil"),
  item("Caster sugar"),
  item("Chilli flakes"),
  item("Self-raising flour"),
];

function offers(wanted, expected) {
  const got = rankSubstitutes(wanted, null, shelf, new Map(), new Map()).map((s) => s.item.name);
  const hit = expected.every((name) => got.includes(name));
  const extra = got.filter((name) => !expected.includes(name));
  if (!hit || extra.length) {
    failures += 1;
    console.error(`  ${wanted}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(got)}`);
  }
}

// Shares only the form: offered nothing.
offers("Baking powder", []);
offers("Tomato paste", []);
offers("Fish sauce", []);
offers("Onion powder", []);

// Shares the substance: still offered.
offers("Vegetable oil", ["Olive oil"]);
offers("Granulated sugar", ["Caster sugar"]);
offers("Dark soy sauce", ["Light Soy Sauce"]);
offers("Chilli powder", ["Chilli flakes"]);
offers("Plain flour", ["Self-raising flour"]);

if (failures) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("substitutes: form words alone offer nothing, substance still does");
