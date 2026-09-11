import { rankItems } from "./match";
import { totalOnHand } from "./containers";
import type { Tag } from "./tags";
import type { Item } from "./types";

/**
 * What else could stand in for an ingredient.
 *
 * Two signals, in order of how much they are worth trusting:
 *
 * 1. **Shared tags, weighted by how rare they are.** If a recipe wants dark soy
 *    sauce and the cupboard holds light soy sauce, they share "Soy sauces",
 *    which almost nothing else has - strong evidence. Sharing "Seasoning" with
 *    six other things is nearly none: chilli flakes and cinnamon sticks are
 *    both seasonings and are not substitutes for each other. A tag's worth is
 *    one over how many items carry it, which is the same idea as inverse
 *    document frequency and for the same reason.
 *    matchers use. It catches what tags miss, especially for things nobody has
 *    tagged yet.
 *
 * Deliberately only suggests things actually in stock. A substitution you do not
 * have is not a substitution, it is a shopping list - and there is already a
 * button for that.
 */

export interface Substitute {
  item: Item;
  /** Tags it has in common with what the recipe asked for. */
  shared: string[];
  /** 0 to 1, for ordering only - never shown as a percentage. */
  score: number;
}

/** Enough of a name match to be worth offering when tags say nothing. */
const NAME_FLOOR = 0.34;

/**
 * Tag evidence strong enough to suggest something on its own.
 *
 * A tag on two items clears it (0.5); one on three or more does not, and needs
 * the name to agree as well. Set where it is because a pantry filed only by
 * broad categories should offer almost nothing rather than offer rubbish.
 */
const TAG_FLOOR = 0.5;

export function rankSubstitutes(
  wantedName: string,
  /** The stock row the line resolves to, when it resolves at all. */
  wanted: Item | null,
  items: Item[],
  tagsByItem: Map<number, Tag[]>,
  /** How many items carry each tag, which is what makes a tag worth anything. */
  tagCounts: Map<number, number>,
  limit = 4,
): Substitute[] {
  const wantedTags = wanted ? (tagsByItem.get(wanted.id) ?? []) : [];
  const wantedTagIds = new Set(wantedTags.map((tag) => tag.id));

  const inStock = items.filter((item) => {
    if (wanted && item.id === wanted.id) return false;
    const level = totalOnHand(item);
    // Unspecified means "there is some", which is enough to cook with.
    return level === null || level > 0;
  });

  const byName = new Map(
    rankItems(wantedName, null, null, inStock).map(({ item, score }) => [item.id, score]),
  );

  return inStock
    .map((item) => {
      const tags = tagsByItem.get(item.id) ?? [];
      const shared = tags.filter((tag) => wantedTagIds.has(tag.id));

      /**
       * A shared tag is worth one over the number of things carrying it.
       *
       * "Soy sauces" on two items is worth 0.5; "Seasoning" on seven is worth
       * 0.14, which is about right - it says these are both things you shake
       * onto food, and nothing about whether one can replace the other.
       */
      const tagEvidence = shared.reduce(
        (sum, tag) => sum + 1 / Math.max(1, tagCounts.get(tag.id) ?? 1),
        0,
      );
      const nameScore = byName.get(item.id) ?? 0;

      return {
        item,
        shared: shared.map((tag) => tag.name),
        tagEvidence,
        nameScore,
        score: tagEvidence + nameScore,
      };
    })
    // Either the tags are specific enough to stand alone, or the name has to
    // agree. A broad tag on its own suggests nothing.
    .filter((entry) => entry.tagEvidence >= TAG_FLOOR || entry.nameScore >= NAME_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, shared, score }) => ({ item, shared, score }));

}
