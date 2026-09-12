/**
 * Finding the timings inside a method step, so "simmer for 20 minutes" can be
 * a button.
 *
 * The steps are already structured rows, so the timings can be read out of the
 * text rather than typed in separately - the same trick the receipt parser
 * uses, and the same bias: miss one rather than invent one. A step that quietly
 * grows a timer nobody meant is worse than a step where you set one yourself,
 * because the first is wrong while you are holding a hot pan.
 *
 * Vague durations are deliberately not timers. "Until golden", "overnight" and
 * "a few minutes" all have no number in them, so nothing here matches them,
 * and that is the correct outcome rather than a gap to fill later.
 */

export interface Timing {
  /** Where the phrase starts in the body, so it can be replaced in place. */
  index: number;
  /** The exact matched text - "20 minutes", "1 hour 30 mins". */
  text: string;
  /** How long, in seconds. */
  seconds: number;
}

const HOURS = "hours?|hrs?";
const MINUTES = "minutes?|mins?";
const SECONDS = "seconds?|secs?";

/**
 * A number, optionally a range, then a unit - with an optional second part for
 * "1 hour 30 minutes".
 *
 * Single-letter units are deliberately excluded. "5 m" is a plausible way to
 * write five minutes and "500 g" is a plausible way to write five hundred
 * grams, and no regex can tell which somebody meant from one letter. Requiring
 * three characters costs the occasional real timing and never invents one.
 *
 * A range takes its lower bound, because a timer is a thing you want to go off
 * while the food is still on the early side of done.
 */
const TIMING = new RegExp(
  String.raw`\b(\d+)\s*(?:[-–—]|\s+to\s+)\s*\d+\s*(${HOURS}|${MINUTES}|${SECONDS})\b` +
    String.raw`|\b(\d+)\s*(${HOURS})\b(?:\s*(?:and\s+)?(\d+)\s*(?:${MINUTES})\b)?` +
    String.raw`|\b(\d+)\s*(${MINUTES}|${SECONDS})\b`,
  "gi",
);

function unitSeconds(unit: string): number {
  const lower = unit.toLowerCase();
  if (/^h/.test(lower)) return 3600;
  if (/^m/.test(lower)) return 60;
  return 1;
}

/** Every timing in a step, in the order they are written. */
export function findTimings(body: string): Timing[] {
  const found: Timing[] = [];

  for (const match of body.matchAll(TIMING)) {
    const [text, rangeLow, rangeUnit, hours, hourUnit, extraMinutes, plain, plainUnit] =
      match;

    let seconds = 0;
    if (rangeLow !== undefined) {
      seconds = Number(rangeLow) * unitSeconds(rangeUnit);
    } else if (hours !== undefined) {
      seconds = Number(hours) * unitSeconds(hourUnit);
      if (extraMinutes !== undefined) seconds += Number(extraMinutes) * 60;
    } else if (plain !== undefined) {
      seconds = Number(plain) * unitSeconds(plainUnit);
    }

    // Zero is not a duration, and a number that overflowed is not one either.
    if (seconds > 0 && Number.isFinite(seconds)) {
      found.push({ index: match.index, text, seconds });
    }
  }

  return found;
}

/**
 * The step broken into text and timers, ready to render.
 *
 * Returned as alternating pieces rather than as HTML, so the component decides
 * what a timer looks like and this file never learns about markup.
 */
export type StepPiece =
  | { kind: "text"; text: string }
  | { kind: "timing"; text: string; seconds: number };

export function splitStep(body: string): StepPiece[] {
  const timings = findTimings(body);
  if (timings.length === 0) return [{ kind: "text", text: body }];

  const pieces: StepPiece[] = [];
  let at = 0;

  for (const timing of timings) {
    if (timing.index > at) {
      pieces.push({ kind: "text", text: body.slice(at, timing.index) });
    }
    pieces.push({ kind: "timing", text: timing.text, seconds: timing.seconds });
    at = timing.index + timing.text.length;
  }

  if (at < body.length) pieces.push({ kind: "text", text: body.slice(at) });
  return pieces;
}

/** "20:00", "1:05:00" - a duration as a clock reads it. */
export function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;

  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}
