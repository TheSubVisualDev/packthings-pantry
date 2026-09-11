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

/** Days from now until a date-only string, negative once it's past. */
export function daysUntil(date: string): number {
  const then = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((then - Date.now()) / 86_400_000);
}

/** "12 Mar" - the hour something happened has never mattered here. */
export function shortDate(value: string | null): string {
  const date = parseStamp(value);
  return date
    ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";
}
