// Checks that the Tonight ranker puts the right dinner first.
//
//   npm run check:tonight
//
// The weights are arguable and the orderings they produce are not, so this
// asserts orderings. Each case is a pair of recipes differing in one signal,
// which is the only way to tell whether a weight is doing what it claims -
// and the reason strings are checked too, because a recommendation without a
// reason is a magic trick and one with a wrong reason is worse.

import { rankTonight, nearlyThere, scoreRecipe, explain } from "../lib/tonight.ts";

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
function recipe(name, overrides = {}) {
  return {
    id: nextId++,
    name,
    have: 4,
    total: 4,
    rescues: [],
    missing: [],
    minutes: 30,
    rating: null,
    timesCooked: 0,
    daysSinceCooked: null,
    ...overrides,
  };
}

const first = (list) => rankTonight(list)[0].name;

/* --- readiness --- */

check(
  "a recipe you can make beats one you cannot",
  first([
    recipe("Short", { have: 2, total: 6, missing: ["a", "b", "c", "d"] }),
    recipe("Ready"),
  ]),
  "Ready",
);

/* --- urgency, the heaviest signal --- */

// The whole point. Throwing food away is worse than eating the same thing
// next week, so a deadline beats a full cupboard.
check(
  "something going off beats something merely makeable",
  first([
    recipe("Nothing urgent"),
    recipe("Uses the coriander", {
      have: 3,
      total: 4,
      missing: ["rice"],
      rescues: [{ name: "Coriander", daysLeft: 1 }],
    }),
  ]),
  "Uses the coriander",
);

// But not without limit. A recipe needing five things you do not have is not a
// rescue, it is a shopping trip with a deadline attached.
check(
  "a deadline does not promote a shopping trip",
  first([
    recipe("Ready to cook"),
    recipe("Barely stocked", {
      have: 1,
      total: 8,
      missing: ["a", "b", "c", "d", "e", "f", "g"],
      rescues: [{ name: "Coriander", daysLeft: 0 }],
    }),
  ]),
  "Ready to cook",
);

check(
  "sooner beats later",
  first([
    recipe("Next week", { rescues: [{ name: "Milk", daysLeft: 6 }] }),
    recipe("Tomorrow", { rescues: [{ name: "Spinach", daysLeft: 1 }] }),
  ]),
  "Tomorrow",
);

/* --- fatigue, the signal nothing has ever read --- */

check(
  "you had it last night",
  first([
    recipe("Had it yesterday", { daysSinceCooked: 1, rating: 5, timesCooked: 9 }),
    recipe("Not for a while"),
  ]),
  "Not for a while",
);

check(
  "long enough ago stops counting",
  first([
    recipe("Ages ago", { daysSinceCooked: 30, rating: 5, timesCooked: 9 }),
    recipe("Never cooked"),
  ]),
  "Ages ago",
);

// Fatigue is heavy enough to matter but must not beat food going off - the
// thing you had on Tuesday is still better than binning the spinach.
check(
  "a deadline survives having cooked it recently",
  first([
    recipe("Fresh idea"),
    recipe("Had it Tuesday", {
      daysSinceCooked: 2,
      rescues: [{ name: "Spinach", daysLeft: 0 }],
    }),
  ]),
  "Had it Tuesday",
);

/* --- affection and effort, the tie-breakers --- */

check(
  "a recipe you rated highly wins a tie",
  first([recipe("Unrated"), recipe("Loved", { rating: 5 })]),
  "Loved",
);

check(
  "the quicker of two equals wins",
  first([recipe("Slow", { minutes: 90 }), recipe("Quick", { minutes: 10 })]),
  "Quick",
);

// An untimed recipe makes no claim about being quick, so it must not beat one
// that says ten minutes.
check(
  "no timing is not a claim of speed",
  first([recipe("Untimed", { minutes: null }), recipe("Ten minutes", { minutes: 10 })]),
  "Ten minutes",
);

/* --- the reason --- */

check(
  "a full cupboard says so",
  explain(recipe("x")),
  "you have everything",
);
check(
  "one missing thing is named",
  explain(recipe("x", { have: 3, total: 4, missing: ["Rice"] })),
  "only missing rice",
);
check(
  "several missing things are counted",
  explain(recipe("x", { have: 2, total: 6, missing: ["a", "b", "c", "d"] })),
  "2 of 6 in stock",
);
check(
  "a deadline leads, with the stock position after it",
  explain(recipe("x", { rescues: [{ name: "Coriander", daysLeft: 2 }] })),
  "uses the coriander, in 2 days · you have everything",
);
check(
  "today reads as today",
  explain(recipe("x", { rescues: [{ name: "Spinach", daysLeft: 0 }] })),
  "uses the spinach, today · you have everything",
);
check(
  "something already off still says so",
  explain(recipe("x", { rescues: [{ name: "Milk", daysLeft: -2 }] })),
  "uses the milk, already past · you have everything",
);
check(
  "a favourite mentions itself only when nothing better applies",
  explain(recipe("x", { timesCooked: 6 })),
  "you have everything · cooked 6 times",
);
check(
  "and stays quiet when there is a deadline to lead with",
  explain(recipe("x", { timesCooked: 6, rescues: [{ name: "Kale", daysLeft: 1 }] })),
  "uses the kale, tomorrow · you have everything",
);

/* --- nearly there --- */

{
  const list = [
    recipe("Ready now"),
    recipe("One short", { have: 4, total: 5, missing: ["Tahini"] }),
    recipe("Two short", { have: 3, total: 5, missing: ["Tahini", "Harissa"] }),
  ];
  check("only exactly-one-short qualifies", nearlyThere(list).name, "One short");
  check(
    "the winner is not offered again as nearly",
    nearlyThere(list, [list[1].id]),
    null,
  );
  check("nothing qualifying is null", nearlyThere([recipe("Ready")]), null);
}

/* --- a recipe with no ingredients cannot be a suggestion by default --- */

check(
  "an empty recipe scores nothing for readiness",
  scoreRecipe(recipe("Empty", { have: 0, total: 0 })).parts.readiness,
  0,
);
check(
  "and says so rather than claiming you have everything",
  explain(recipe("Empty", { have: 0, total: 0 })),
  "no ingredients listed",
);

if (failures > 0) {
  console.error(`\ncheck:tonight - ${failures} failed`);
  process.exit(1);
}
console.log("check:tonight - all cases pass");
