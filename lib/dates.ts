/**
 * Reading timestamps back out of the database.
 *
 * Two formats reach these columns and both have to work. CURRENT_TIMESTAMP
 * writes SQLite's own "YYYY-MM-DD HH:MM:SS", in UTC with nothing saying so;
 * anything written from JavaScript arrives as a full ISO string that already
 * carries its own Z. Appending a Z to the second kind produces "...ZZ", which
 * parses to Invalid Date and takes the page down with it.
 */
export function parseStamp(value: string | null): Date | null {
  if (!value) return null;

  // Already carries a zone or a T - hand it over untouched.
  const normalised = /[TZ]|[+-]\d{2}:\d{2}$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;

  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Days from today until a date-only string, negative once it's past.
 *
 * Whole days between two calendar days, which is the only thing a use-by date
 * means. It used to subtract `Date.now()` from that date's midnight and floor
 * the result - an instant against a midnight, so a fraction, and `Math.floor`
 * rounds a negative AWAY from zero. Something that went off yesterday
 * afternoon came back as two days ago, and it was wrong by a day for every
 * moment that was not exactly midnight, which is all of them.
 *
 * It disagreed with the SQL in `getExpiring` too, which truncated toward zero
 * and so answered one day for the same row. Three screens gave three answers
 * for one date. The rule lives here; `getExpiring` went with stock tracking in
 * v2, and any SQL that needs to sort by a date sorts with its own copy without
 * ever printing it.
 *
 * Rounded rather than floored because both ends are local midnight: the gap is
 * a whole number of days except across a clock change, where it is 23 or 25
 * hours and rounding is what keeps it whole.
 */
export function daysUntil(date: string): number {
  const then = new Date(`${date}T00:00:00`);
  if (Number.isNaN(then.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

/** "12 Mar" - the hour something happened has never mattered here. */
export function shortDate(value: string | null): string {
  const date = parseStamp(value);
  return date
    ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";
}

/**
 * "Thu 17 Sep" for a 'YYYY-MM-DD' day, which is how a date on a packet is
 * said. The item page printed the stored string, "Was good until
 * 2026-09-17", which is a database talking.
 *
 * Spelled out by hand rather than asked of Intl. The server renders this
 * first and the phone renders it again, and the two need not agree: Node's
 * en-GB said "Sept" on the machine this was written on, a browser may say
 * "Sep", and the difference is a hydration error. Noon, so no timezone can
 * move the day.
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function sayDay(date: string): string {
  const day = new Date(`${date}T12:00:00`);
  if (Number.isNaN(day.getTime())) return date;
  return `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

/**
 * Today in London as 'YYYY-MM-DD'.
 *
 * The server is in Frankfurt, whose date turns over an hour before the
 * kitchen's does - "probably due" and a payment dated today would both be a
 * day out for that hour. The one place that answers this - there were three,
 * and two copies of a date rule is the bug this file was made to end.
 * lib/push.ts keeps londonNow because it needs the hour as well.
 */
export function londonToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
