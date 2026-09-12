import { STRONG_MATCH, WEAK_MATCH, nameSimilarity, tokenise } from "./match";
import { inStock } from "./containers";
import { estimateFor } from "./generic-nutrition";
import { dimensionOf } from "./units";
import type { Item } from "./types";

/**
 * The one answer to "does this recipe line mean something on my shelf".
 *
 * Four places used to decide this independently and all four decided it the
 * same naive way - `a.toLowerCase() === b.toLowerCase()`:
 * `getStockedItemNames`, `parseRecipeDocument`, `cookRecipe`, and whatever the
 * shortfall path inherited. They agreed only by being equally wrong. A recipe
 * calling for "firm tofu" read as unstocked against a pantry row called
 * "Tofu", so the suggestion ranked below recipes that could not be made, the
 * rescue never fired, and cooking flagged the line as missing.
 *
 * lib/match.ts already had a scorer tuned against real supermarket names, and
 * it was wired to the barcode scanner and nothing else. This puts every caller
 * on it - the same rule written once, for the same reason ADJUST_SQL and
 * applyDelta are checked against each other.
 *
 * The bias throughout is the receipt parser's: miss one rather than invent
 * one. Anything short of confident comes back as a suggestion for a human,
 * never as a silent decision - spending the wrong jar is worse than asking.
 */

/**
 * How sure we are, which is a different question from how well it scored.
 *
 * - `exact`   the names are the same word for word. Nothing to think about.
 * - `likely`  clearly the same thing. Safe to act on without asking.
 * - `maybe`   worth offering, never worth assuming. Needs a human.
 * - `none`    the pantry has never heard of this, which is a normal state for
 *             a recipe and not an error.
 */
export type Confidence = "exact" | "likely" | "maybe" | "none";

export interface Resolution {
  /** The row it means, or null at `none`. */
  item: Item | null;
  confidence: Confidence;
  /** The raw score behind the confidence. For ordering and tests, never shown. */
  score: number;
  /**
   * Other rows worth offering, best first, excluding `item`.
   *
   * This is what a substitution picker wants: when the match is a `maybe`, the
   * runners-up are frequently the right answer.
   */
  alternatives: Item[];
}

/** Confident enough to act on without asking. */
export function isConfident(resolution: Resolution): boolean {
  return resolution.confidence === "exact" || resolution.confidence === "likely";
}

/**
 * How close two candidates have to be before a clear winner stops being clear.
 *
 * "Chicken stock" against a pantry holding both "Chicken stock cubes" and
 * "Chicken stock pots" scores the two within a whisker of each other, and
 * picking whichever sorted first would be a coin toss dressed as an answer.
 * Inside this margin the match is demoted to `maybe` and a human decides.
 */
const AMBIGUOUS_MARGIN = 0.05;

/**
 * What a bare token overlap costs when the head noun is not among the tokens
 * shared.
 *
 * English puts the head noun last, which lib/generic-nutrition.ts already
 * relies on ("Rice vinegar" is a vinegar, not a rice). So a recipe line whose
 * last word is missing from a pantry row is describing a *different thing that
 * mentions the same word*, not a variant of it: milk chocolate is not milk,
 * and tomato puree is not a plum tomato. Raw overlap scores both of those at
 * two thirds, comfortably inside the act-without-asking band.
 *
 * A penalty rather than a veto, because the head noun is a rule of thumb and
 * not a grammar - it should be able to lose to an otherwise overwhelming match.
 */
const HEAD_NOUN_PENALTY = 0.6;

/**
 * Whether two names are known to be different foods.
 *
 * Name similarity alone cannot know that peanut butter is not butter: the
 * words say it is a kind of butter and only the world says otherwise. The
 * generic-food lexicon does know, because it was built for nutrition estimates
 * and matches the longest phrase first - "peanut butter" beats "butter",
 * "tomato puree" beats "tomato". Two names landing on different generics is
 * therefore real evidence they are different things.
 *
 * Only ever demotes a match to `maybe`, never rules one out, because the
 * lexicon is partial: most of the pantry resolves to nothing here and silence
 * has to mean silence rather than disagreement.
 */
function knownDifferentFoods(a: string, b: string): boolean {
  const genericA = estimateFor(a);
  const genericB = estimateFor(b);
  if (!genericA || !genericB) return false;
  return genericA.label !== genericB.label;
}

/**
 * Stock with its tokens worked out once.
 *
 * Resolving forty recipe lines against sixty pantry rows re-tokenises every
 * name forty times otherwise, and tokenise is the expensive half. Build it
 * once per page, hand it to every line.
 */
export interface StockIndex {
  items: Item[];
  tokens: Map<number, string[]>;
  /** Lowercased name to row, for the exact case, which is still most of them. */
  byName: Map<string, Item>;
}

export function indexStock(items: Item[]): StockIndex {
  return {
    items,
    tokens: new Map(items.map((item) => [item.id, tokenise(item.name)])),
    byName: new Map(items.map((item) => [item.name.toLowerCase(), item])),
  };
}

/**
 * What a recipe line means, against this kitchen.
 *
 * `unit` is optional and only ever breaks ties: a line measured in millilitres
 * matching a row counted in units is mildly less likely to be the same thing,
 * which is enough to separate "Milk" from "Milk chocolate" and not enough to
 * overrule a clear name match. Same 0.75 as rankItems, for the same reason.
 */
export function resolveLine(
  name: string,
  stock: StockIndex,
  unit?: string | null,
): Resolution {
  const empty: Resolution = { item: null, confidence: "none", score: 0, alternatives: [] };
  if (!name.trim()) return empty;

  const exact = stock.byName.get(name.trim().toLowerCase());
  if (exact) return { item: exact, confidence: "exact", score: 1, alternatives: [] };

  const wanted = tokenise(name);
  if (wanted.length === 0) return empty;

  const lineDimension = unit ? dimensionOf(unit) : null;
  const head = wanted[wanted.length - 1];

  const ranked = stock.items
    .map((item) => {
      const tokens = stock.tokens.get(item.id) ?? tokenise(item.name);
      let score = nameSimilarity(wanted, tokens);
      if (!tokens.includes(head)) score *= HEAD_NOUN_PENALTY;
      if (lineDimension && lineDimension !== item.dimension) score *= 0.75;
      return { item, score };
    })
    .filter((candidate) => candidate.score >= WEAK_MATCH)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // A row with something in it beats an identical-scoring empty one. Both
      // are the same ingredient; only one of them is dinner.
      return Number(inStock(b.item)) - Number(inStock(a.item));
    });

  if (ranked.length === 0) return empty;

  const [best, runnerUp] = ranked;
  const ambiguous =
    runnerUp !== undefined && best.score - runnerUp.score < AMBIGUOUS_MARGIN;
  const contradicted = knownDifferentFoods(name, best.item.name);

  const confidence: Confidence =
    best.score >= STRONG_MATCH && !ambiguous && !contradicted ? "likely" : "maybe";

  return {
    item: best.item,
    confidence,
    score: best.score,
    alternatives: ranked.slice(1).map((candidate) => candidate.item),
  };
}

/**
 * Whether a recipe line is something you could cook with tonight.
 *
 * Resolution is about identity and this is about availability, and they are
 * genuinely different questions - a line resolving to a row with nothing left
 * in it is matched and unstocked, which is exactly what the shortfall list is
 * made of.
 *
 * `inStock` rather than `quantity > 0`, because quantity has meant "what is in
 * the OPEN container" since containers arrived. Three sealed tins read as none
 * otherwise, which is the bug AGENTS.md already lists three instances of.
 */
export function isStocked(resolution: Resolution): boolean {
  return (
    resolution.item !== null && isConfident(resolution) && inStock(resolution.item)
  );
}

/**
 * Resolves a whole recipe's worth of lines in one pass.
 *
 * Keyed by the name as written rather than by index, because every caller
 * holds the names and only some of them hold positions.
 */
export function resolveLines(
  names: readonly string[],
  stock: StockIndex,
): Map<string, Resolution> {
  const resolved = new Map<string, Resolution>();
  for (const name of names) {
    if (!resolved.has(name)) resolved.set(name, resolveLine(name, stock));
  }
  return resolved;
}

/**
 * How many of a recipe's lines this kitchen can already supply.
 *
 * The number behind "7 of 8" on every recipe card, and the readiness term in
 * the Tonight ranking.
 */
export function countStocked(
  names: readonly string[],
  stock: StockIndex,
): { have: number; total: number } {
  const resolved = resolveLines(names, stock);
  let have = 0;
  for (const name of names) {
    if (isStocked(resolved.get(name)!)) have += 1;
  }
  return { have, total: names.length };
}
