// Checks when the weekly nudge decides it is due.
//
//   npm run check:push
//
// The cron fires once a day, at 17:00 UTC - Vercel's Hobby plan allows no more
// than that - so the DAY is what has to be read correctly, and reading it from
// the server's own clock is how everybody gets nudged a day early all summer.
//
// This app deploys to Frankfurt and is used in Britain. Those are the same
// day at every hour anybody plans a week at, but they are NOT the same hour -
// and twice a year the gap between them changes while the server's own clock
// does not notice. A reminder set for six on a Sunday evening arriving at five
// is the kind of bug that gets reported as "it feels wrong" and never as a
// reproducible fault, so the London reading is asked of Intl rather than
// computed, and this holds it to that on both changeover days.
//
// The delivery half cannot be checked here. Push needs a real push service and
// a real browser with a real permission grant, and headless Chromium refuses
// notifications outright - so the "Send one now" button in settings exists
// precisely because this file cannot do that job.

import { londonDate, londonNow } from "../lib/push.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

/** A UTC instant, which is the only unambiguous way to write one of these. */
const at = (iso) => new Date(iso);

/* --- winter: London is UTC --- */

// Sunday 11 January 2026, 18:00 UTC.
check("a winter Sunday evening", londonNow(at("2026-01-11T18:00:00Z")), {
  day: 0,
  hour: 18,
});
check("a winter Monday morning", londonNow(at("2026-01-12T09:00:00Z")), {
  day: 1,
  hour: 9,
});

/* --- summer: London is an hour ahead of UTC --- */

// Sunday 12 July 2026, 17:00 UTC is 18:00 BST. A reminder set for six gets
// sent on this run and not on the 18:00 UTC one.
check("a summer Sunday evening", londonNow(at("2026-07-12T17:00:00Z")), {
  day: 0,
  hour: 18,
});
check("and not an hour later", londonNow(at("2026-07-12T18:00:00Z")), {
  day: 0,
  hour: 19,
});

/* --- the changeovers --- */

// BST begins 01:00 UTC on 29 March 2026: the clocks go straight to 02:00.
check("just before the spring forward", londonNow(at("2026-03-29T00:30:00Z")), {
  day: 0,
  hour: 0,
});
check("just after it", londonNow(at("2026-03-29T01:30:00Z")), {
  day: 0,
  hour: 2,
});

// BST ends 01:00 UTC on 25 October 2026: the clocks go back to 01:00.
check("just before the autumn back", londonNow(at("2026-10-25T00:30:00Z")), {
  day: 0,
  hour: 1,
});
check("just after it", londonNow(at("2026-10-25T01:30:00Z")), {
  day: 0,
  hour: 1,
});

/* --- midnight, which is where a day/hour pair is easiest to get wrong --- */

// 23:30 UTC on a summer Saturday is 00:30 SUNDAY in London. A naive reading of
// the server's own day would nudge everybody a day early all summer.
check("late Saturday UTC is Sunday in London", londonNow(at("2026-07-11T23:30:00Z")), {
  day: 0,
  hour: 0,
});

// And the mirror: 23:30 UTC in winter is still Saturday.
check("late Saturday in winter is Saturday", londonNow(at("2026-01-10T23:30:00Z")), {
  day: 6,
  hour: 23,
});

/* --- every hour of a year lands somewhere sensible --- */

let bad = [];
let clock = at("2026-01-01T00:00:00Z");
for (let i = 0; i < 24 * 365; i += 1) {
  const { day, hour } = londonNow(clock);
  if (!Number.isInteger(day) || day < 0 || day > 6) bad.push(clock.toISOString());
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) bad.push(clock.toISOString());
  clock = new Date(clock.getTime() + 3600 * 1000);
}
check("a year of hours, all in range", bad, []);

/**
 * Every hour of a week is reachable.
 *
 * The cron only reads the day now, so nothing turns on this today - it is kept
 * because the hour is still stored and becomes load-bearing again the moment
 * the cron can run more than once a day. Midnight is the one at risk: hour12
 * and some locales give "24" for it, which would never match a stored 0.
 */
const seen = new Set();
clock = at("2026-06-01T00:00:00Z");
for (let i = 0; i < 24 * 8; i += 1) {
  const { day, hour } = londonNow(clock);
  seen.add(`${day}:${hour}`);
  clock = new Date(clock.getTime() + 3600 * 1000);
}
check("all 168 hours of a week occur", seen.size, 168);

// Said explicitly, because "24:00" is exactly what en-GB hour12:false returns
// for midnight if the modulo is ever dropped.
check("midnight is hour 0", londonNow(at("2026-06-14T23:00:00Z")).hour, 0);

/* --- the date the once-a-day guard compares against --- */

// Same reasoning as londonNow, and the same trap: the server's own date rolls
// over an hour early all summer, so "already nudged today" would be wrong for
// an hour every night and the guard would let a second one through.
check("a winter date", londonDate(at("2026-01-11T18:00:00Z")), "2026-01-11");
check("a summer evening", londonDate(at("2026-07-12T17:00:00Z")), "2026-07-12");

// 23:30 UTC on a summer Saturday is already Sunday in London.
check("late Saturday UTC", londonDate(at("2026-07-11T23:30:00Z")), "2026-07-12");
// And in winter it is not.
check("late Saturday in winter", londonDate(at("2026-01-10T23:30:00Z")), "2026-01-10");

// en-CA rather than en-GB: en-GB would give "11/01/2026", which sorts wrong,
// compares wrong, and is not what the column says it holds.
check(
  "the shape the column expects",
  /^\d{4}-\d{2}-\d{2}$/.test(londonDate(at("2026-03-29T01:30:00Z"))),
  true,
);

// The date and the day have to agree, or the guard blocks the wrong people.
let disagreed = [];
let tick = at("2026-01-01T00:00:00Z");
for (let i = 0; i < 24 * 400; i += 1) {
  const { day } = londonNow(tick);
  const iso = londonDate(tick);
  // Parsed back at noon, the way lib/plan does, so the two readings of the
  // same instant must name the same weekday.
  const [y, m, d] = iso.split("-").map(Number);
  if (new Date(y, m - 1, d, 12).getDay() !== day) disagreed.push(iso);
  tick = new Date(tick.getTime() + 3600 * 1000);
}
check("date and day never disagree", disagreed, []);

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("push: all good");
