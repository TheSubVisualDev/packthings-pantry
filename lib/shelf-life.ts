import { estimateFor } from "./generic-nutrition";

/**
 * How long food lasts, when nobody has written a date on it.
 *
 * The best idea in this app - what is about to go off, and what to cook to
 * rescue it - was running on a quarter of the shelf. Thirty-four of
 * forty-seven items had neither a date on the packet nor a once-opened life,
 * so the heaviest weight in the tonight ranker, the whole rescue idea and the
 * Sunday nudge were blind to most of the kitchen. Not because the feature was
 * wrong, but because typing a date per item is a chore nobody does twice.
 *
 * So: a guess, clearly marked as one. The same bargain the nutrition
 * estimates struck and for the same reason - an approximate number that is
 * there beats an exact one that is not, as long as nothing can mistake it for
 * a measurement. `items.expiry_estimated` is that marking, and it is the
 * feature rather than a caveat on it.
 *
 * **Two numbers, not one, and the schema is emphatic that they differ.**
 * `keeps` is how long a sealed one lasts from the day it is bought. `openFor`
 * is how long it has once opened, which is when the date on the packet stops
 * being the answer. A jar of mustard keeps two years and three months; both
 * are true of the same jar.
 *
 * **Where it is kept is assumed rather than asked.** These are the numbers for
 * the place the food normally lives - milk in a fridge, flour in a cupboard.
 * The app does know `location`, but a guess about storage stacked on a guess
 * about the food is two guesses deep, and the honest range is wide enough
 * already. Anybody who freezes their bread can say so by typing a date.
 *
 * What a food IS comes from `estimateFor` in generic-nutrition rather than
 * from a second list of words here. One matcher, one idea of what "chopped
 * tomatoes" means - a second copy of that matching is the bug this codebase
 * keeps a running count of.
 *
 * The numbers are ordinary UK domestic guidance, rounded to something a person
 * would actually say, and sitting at the cautious end wherever being wrong
 * would matter. They are not food safety advice, and nothing in the app ever
 * says "throw this away" on the strength of one.
 */

export interface ShelfLife {
  /** Days a sealed one keeps from today. Null when it effectively never goes. */
  keeps: number | null;
  /** Days it keeps after opening. Null when opening changes nothing. */
  openFor: number | null;
}

/**
 * Keyed by the generic's `label`, so this file says nothing about how a name
 * is matched and only how long the food lasts.
 */
const LIVES: Record<string, ShelfLife> = {
  // Fresh vegetables. The real range is enormous; these are the middle of it.
  carrots: { keeps: 21, openFor: null },
  onion: { keeps: 30, openFor: 7 },
  "spring onion": { keeps: 7, openFor: null },
  garlic: { keeps: 60, openFor: null },
  potato: { keeps: 21, openFor: null },
  "sweet potato": { keeps: 21, openFor: null },
  tomato: { keeps: 7, openFor: null },
  pepper: { keeps: 10, openFor: 3 },
  chilli: { keeps: 14, openFor: null },
  mushroom: { keeps: 7, openFor: null },
  courgette: { keeps: 7, openFor: 3 },
  aubergine: { keeps: 7, openFor: 3 },
  broccoli: { keeps: 7, openFor: null },
  cauliflower: { keeps: 7, openFor: null },
  cabbage: { keeps: 30, openFor: 7 },
  kale: { keeps: 5, openFor: null },
  spinach: { keeps: 5, openFor: null },
  lettuce: { keeps: 7, openFor: 3 },
  cucumber: { keeps: 7, openFor: 3 },
  celery: { keeps: 14, openFor: null },
  leek: { keeps: 10, openFor: null },
  // Frozen, which is how peas live in nearly every kitchen.
  peas: { keeps: 180, openFor: null },
  "green beans": { keeps: 7, openFor: null },
  sweetcorn: { keeps: 5, openFor: 3 },
  squash: { keeps: 60, openFor: 5 },
  ginger: { keeps: 21, openFor: null },

  apple: { keeps: 21, openFor: null },
  banana: { keeps: 6, openFor: null },
  lemon: { keeps: 21, openFor: 5 },
  lime: { keeps: 21, openFor: 5 },
  orange: { keeps: 21, openFor: null },

  // Dairy, where opening is the number that matters.
  "whole milk": { keeps: 7, openFor: 4 },
  "semi-skimmed milk": { keeps: 7, openFor: 4 },
  milk: { keeps: 7, openFor: 4 },
  // Long-life sealed, then the same few days as any milk once open.
  "almond milk": { keeps: 120, openFor: 5 },
  "oat milk": { keeps: 120, openFor: 5 },
  "soya milk": { keeps: 120, openFor: 5 },
  butter: { keeps: 45, openFor: 21 },
  cheddar: { keeps: 30, openFor: 21 },
  "double cream": { keeps: 10, openFor: 3 },
  yoghurt: { keeps: 14, openFor: 4 },
  eggs: { keeps: 21, openFor: null },

  // Cupboard staples. Sealed, most of these outlast the interest in them.
  "plain flour": { keeps: 240, openFor: 120 },
  rice: { keeps: 540, openFor: 365 },
  pasta: { keeps: 540, openFor: 365 },
  noodles: { keeps: 365, openFor: 180 },
  bread: { keeps: 5, openFor: 4 },
  oats: { keeps: 300, openFor: 120 },
  couscous: { keeps: 365, openFor: 180 },
  lentils: { keeps: 540, openFor: 365 },
  // Tins: years on the shelf, days in the fridge once opened.
  chickpeas: { keeps: 730, openFor: 3 },
  "kidney beans": { keeps: 730, openFor: 3 },
  "baked beans": { keeps: 730, openFor: 3 },

  // Fresh meat and fish - the one group where being wrong matters, so these
  // sit at the cautious end of the usual advice.
  "chicken breast": { keeps: 3, openFor: 2 },
  "beef mince": { keeps: 3, openFor: 2 },
  pork: { keeps: 3, openFor: 2 },
  bacon: { keeps: 10, openFor: 5 },
  salmon: { keeps: 3, openFor: 2 },
  tuna: { keeps: 730, openFor: 2 },
  tofu: { keeps: 21, openFor: 3 },

  // Dried herbs and spices do not spoil, they fade. `keeps` is when they stop
  // being worth using rather than when they become unsafe.
  cinnamon: { keeps: 730, openFor: 365 },
  cumin: { keeps: 730, openFor: 365 },
  oregano: { keeps: 540, openFor: 365 },
  paprika: { keeps: 730, openFor: 365 },
  turmeric: { keeps: 730, openFor: 365 },
  "black pepper": { keeps: 1095, openFor: 730 },
  "chilli powder": { keeps: 730, openFor: 365 },
  "garlic powder": { keeps: 730, openFor: 365 },
  "ground ginger": { keeps: 730, openFor: 365 },
  // Fresh, which is how coriander is bought; the dried jar is "mixed herbs".
  coriander: { keeps: 7, openFor: null },
  "mixed herbs": { keeps: 540, openFor: 365 },
  "bay leaves": { keeps: 730, openFor: 365 },

  // Jars and bottles. Nearly all "ages sealed, months once open".
  gochujang: { keeps: 730, openFor: 365 },
  miso: { keeps: 730, openFor: 365 },
  "tomato puree": { keeps: 540, openFor: 14 },
  mustard: { keeps: 730, openFor: 90 },
  ketchup: { keeps: 540, openFor: 90 },
  "stock cube": { keeps: 730, openFor: 365 },
  "olive oil": { keeps: 540, openFor: 180 },
  oil: { keeps: 540, openFor: 180 },
  "chopped tomatoes": { keeps: 730, openFor: 3 },
  "coconut milk": { keeps: 730, openFor: 4 },
  "soy sauce": { keeps: 1095, openFor: 365 },
  "peanut butter": { keeps: 365, openFor: 90 },

  // Things that genuinely do not go off in a kitchen. Listed rather than
  // omitted, so that "we have no opinion" and "it does not expire" are
  // different answers - see shelfLifeFor.
  vinegar: { keeps: null, openFor: null },
  sugar: { keeps: null, openFor: null },
  honey: { keeps: null, openFor: null },
  salt: { keeps: null, openFor: null },
};

export interface ShelfLifeGuess extends ShelfLife {
  /** Which food it was taken to be, so the screen can say which guess it used. */
  label: string;
}

/**
 * What this name is probably made of, and how long that lasts.
 *
 * Null when the food is not recognised, which is the right answer far more
 * often than a middling default would be. "About a fortnight" applied to
 * something the app has never heard of is a number with no reasoning behind
 * it, and those are worse than a blank - a blank invites a correction, and a
 * confident wrong number does not.
 */
export function shelfLifeFor(name: string): ShelfLifeGuess | null {
  const generic = estimateFor(name);
  if (!generic) return null;

  const life = LIVES[generic.label];
  if (!life) return null;

  // Recognised, and the answer is "it does not go off": salt, sugar, vinegar,
  // honey. Nothing to write down, and writing down a date anyway would leave
  // somebody wondering in a year why their salt is flagged.
  if (life.keeps === null && life.openFor === null) return null;

  return { ...life, label: generic.label };
}

/**
 * 'YYYY-MM-DD' this many days from a given day.
 *
 * Built from the local calendar date rather than by adding milliseconds to an
 * instant: adding 86400000 twice across the night the clocks go forward lands
 * an hour early and, near midnight, a day early. The planner learned this the
 * expensive way - see the note in lib/plan.ts about fromIso pinning to noon.
 */
export function dateInDays(days: number, from: Date = new Date()): string {
  const target = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  target.setDate(target.getDate() + days);
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${month}-${day}`;
}
