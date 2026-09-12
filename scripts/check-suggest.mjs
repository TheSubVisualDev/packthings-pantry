// Checks what the add form guesses from a name.
//
//   npm run check:suggest
//
// Two jobs, with opposite failure modes. Filling a field in wrongly is cheap -
// you can see it and change it before you save. Telling somebody they already
// own something they do not is expensive, because it sends them to edit a row
// that is not there. So the duplicate threshold is well above the copy-from
// one, these cases are mostly about where each line sits - and the duplicate
// test turned out to need equal words rather than a score at all.

import { suggestFor, probableDuplicate } from "../lib/suggest.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

let nextId = 1;
function profile(name, extra = {}) {
  return {
    id: nextId++,
    name,
    canonical_unit: "g",
    dimension: "mass",
    location: null,
    pack_size: null,
    pack_unit: null,
    shelf_life_days: null,
    tags: [],
    shops: [],
    ...extra,
  };
}

const PANTRY = [
  profile("Parsley", {
    location: "Fridge",
    tags: ["Herbs"],
    shops: ["Tesco"],
    shelf_life_days: 5,
  }),
  profile("Onions", { canonical_unit: "count", dimension: "count", location: "Cupboard" }),
  profile("Soy sauce", {
    canonical_unit: "ml",
    dimension: "volume",
    location: "Cupboard",
    tags: ["Asian", "Sauces"],
    shops: ["Asian supermarket"],
    pack_size: 250,
  }),
  profile("Tomatoes", { location: "Fridge", tags: ["Veg"] }),
];

/* --- copying from something you already own --- */

{
  // Parsley is not close enough in name to hand its shelf over, but the
  // generics table still knows what coriander is - so the fallback answers.
  const got = suggestFor("Coriander", PANTRY);
  check("a known food with nothing like it falls back", got.because, "usually coriander");
  check("and gets no location, because no kitchen said one", got.location, undefined);
}

{
  const got = suggestFor("Dark soy sauce", PANTRY);
  check("a qualified name finds the plain one", got.because, "like your Soy sauce");
  check("and takes its unit", got.unit, "ml");
  check("and its location", got.location, "Cupboard");
  check("and its tags", got.tags, ["Asian", "Sauces"]);
  check("and where you buy it", got.shops, ["Asian supermarket"]);
  check("and what one bottle holds", got.pack_size, "250");
}

{
  const got = suggestFor("Chopped tomatoes", PANTRY);
  check("chopped tomatoes find tomatoes", got.because, "like your Tomatoes");
  check("and inherit the shelf they live on", got.location, "Fridge");
}

{
  const got = suggestFor("Spring onions", PANTRY);
  check("spring onions find onions", got.because, "like your Onions");
  // The field people get wrong most: onions are counted, not weighed.
  check("and are counted, not weighed", got.unit, "count");
}

{
  const got = suggestFor("Parsley", PANTRY);
  check("a shelf life comes across too", got.shelf_life_days, "5");
}

/* --- falling back to what the food is --- */

{
  // An empty kitchen still knows eggs are counted, because the generics table
  // carries a typical weight for the things it counts.
  const got = suggestFor("Eggs", []);
  check("eggs are counted", got.unit, "count");
  check("and say where that came from", got.because, "usually eggs");
}

{
  const got = suggestFor("Butter", []);
  check("butter is weighed", got.unit, "g");
}

{
  const got = suggestFor("Xanthan gum", []);
  check("something nobody has heard of guesses nothing", got.because, null);
  check("and fills in no unit", got.unit, undefined);
}

/* --- too little to go on --- */

check("an empty name suggests nothing", suggestFor("", PANTRY).because, null);
check("one letter suggests nothing", suggestFor("s", PANTRY).because, null);

/* --- duplicates --- */

// The expensive mistake is the false positive, so these are the cases that
// matter: things that are near-misses must NOT be called duplicates.
check(
  "the same word is a duplicate",
  probableDuplicate("Tomatoes", PANTRY)?.name,
  "Tomatoes",
);
check(
  "a misspelling is a duplicate",
  probableDuplicate("tomatos", PANTRY)?.name,
  "Tomatoes",
);
check(
  "a different case is a duplicate",
  probableDuplicate("SOY SAUCE", PANTRY)?.name,
  "Soy sauce",
);

check(
  "a qualified version is NOT a duplicate",
  probableDuplicate("Dark soy sauce", PANTRY),
  null,
);
check(
  "chopped tomatoes are NOT a duplicate of tomatoes",
  probableDuplicate("Chopped tomatoes", PANTRY),
  null,
);
check("spring onions are NOT onions", probableDuplicate("Spring onions", PANTRY), null);
check("something new is not a duplicate", probableDuplicate("Gochujang", PANTRY), null);
// Plural and case are exactly how a pantry fragments, so both must be caught.
check("a plural is a duplicate", probableDuplicate("Onion", PANTRY)?.name, "Onions");
check(
  "word order does not matter",
  probableDuplicate("sauce soy", PANTRY)?.name,
  "Soy sauce",
);
check("an empty name is not a duplicate", probableDuplicate("", PANTRY), null);

if (failures > 0) {
  console.error(`\ncheck:suggest - ${failures} failed`);
  process.exit(1);
}
console.log("check:suggest - all cases pass");
