// Text stored for one purpose, read for another.
//
//   npm run check:display
//
// Both of these normalise at render time and never touch what is stored, so
// the risk is not losing data - it is being confidently wrong in front of
// somebody. A wrong singular ("1 Hummu") and a mangled title ("Bbq Ribs") are
// both worse than the thing they were fixing, so every case here is either a
// shape that must change or a shape that must be left alone.

import { displayItemName, displayTitle } from "../lib/recipe-display.ts";

let failures = 0;
function check(what, got, expected) {
  if (got !== expected) {
    failures += 1;
    console.error(`  ${what}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(got)}`);
  }
}

/* --- one of a countable thing reads as one of it --- */

check("one onion", displayItemName("Brown Onions", 1, "count"), "Brown Onion");
check("one pea", displayItemName("Frozen Peas", 1, "count"), "Frozen Pea");
check("one cherry", displayItemName("Cherries", 1, "count"), "Cherry");
check("only the last word", displayItemName("Frozen Garden Peas", 1, "count"), "Frozen Garden Pea");

/* --- and everything else is left exactly as stored --- */

check("three onions", displayItemName("Brown Onions", 3, "count"), "Brown Onions");
check("a tin is not a count", displayItemName("Chopped Tomatoes", 1, "tin"), "Chopped Tomatoes");
check("grams never pluralise a name", displayItemName("Oats", 100, "g"), "Oats");
check("no quantity at all", displayItemName("Salt", null, "some"), "Salt");

/**
 * The -s that was never a plural. Stripping it invents a word, and these are
 * ordinary shopping: hummus, couscous, asparagus, molasses, watercress.
 */
check("hummus keeps its s", displayItemName("Hummus", 1, "count"), "Hummus");
check("couscous keeps its s", displayItemName("Couscous", 1, "count"), "Couscous");
check("asparagus keeps its s", displayItemName("Asparagus", 1, "count"), "Asparagus");
check("watercress keeps its s", displayItemName("Watercress", 1, "count"), "Watercress");

/* --- a shouted title is read the way a person would type it --- */

check(
  "an importer's caps",
  displayTitle("CRANBERRY & PUMPKIN SEED FLAPJACKS"),
  "Cranberry & Pumpkin Seed Flapjacks",
);
check(
  "punctuation and an emoji survive",
  displayTitle("CARROT, SQUASH & PEAR SOUP 🤍"),
  "Carrot, Squash & Pear Soup 🤍",
);

/* --- and a title somebody meant is never touched --- */

check("title case", displayTitle("Red Pepper & Carrot Soup"), "Red Pepper & Carrot Soup");
check("sentence case", displayTitle("Creamy pesto pasta"), "Creamy pesto pasta");
check("an acronym stays an acronym", displayTitle("BBQ Ribs"), "BBQ Ribs");
check("a roman numeral stays one", displayTitle("MAC N CHEESE III"), "Mac N Cheese III");

// One stray lowercase letter must not save a title from being read as
// shouted - a paste picks those up all the time.
check(
  "one stray lowercase still counts as shouted",
  displayTitle("CRANBERRY & PUMPKIN SEED FLAPJACKs"),
  "Cranberry & Pumpkin Seed Flapjacks",
);

/**
 * A whole lowercase word is the other side of the line, and deliberately so.
 * "CRANBERRY and PUMPKIN FLAPJACKS" is 25 of 28 letters upper, which is under
 * the threshold - somebody typed that "and" on purpose, and a title with real
 * mixed case in it is a title somebody meant. The first case above is a
 * character that slipped; this one is a decision.
 */
check(
  "a deliberate lowercase word is left alone",
  displayTitle("CRANBERRY and PUMPKIN FLAPJACKS"),
  "CRANBERRY and PUMPKIN FLAPJACKS",
);

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("display: all good");
