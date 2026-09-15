// What the app guesses about how long food lasts.
//
//   npm run check:shelf-life
//
// Two things are being protected here.
//
// The first is that a guess is only ever offered for food the app actually
// recognises. A confident wrong number is worse than a blank, because a blank
// invites a correction and a number does not - and the failure mode of this
// feature is somebody throwing away good food on the strength of a date the
// app made up.
//
// The second is the date arithmetic, which this codebase has been bitten by
// twice. daysUntil compared an instant to a midnight and floored it; the
// planner parsed 'YYYY-MM-DD' as UTC and landed an hour early on the morning
// the clocks went forward. So the clock is pinned here, the way check:dates
// and check:plan pin theirs, because a date test that asks the real time
// passes at midnight and fails at teatime.

import { dateInDays, shelfLifeFor } from "../lib/shelf-life.ts";
import { daysUntil } from "../lib/dates.ts";

let failures = 0;
function check(what, got, expected) {
  if (got !== expected) {
    failures += 1;
    console.error(`  ${what}\n    expected ${expected}\n    got      ${got}`);
  }
}

function ok(what, condition) {
  if (!condition) {
    failures += 1;
    console.error(`  ${what}`);
  }
}

/* ---------------------------------------------------------------------------
   The arithmetic
   --------------------------------------------------------------------------- */

const midMonth = new Date(2026, 5, 10, 14, 30);
check("10 days from 10 Jun", dateInDays(10, midMonth), "2026-06-20");
check("0 days is today", dateInDays(0, midMonth), "2026-06-10");
check("crosses a month end", dateInDays(25, midMonth), "2026-07-05");
check("crosses a year end", dateInDays(30, new Date(2026, 11, 20, 9)), "2027-01-19");
check("leap day exists", dateInDays(1, new Date(2028, 1, 28, 9)), "2028-02-29");

/**
 * The hour must not matter. Built from an instant plus milliseconds, a date
 * computed at 23:30 lands on a different day from the same call at 09:00.
 */
for (const hour of [0, 9, 13, 23]) {
  check(
    `same answer at ${hour}:30`,
    dateInDays(7, new Date(2026, 2, 15, hour, 30)),
    "2026-03-22",
  );
}

/**
 * The morning the clocks go forward in the UK - 29 March 2026, when 01:00
 * becomes 02:00. Adding 24*60*60*1000 across it lands an hour short, which is
 * the bug lib/plan.ts pins noon to avoid.
 */
check("across the spring forward", dateInDays(1, new Date(2026, 2, 28, 23, 30)), "2026-03-29");
check("across the autumn back", dateInDays(1, new Date(2026, 9, 24, 23, 30)), "2026-10-25");

/**
 * And the number the app shows has to agree with the date it stored. These are
 * two different pieces of code - dateInDays here, daysUntil in lib/dates - and
 * "how many days until this" having one answer is the rule that file exists to
 * enforce.
 */
for (const days of [0, 1, 3, 7, 30, 365]) {
  // Against the real today, because daysUntil deliberately takes no clock -
  // it is the one answer to "how many days until", and pinning it here would
  // be testing a stub rather than the thing that ships.
  check(
    `stored ${days} days out reads back as ${days}`,
    daysUntil(dateInDays(days)),
    days,
  );
}

/* ---------------------------------------------------------------------------
   The guessing
   --------------------------------------------------------------------------- */

// Recognised food, with the obvious shape of answer.
ok("milk is days not months", (shelfLifeFor("milk")?.keeps ?? 0) <= 14);
ok("rice is months not days", (shelfLifeFor("basmati rice")?.keeps ?? 0) >= 180);
ok("chicken is short", (shelfLifeFor("chicken breast")?.keeps ?? 99) <= 5);

// A brand and a size in the name must not stop it being recognised - this is
// how things actually arrive from the barcode scanner.
ok("brands survive", shelfLifeFor("Tesco British Semi-Skimmed Milk 2 Pints") !== null);
ok("sizes survive", shelfLifeFor("Chopped Tomatoes 400g") !== null);

/**
 * Not recognised means no answer. This is the important half: the app must
 * decline rather than reach for a middling default.
 */
for (const unknown of ["", "xyzzy", "sriracha mayo", "quince paste", "haggis"]) {
  ok(`no guess for "${unknown}"`, shelfLifeFor(unknown) === null);
}

/**
 * Recognised but immortal is also no answer, and for a different reason: salt
 * does not need a date, and writing one down leaves somebody wondering in a
 * year why their salt is flagged.
 */
for (const forever of ["salt", "sugar", "honey", "white wine vinegar"]) {
  ok(`no date for ${forever}`, shelfLifeFor(forever) === null);
}

/**
 * Every answer has to be usable. A guess with neither number in it is a row
 * that passed the recognised check and then said nothing, which would write a
 * null date and mark it as estimated.
 */
for (const name of ["milk", "bread", "carrots", "olive oil", "mustard", "eggs"]) {
  const guess = shelfLifeFor(name);
  ok(`${name} has something to say`, guess !== null && (guess.keeps !== null || guess.openFor !== null));
  if (guess?.keeps !== null && guess?.keeps !== undefined) {
    ok(`${name} keeps for a positive number of days`, guess.keeps > 0);
  }
  if (guess?.openFor !== null && guess?.openFor !== undefined) {
    ok(`${name} opens to a positive number of days`, guess.openFor > 0);
  }
}

/**
 * Opening never extends the life of a sealed thing.
 *
 * A jar that keeps two years sealed and "three years once open" is nonsense,
 * and the two numbers are typed by hand in two columns, which is exactly how
 * that gets in. Fresh things are exempt: an onion keeps a month whole and a
 * week cut, and both are measured from different moments.
 */
const LONG_LIFE = ["rice", "pasta", "mustard", "ketchup", "soy sauce", "olive oil"];
for (const name of LONG_LIFE) {
  const guess = shelfLifeFor(name);
  if (guess?.keeps == null || guess?.openFor == null) continue;
  ok(`${name}: opening does not extend it`, guess.openFor <= guess.keeps);
}

if (failures > 0) {
  console.error(`\n${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("shelf life: dates land on the right day, and only known food gets a guess.");
