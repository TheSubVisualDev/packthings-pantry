// Checks the generic-food matcher against the names that have caught it out.
//
//   npm run check:estimates
//
// Every case here is one that was wrong at some point. "Rice vinegar" scored as
// dry rice, eight times the calories; "Soy sauce" found nothing at all because a
// collapsed escape was stripping the letter s out of every name.

import { estimateFor } from "../lib/generic-nutrition.ts";

const CASES = [
  // The longest phrase wins.
  ["Almond milk", "almond milk"],
  ["Oat milk", "oat milk"],
  ["Whole Milk", "whole milk"],
  ["Sweet potato", "sweet potato"],
  ["Spring onion", "spring onion"],
  ["Chilli powder", "chilli powder"],
  ["Olive oil", "olive oil"],
  ["Peanut butter", "peanut butter"],

  // Then the later word wins: English puts the head noun last.
  ["Rice vinegar", "vinegar"],
  ["Short grain rice", "rice"],

  // Whole words only.
  ["Cornflour", null],
  ["Peanuts", null],

  // Ordinary names still land.
  ["Soy sauce", "soy sauce"],
  ["Brown Onions", "onion"],
  ["British Carrots", "carrots"],
  ["Free Range Eggs", "eggs"],
  ["Sweet Peppers", "pepper"],
  ["Vegetable stock cubes", "stock cube"],
  ["Tiger Bloomer", "bread"],
  ["Dried Oregano", "oregano"],

  // Nothing sensible to say.
  ["MSG", null],
  ["Gochugaru", "chilli powder"],
];

let problems = 0;
for (const [name, want] of CASES) {
  const got = estimateFor(name)?.label ?? null;
  const ok = got === want;
  if (!ok) problems += 1;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name.padEnd(24)} -> ${got ?? "(nothing)"}${ok ? "" : `  wanted ${want ?? "nothing"}`}`,
  );
}

// A weight is what lets "2 eggs" become grams. Without it a counted ingredient
// drops out of every recipe total, silently.
const NEEDS_WEIGHT = ["eggs", "onion", "garlic", "carrots", "pepper", "stock cube"];
for (const label of NEEDS_WEIGHT) {
  const found = estimateFor(label);
  const has = Boolean(found?.unitGrams);
  if (!has) problems += 1;
  console.log(`  ${has ? "ok  " : "FAIL"} ${label.padEnd(24)} has a unit weight`);
}

console.log(problems === 0 ? "\nall good" : `\n${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
