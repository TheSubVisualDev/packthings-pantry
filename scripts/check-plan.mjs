// Checks the week arithmetic behind the meal planner.
//
//   npm run check:plan
//
// Dates are the part of a planner that goes wrong, and it goes wrong twice a
// year in a way nobody notices until somebody's Sunday dinner is on Monday.
// Two rules are being defended.
//
// A date here is a DAY, not an instant. "Thursday dinner" is a fact about the
// kitchen's calendar; the moment it happens depends on where you are standing.
// So everything is 'YYYY-MM-DD' text, and the only Date ever constructed from
// one is pinned to noon - because new Date("2026-03-29") parses as UTC, which
// on the morning the clocks go forward is 01:00 local, and adding a day to
// something sitting an hour from a DST boundary is how a week grows or loses
// a day.
//
// And the week starts on Monday, because this is a British app and the
// question is asked on Sunday evening about the days after it.

import {
  addDays,
  cleanSlots,
  DEFAULT_SLOTS,
  fromIso,
  isoDate,
  MAX_SLOTS,
  readSlots,
  weekDates,
  weekLabel,
  weekStart,
} from "../lib/plan.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

/* --- the week starts on Monday --- */

// 14 September 2026 is a Monday.
check("Monday is its own week start", weekStart("2026-09-14"), "2026-09-14");
check("Tuesday looks back one", weekStart("2026-09-15"), "2026-09-14");
check("Thursday looks back three", weekStart("2026-09-17"), "2026-09-14");

// The one everybody gets wrong. getDay() is 0 on Sunday, so a naive
// subtraction puts Sunday at the START of the coming week rather than the end
// of the one it is in - and "what are we eating this week", asked on Sunday
// evening, is about the week that is ending only if you have made that
// mistake.
check("Sunday ends the week it is in", weekStart("2026-09-20"), "2026-09-14");
check("the next Monday starts a new one", weekStart("2026-09-21"), "2026-09-21");

check("a week is seven days", weekDates("2026-09-14").length, 7);
check("it starts where it says", weekDates("2026-09-14")[0], "2026-09-14");
check("and ends on the Sunday", weekDates("2026-09-14")[6], "2026-09-20");

/* --- adding days does not fall off a month, a year, or an hour --- */

check("across a month", addDays("2026-09-30", 1), "2026-10-01");
check("across a year", addDays("2026-12-31", 1), "2027-01-01");
check("backwards across a year", addDays("2027-01-01", -1), "2026-12-31");

// February, which has the other classic off-by-one in it.
check("a leap day exists", addDays("2028-02-28", 1), "2028-02-29");
check("and is not skipped", addDays("2028-02-29", 1), "2028-03-01");
check("a non-leap February ends early", addDays("2027-02-28", 1), "2027-03-01");

/**
 * The clocks.
 *
 * In the UK, BST begins on 29 March 2026 and ends on 25 October 2026. On both
 * mornings one local day is 23 or 25 hours long. Adding a day by setDate is
 * safe because it works in calendar terms; adding 24 hours of milliseconds is
 * not, and this is the case that would catch it.
 */
check("across the spring forward", addDays("2026-03-28", 1), "2026-03-29");
check("and the day after it", addDays("2026-03-29", 1), "2026-03-30");
check("across the autumn back", addDays("2026-10-24", 1), "2026-10-25");
check("and the day after that", addDays("2026-10-25", 1), "2026-10-26");

// The whole week containing the spring forward still has seven distinct days.
const springWeek = weekDates(weekStart("2026-03-29"));
check("the DST week has seven days", springWeek.length, 7);
check("all seven are distinct", new Set(springWeek).size, 7);
check("it begins on the Monday", springWeek[0], "2026-03-23");
check("and contains the changeover", springWeek.includes("2026-03-29"), true);

/* --- round tripping --- */

// The noon pin is the point: parse and re-print must be the same day, on every
// day of a year including both changeovers.
let drifted = [];
let date = "2026-01-01";
for (let i = 0; i < 400; i += 1) {
  if (isoDate(fromIso(date)) !== date) drifted.push(date);
  date = addDays(date, 1);
}
check("no day drifts in 400", drifted, []);

// Walking a year forwards and back again lands where it started.
let walked = "2026-01-01";
for (let i = 0; i < 365; i += 1) walked = addDays(walked, 1);
for (let i = 0; i < 365; i += 1) walked = addDays(walked, -1);
check("a year out and back", walked, "2026-01-01");

/* --- what the heading says --- */

check("a week inside one month", weekLabel("2026-09-14"), "14 – 20 September");
// Spanning two months has to name both, or "28 – 4 October" is a riddle.
// "Sept" rather than "Sep": that is what en-GB abbreviates September to, and
// pinning the expectation to it is how this notices if the locale ever slips
// to en-US, where the whole date order would be wrong too.
check("a week across two", weekLabel("2026-09-28"), "28 Sept – 4 October");

/* --- slots --- */

check("nothing stored is the default", readSlots(null), DEFAULT_SLOTS);
check("empty string too", readSlots(""), DEFAULT_SLOTS);
check("a real list", readSlots('["Breakfast","Lunch","Dinner"]'), [
  "Breakfast",
  "Lunch",
  "Dinner",
]);

// The column is free text in a database that has been edited by hand before.
// Anything unusable becomes the default rather than an error on a page
// somebody was only trying to read.
check("broken JSON", readSlots("{not json"), DEFAULT_SLOTS);
check("the wrong shape", readSlots('{"a":1}'), DEFAULT_SLOTS);
check("a list of nothing", readSlots("[]"), DEFAULT_SLOTS);
check("a list of blanks", readSlots('["","  "]'), DEFAULT_SLOTS);
check("non-strings are dropped", readSlots('[1,"Dinner",null]'), ["Dinner"]);

// More than three is a diary rather than a meal plan.
check(
  "capped at three",
  readSlots('["A","B","C","D","E"]'),
  ["A", "B", "C"],
);
check("cleanSlots caps too", cleanSlots(["A", "B", "C", "D"]).length, MAX_SLOTS);
check("and trims", cleanSlots(["  Dinner  "]), ["Dinner"]);
check("and refuses to write nothing", cleanSlots(["", " "]), DEFAULT_SLOTS);
// A name long enough to break the grid is cut rather than refused: somebody
// pasting a sentence into a slot name meant the first few words of it.
check("a very long name is cut", cleanSlots(["x".repeat(80)])[0].length, 24);

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("plan: all good");
