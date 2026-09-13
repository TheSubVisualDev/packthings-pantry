// Checks when the weekly nudge decides it is due.
//
//   npm run check:push
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

import { londonNow } from "../lib/push.ts";

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
 * The cron runs hourly and matches on the hour, so an hour that never comes up
 * is a reminder that would never fire. Midnight is the one at risk: hour12 and
 * some locales give "24" for it, which would never match a stored 0.
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

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("push: all good");
