/**
 * What to cook tonight, and why.
 *
 * Three panels used to answer this and disagree: the rescues list, the top
 * match, and the runners-up, all on the stock page. None of them ranked
 * against the others and none of them said why. This is one answer with its
 * reasoning attached.
 *
 * Every signal here is something the database has been recording for months
 * and nothing has ever read. Fatigue in particular: cook_events has known what
 * you had on Tuesday since phase 1, and until now the app would happily
 * suggest it again on Wednesday.
 *
 * The scoring is kept pure and separate from the loading on purpose, so
 * check:tonight can put a fixture kitchen through it and a weight can be
 * changed with a before and after rather than a feeling.
 */

/** Everything the ranker needs about one recipe. No database types. */
export interface RecipeFacts {
  id: number;
  name: string;
  /** Lines this kitchen can supply right now, and how many there are. */
  have: number;
  total: number;
  /** Things in it that are about to go off, soonest first. */
  rescues: { name: string; daysLeft: number }[];
  /** Lines it cannot supply, as the recipe words them. */
  missing: string[];
  /** Prep plus cook, or null when nobody has said. */
  minutes: number | null;
  /** Average rating out of 5, or null. */
  rating: number | null;
  timesCooked: number;
  /** Days since this kitchen last cooked it, or null for never. */
  daysSinceCooked: number | null;
}

export interface Suggestion extends RecipeFacts {
  score: number;
  /** Why it is being suggested, in words. Never empty. */
  reason: string;
}

/**
 * What each signal is worth.
 *
 * In one place with the reasoning written down, because these are the numbers
 * somebody will want to argue with - and the argument should be about the
 * ordering they produce, which check:tonight makes visible.
 */
export const WEIGHTS = {
  /** How much of it is already on the shelf. The baseline question. */
  readiness: 1,
  /**
   * Something in it is about to go off.
   *
   * Deliberately the heaviest. The alternative to cooking a recipe you have
   * everything for is cooking it next week; the alternative to using the
   * coriander is throwing it away. That asymmetry is the entire difference
   * between a recommender and a filter, and it is why this outranks readiness.
   */
  urgency: 1.6,
  /** You have rated it, or keep going back to it. */
  affection: 0.5,
  /**
   * You had it recently. Negative, and heavy enough to sink an otherwise
   * perfect match - nobody wants the same dinner three nights running, and a
   * suggestion panel that keeps proposing Tuesday's is one you stop reading.
   */
  fatigue: -1.4,
  /** Mildly prefers the quicker of two otherwise equal options. */
  effort: 0.25,
} as const;

/** Expiring within this many days is worth acting on at all. */
const URGENT_WITHIN_DAYS = 7;

/** How long it takes to want something again. */
const FATIGUE_FADES_AFTER_DAYS = 14;

/** Past this, one more minute stops making a recipe meaningfully longer. */
const LONG_RECIPE_MINUTES = 90;

/**
 * Readiness at which a rescue counts for full marks.
 *
 * Urgency outranking readiness is the point, but it has a limit: a recipe
 * needing five things you do not have is not a rescue for the sixth, it is a
 * shopping trip with a deadline. Below this the urgency is scaled down rather
 * than switched off, so a dying ingredient still lifts a half-stocked recipe -
 * just not over a recipe you could actually make tonight.
 */
const RESCUE_NEEDS_READINESS = 0.6;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** 0 to 1, where 1 is "today or already past". */
function urgencyOf(daysLeft: number): number {
  return clamp((URGENT_WITHIN_DAYS - daysLeft) / URGENT_WITHIN_DAYS);
}

export interface Scored {
  score: number;
  /** Each signal's contribution, for the check script and for explaining. */
  parts: Record<keyof typeof WEIGHTS, number>;
}

export function scoreRecipe(facts: RecipeFacts): Scored {
  const readiness = facts.total === 0 ? 0 : facts.have / facts.total;

  const worst = facts.rescues.reduce(
    (highest, rescue) => Math.max(highest, urgencyOf(rescue.daysLeft)),
    0,
  );
  const urgency =
    worst * Math.min(1, readiness / RESCUE_NEEDS_READINESS);

  /**
   * Liking it and returning to it, weighted towards the rating.
   *
   * times_cooked saturates at five: the difference between cooking something
   * once and six times says a lot, and the difference between twenty and
   * thirty says nothing except that it is old.
   */
  const affection =
    0.6 * (facts.rating === null ? 0 : facts.rating / 5) +
    0.4 * Math.min(facts.timesCooked, 5) / 5;

  const fatigue =
    facts.daysSinceCooked === null
      ? 0
      : clamp(1 - facts.daysSinceCooked / FATIGUE_FADES_AFTER_DAYS);

  // An untimed recipe makes no claim about being quick and gets nothing here,
  // rather than being treated as instant.
  const effort =
    facts.minutes === null ? 0 : 1 - Math.min(facts.minutes, LONG_RECIPE_MINUTES) / LONG_RECIPE_MINUTES;

  const parts = {
    readiness: readiness * WEIGHTS.readiness,
    urgency: urgency * WEIGHTS.urgency,
    affection: affection * WEIGHTS.affection,
    fatigue: fatigue * WEIGHTS.fatigue,
    effort: effort * WEIGHTS.effort,
  };

  return {
    score: Object.values(parts).reduce((sum, part) => sum + part, 0),
    parts,
  };
}

/** "2 days", "today", "yesterday" - how a deadline reads. */
function deadline(daysLeft: number): string {
  if (daysLeft < 0) return "already past";
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/**
 * Why this one, in words.
 *
 * A recommendation without a reason is a magic trick, and magic tricks are not
 * trusted twice. At most two clauses: the strongest positive reason, and the
 * stock position, which is the thing anybody checks next anyway.
 */
export function explain(facts: RecipeFacts): string {
  const clauses: string[] = [];

  const soonest = [...facts.rescues].sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (soonest) {
    clauses.push(`uses the ${soonest.name.toLowerCase()}, ${deadline(soonest.daysLeft)}`);
  }

  if (facts.total === 0) {
    clauses.push("no ingredients listed");
  } else if (facts.have === facts.total) {
    clauses.push("you have everything");
  } else if (facts.missing.length === 1) {
    clauses.push(`only missing ${facts.missing[0].toLowerCase()}`);
  } else {
    clauses.push(`${facts.have} of ${facts.total} in stock`);
  }

  // Said only when nothing more useful has been: "cooked 6 times" is a weak
  // argument next to a deadline, and two weak clauses read as padding.
  if (clauses.length === 1 && facts.timesCooked >= 3) {
    clauses.push(`cooked ${facts.timesCooked} times`);
  }

  return clauses.join(" · ");
}

/** Everything, best first, each knowing why. */
export function rankTonight(candidates: RecipeFacts[]): Suggestion[] {
  return candidates
    .map((facts) => ({
      ...facts,
      score: scoreRecipe(facts).score,
      reason: explain(facts),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * The best thing you are exactly one ingredient short of.
 *
 * Its own answer rather than a place in the ranking, because "one shop away"
 * is a different kind of suggestion from "cook this now" and burying it in a
 * list makes it look like a worse version of the winner. This is the shortfall
 * button finally earning its place: a dead end turned into a plan.
 *
 * Exactly one, not "few". Two missing things is a shopping trip, and the whole
 * appeal of this card is that it asks for a single item.
 */
export function nearlyThere(
  candidates: RecipeFacts[],
  exclude: number[] = [],
): Suggestion | null {
  const skip = new Set(exclude);
  const shortlist = candidates.filter(
    (facts) => !skip.has(facts.id) && facts.total > 0 && facts.total - facts.have === 1,
  );
  return rankTonight(shortlist)[0] ?? null;
}
