// The one rule for "how many days until this date".
//
//   npm run check:dates
//
// There were two of these and they disagreed. daysUntil subtracted the current
// INSTANT from the target date's midnight and floored it - a fraction, floored,
// and Math.floor rounds a negative away from zero - so something that went off
// yesterday afternoon read as two days ago. The SQL in getExpiring did the same
// subtraction and truncated toward zero, so it answered one. One item, three
// screens, three numbers.
//
// The rule now: whole days between two calendar days. The SQL copy still
// exists because it sorts the query, but it is never the number shown.
//
// Every case here fixes "now" to a known instant, because a test that asks the
// real clock passes at midnight and fails at teatime, which is exactly the bug
// it is supposed to be catching.

import { daysUntil, sayDay } from "../lib/dates.ts";

let failures = 0;
function check(what, got, expected) {
  if (got !== expected) {
    failures += 1;
    console.error(`  ${what}\n    expected ${expected}\n    got      ${got}`);
  }
}

/** Runs a check with the clock pinned. */
function at(iso, body) {
  const Real = Date;
  const fixed = new Real(iso).getTime();
  globalThis.Date = class extends Real {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  };
  try {
    body();
  } finally {
    globalThis.Date = Real;
  }
}

/* --- the reported bug: yesterday is one day ago, at any hour --- */

// 14 Sep, teatime. Tiger Bloomer's use-by was the 13th. The item page said
// "2 days ago"; /pantry/expiring said "2d ago"; /stats said "3d over".
at("2026-09-14T17:30:00", () => {
  check("yesterday, at teatime", daysUntil("2026-09-13"), -1);
  check("today, at teatime", daysUntil("2026-09-14"), 0);
  check("tomorrow, at teatime", daysUntil("2026-09-15"), 1);
});

// The same three, one minute after midnight. The old version happened to be
// right here, which is why it survived.
at("2026-09-14T00:01:00", () => {
  check("yesterday, just after midnight", daysUntil("2026-09-13"), -1);
  check("today, just after midnight", daysUntil("2026-09-14"), 0);
  check("tomorrow, just after midnight", daysUntil("2026-09-15"), 1);
});

// And one minute before it.
at("2026-09-14T23:59:00", () => {
  check("yesterday, just before midnight", daysUntil("2026-09-13"), -1);
  check("today, just before midnight", daysUntil("2026-09-14"), 0);
});

/* --- distance, in both directions --- */

at("2026-09-14T12:00:00", () => {
  check("a fortnight out", daysUntil("2026-09-28"), 14);
  check("a fortnight gone", daysUntil("2026-08-31"), -14);
  check("a year out", daysUntil("2027-09-14"), 365);
});

/* --- the clock changes, which is why this rounds rather than floors --- */

// Britain goes forward on 29 March 2026: that day is 23 hours long. Floor on a
// 23-hour gap gives 0 where the answer is 1.
at("2026-03-28T12:00:00", () => {
  check("across the spring forward", daysUntil("2026-03-29"), 1);
  check("and the day after it", daysUntil("2026-03-30"), 2);
});

// Back again on 25 October 2026: that day is 25 hours long.
at("2026-10-24T12:00:00", () => {
  check("across the autumn back", daysUntil("2026-10-25"), 1);
  check("and the day after it", daysUntil("2026-10-26"), 2);
});

/* --- a date it cannot read is not today --- */

at("2026-09-14T12:00:00", () => {
  check("nonsense reads as zero", daysUntil("not a date"), 0);
  check("an empty string reads as zero", daysUntil(""), 0);
});

/* --- how a day is said on screen --- */

// Said, not stored: the item page printed "2026-09-17" straight from the row.
check("a day, said", sayDay("2026-09-17"), "Thu 17 Sep");
check("the spring-forward day keeps its date", sayDay("2026-03-29"), "Sun 29 Mar");
check("nonsense comes back as it went in", sayDay("soon"), "soon");

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("dates: all good");
