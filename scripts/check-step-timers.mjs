// Checks which phrases in a method step become timers.
//
//   npm run check:step-timers
//
// The bias under test is the receipt parser's: miss one rather than invent
// one. A step that grows a timer nobody meant is worse than a step where you
// set one yourself, because the wrong one goes off while you are holding a hot
// pan. So the false-positive cases below matter more than the rest, and most
// of them are the ways a recipe writes a number that is not a duration.

import { findTimings, splitStep, clock } from "../lib/step-timers.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

const seconds = (body) => findTimings(body).map((t) => t.seconds);
const texts = (body) => findTimings(body).map((t) => t.text);

/* --- the ordinary cases --- */

check("plain minutes", seconds("Simmer for 20 minutes"), [20 * 60]);
check("abbreviated", seconds("Simmer for 20 mins"), [20 * 60]);
check("singular", seconds("Rest for 1 minute"), [60]);
check("seconds", seconds("Blanch for 30 seconds"), [30]);
check("hours", seconds("Braise for 2 hours"), [2 * 3600]);
check("hr", seconds("Braise for 2 hrs"), [2 * 3600]);

// An hour and a half is one timer, not an hour timer and a thirty minute one.
check("hours and minutes together", seconds("Rest for 1 hour 30 minutes"), [90 * 60]);
check("with an and", seconds("Rest for 1 hour and 30 mins"), [90 * 60]);
check("and it reads as one phrase", texts("Rest for 1 hour 30 minutes"), [
  "1 hour 30 minutes",
]);

/* --- ranges take the lower bound --- */

// A timer wants to go off while the food is still on the early side of done.
check("a hyphen range", seconds("Bake for 20-25 minutes"), [20 * 60]);
check("an en dash range", seconds("Bake for 20–25 minutes"), [20 * 60]);
check("a written range", seconds("Bake for 20 to 25 minutes"), [20 * 60]);
check("the whole range is the phrase", texts("Bake for 20-25 minutes"), ["20-25 minutes"]);

/* --- several in one step, which is the normal case --- */

check(
  "two timings in one step",
  seconds("Fry for 3 minutes, then simmer for 20 minutes"),
  [3 * 60, 20 * 60],
);

/* --- the false positives, which matter most --- */

// No number, so nothing matches - and that is the right answer, not a gap.
for (const vague of [
  "Cook until golden",
  "Leave it overnight",
  "Simmer for a few minutes",
  "Rest until cool",
]) {
  check(`"${vague}" is not a timer`, seconds(vague), []);
}

// Numbers that are not durations.
check("an oven temperature", seconds("Preheat the oven to 200C"), []);
check("gas mark", seconds("Gas mark 6"), []);
check("a weight", seconds("Add 500g of pasta"), []);
check("a count", seconds("Add 2 eggs"), []);
check("a volume", seconds("Pour in 250ml of stock"), []);
check("servings", seconds("Serves 4"), []);

// The single-letter units are deliberately not matched: "5 m" and "500 g" are
// indistinguishable to a regex, so three characters are required.
check("a bare m is not minutes", seconds("Roll it to 5 m"), []);

// A temperature next to a real duration must leave the duration alone.
check(
  "a temperature does not swallow the timing beside it",
  seconds("Bake at 200C for 25 minutes"),
  [25 * 60],
);
check("and the phrase is only the timing", texts("Bake at 200C for 25 minutes"), [
  "25 minutes",
]);

// Zero is not a duration.
check("zero minutes", seconds("Wait 0 minutes"), []);

/* --- splitting for rendering --- */

check(
  "a step with no timing is one piece",
  splitStep("Chop the onions"),
  [{ kind: "text", text: "Chop the onions" }],
);

check(
  "text, timer, text",
  splitStep("Simmer for 20 minutes, stirring"),
  [
    { kind: "text", text: "Simmer for " },
    { kind: "timing", text: "20 minutes", seconds: 1200 },
    { kind: "text", text: ", stirring" },
  ],
);

// Nothing may be lost or duplicated in the split - the step still has to read
// as the step.
{
  const body = "Fry for 3 minutes, then simmer for 20-25 minutes and rest 1 hour.";
  const rebuilt = splitStep(body)
    .map((piece) => piece.text)
    .join("");
  check("the pieces rebuild the step exactly", rebuilt, body);
}

/* --- the clock --- */

check("minutes and seconds", clock(1200), "20:00");
check("under a minute", clock(30), "0:30");
check("padding", clock(65), "1:05");
check("hours appear when needed", clock(5400), "1:30:00");
check("never negative", clock(-5), "0:00");

if (failures > 0) {
  console.error(`\ncheck:step-timers - ${failures} failed`);
  process.exit(1);
}
console.log("check:step-timers - all cases pass");
