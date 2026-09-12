import { rankItems, tokenise } from "./match";
import { estimateFor } from "./generic-nutrition";
import type { Dimension, Item } from "./types";

/**
 * Guessing the rest of a form from the one thing somebody typed.
 *
 * A kitchen is not a blank slate. By the time you are adding coriander you
 * already have parsley, and parsley already knows it is counted in grams, that
 * it lives in the fridge, that it is filed under Herbs and that you buy it at
 * Tesco. Asking all of that again is asking you to tell the app something it
 * could have worked out, which is the definition of friction.
 *
 * So: type a name, and the nearest thing you already own fills in the rest.
 * Nothing is ever overwritten - a suggestion only lands in a field you have
 * not touched - and the form says out loud where the answer came from, because
 * a form that fills itself in silently is a form you stop reading.
 *
 * Matching is lib/match.ts, the same scorer as everywhere else, so "chopped
 * tomatoes" finds "Tomatoes" and the vocabulary of one kitchen converges
 * instead of fragmenting.
 */

/**
 * The fields of an existing item that are worth copying onto a new one.
 *
 * Deliberately narrower than Item: this is handed to the browser on every add
 * screen, and a kitchen's full stock rows carry nutrition figures, expiry
 * dates and quantities that have no business being suggestions.
 */
export interface ItemProfile {
  id: number;
  name: string;
  canonical_unit: string;
  dimension: Dimension;
  location: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  shelf_life_days: number | null;
  tags: string[];
  shops: string[];
}

export interface Suggestion {
  unit?: string;
  location?: string;
  pack_size?: string;
  tags?: string[];
  shops?: string[];
  shelf_life_days?: string;
  /** What the guess was based on, for saying so on the form. */
  because: string | null;
}

/** Close enough to copy a whole shelf's worth of settings from. */
const COPY_FROM = 0.5;



/** Just enough of an Item for rankItems to score it. */
function asItem(profile: ItemProfile): Item {
  return {
    id: profile.id,
    name: profile.name,
    dimension: profile.dimension,
  } as Item;
}

/**
 * The row this name probably already is.
 *
 * A pantry that holds both "Tomatoes" and "Tomatos" is a pantry where every
 * recipe match, every rescue and every shopping list is quietly half right, so
 * this is worth catching at the only moment it is cheap to catch.
 */
export function probableDuplicate(
  name: string,
  profiles: ItemProfile[],
): ItemProfile | null {
  const wanted = tokenise(name);
  if (wanted.length === 0) return null;

  /**
   * The same words, not merely similar ones.
   *
   * A score threshold was tried first and was wrong, for the reason that keeps
   * coming up in this codebase: nameSimilarity gives one name wholly inside
   * another a floor of 0.8, so "Dark soy sauce" read as a duplicate of "Soy
   * sauce". It is not - it is a second bottle, and offering to merge them
   * would lose a distinction somebody made on purpose.
   *
   * Identical token sets still catch every case this is for, because
   * fragmentation happens through case, plurals and spelling rather than
   * through extra words: Tomatos, TOMATOES and Tomatoe all stem to the same
   * set as Tomatoes. A genuine typo that changes a letter is missed, which is
   * the right way round to be wrong.
   */
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((token) => b.includes(token));

  return (
    profiles.find((profile) => same(wanted, tokenise(profile.name))) ?? null
  );
}

/**
 * What to fill the rest of the form in with.
 *
 * Two sources, in order of how much they know. Something you already own knows
 * everything, including the things that are true of your kitchen rather than of
 * the food - where you keep it, where you buy it. The generic-food table knows
 * only what the food is, which is still enough to get the unit right, and that
 * is the field people get wrong most.
 */
export function suggestFor(name: string, profiles: ItemProfile[]): Suggestion {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { because: null };

  const [best] = rankItems(trimmed, null, null, profiles.map(asItem));
  const near =
    best && best.score >= COPY_FROM
      ? profiles.find((profile) => profile.id === best.item.id)
      : undefined;

  if (near) {
    return {
      unit: near.canonical_unit,
      location: near.location ?? undefined,
      pack_size: near.pack_size !== null ? String(near.pack_size) : undefined,
      tags: near.tags.length > 0 ? near.tags : undefined,
      shops: near.shops.length > 0 ? near.shops : undefined,
      shelf_life_days:
        near.shelf_life_days !== null ? String(near.shelf_life_days) : undefined,
      because: `like your ${near.name}`,
    };
  }

  /**
   * Nothing like it on the shelf, so fall back to what the food is.
   *
   * The generics table carries a typical weight for things that are counted -
   * that is what it uses to turn "2 eggs" into grams - so its presence is also
   * the answer to "is this a thing you count or a thing you weigh", which is
   * the single most commonly wrong field on this form.
   */
  const generic = estimateFor(trimmed);
  if (!generic) return { because: null };

  return {
    unit: generic.unitGrams ? "count" : "g",
    because: `usually ${generic.label}`,
  };
}
