// Checks the tags a recipe works out about itself.
//
//   npm run check:recipe-tags
//
// Derived tags are never stored, so there is no migration to catch them being
// wrong - only this. Two things are being defended: that a derivation is a
// fact about the row rather than a reading of the prose, and that a cuisine is
// suggested only when the ingredients nearly prove it. A wrong suggestion
// accepted with one tap is worse than no suggestion.

import { derivedTags, suggestCuisines, totalMinutes } from "../lib/recipe-tags.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

const labels = (recipe, ingredients = [], steps = []) =>
  derivedTags(recipe, ingredients, steps).map((tag) => tag.label);

function recipe(prep, cook, servings = 2) {
  return { prep_minutes: prep, cook_minutes: cook, base_servings: servings };
}
const line = (name, optional = false) => ({ item_name: name, optional });
const step = (body) => ({ body });

/* --- timings --- */

// No timings at all is "no idea", not "instant". A recipe nobody has timed
// must never sort as the quickest thing you own.
check("no timings means no answer", totalMinutes(recipe(null, null)), null);
check("one timing still counts", totalMinutes(recipe(10, null)), 10);
check("both add up", totalMinutes(recipe(10, 20)), 30);
check("untimed recipe gets no time tag", labels(recipe(null, null)), []);

// The tightest bucket it fits, as a promise about the upper bound.
check("a 5 minute recipe", labels(recipe(5, null)), ["10 mins"]);
check("a 12 minute recipe rounds up to its bucket", labels(recipe(2, 10)), ["20 mins"]);
check("exactly on a boundary takes that bucket", labels(recipe(0, 30)), ["30 mins"]);
check("a long one falls out of every bucket", labels(recipe(30, 180)), []);

/* --- ingredient count --- */

check(
  "few ingredients is worth saying",
  labels(recipe(null, null), [line("Tofu"), line("Soy sauce"), line("Rice")]),
  ["3 ingredients"],
);

// A garnish you can skip is not something you have to buy, so it does not
// count against the claim.
check(
  "optional lines do not count",
  labels(recipe(null, null), [
    line("Tofu"),
    line("Soy sauce"),
    line("Rice"),
    line("Spring onion", true),
    line("Sesame seeds", true),
    line("Chilli oil", true),
  ]),
  ["3 ingredients"],
);

check(
  "a long list says nothing",
  labels(
    recipe(null, null),
    Array.from({ length: 9 }, (_, index) => line(`Thing ${index}`)),
  ),
  [],
);

/* --- the oven --- */

check(
  "a hob recipe says no oven",
  labels(recipe(null, null), [], [step("Fry the onions"), step("Simmer for 20 minutes")]),
  ["No oven"],
);

for (const body of [
  "Bake for 25 minutes",
  "Put it in the oven",
  "Roast until golden",
  "Preheat to 200C",
  "Grill the top for 3 minutes",
  "Gas mark 6",
]) {
  check(
    `"${body}" is the oven`,
    labels(recipe(null, null), [], [step("Chop everything"), step(body)]),
    [],
  );
}

// A recipe with no method mentions no oven, which is not the same as not using
// one. Saying so would be inventing a fact rather than missing it.
check("no steps means no claim", labels(recipe(null, null), [line("Tofu")]), ["1 ingredients"]);

/* --- batch --- */

check("a dinner for two is not a batch", labels(recipe(null, null, 2)), []);
check("six servings is", labels(recipe(null, null, 6)), ["Batch"]);

/* --- everything at once --- */

check(
  "a quick small hob recipe says all three",
  labels(
    recipe(5, 10),
    [line("Tofu"), line("Soy sauce")],
    [step("Fry the tofu"), step("Add the soy sauce")],
  ),
  ["20 mins", "2 ingredients", "No oven"],
);

/* --- cuisine suggestions --- */

// One near-proof is enough: nobody puts gochujang in a shepherd's pie.
check("gochujang alone is enough", suggestCuisines([line("Gochujang")]), ["Asian"]);
check("garam masala alone is enough", suggestCuisines([line("Garam masala")]), ["Indian"]);
check("harissa alone is enough", suggestCuisines([line("Harissa")]), ["Middle Eastern"]);

// One weak marker is not. Ginger is in everything from a stir fry to a biscuit.
check("ginger alone proves nothing", suggestCuisines([line("Ginger")]), []);
check("olive oil alone proves nothing", suggestCuisines([line("Olive oil")]), []);
check("two weak markers agree", suggestCuisines([line("Soy sauce"), line("Sesame oil")]), [
  "Asian",
]);

// Nothing to say is a perfectly good answer.
check(
  "an ordinary British dinner suggests nothing",
  suggestCuisines([line("Potatoes"), line("Carrots"), line("Beef mince"), line("Butter")]),
  [],
);

// Strongest evidence first when two could fit.
check(
  "the better-evidenced cuisine leads",
  suggestCuisines([
    line("Gochujang"),
    line("Miso"),
    line("Soy sauce"),
    line("Olive oil"),
    line("Basil"),
  ])[0],
  "Asian",
);

if (failures > 0) {
  console.error(`\ncheck:recipe-tags - ${failures} failed`);
  process.exit(1);
}
console.log("check:recipe-tags - all cases pass");
