import type { Dimension, Item } from "./types";
import { dimensionOf } from "./units";

/**
 * Matching a scanned product against what's already in the pantry.
 *
 * The point is that Lidl spaghetti, Tesco spaghetti and Napolina spaghetti are
 * all just spaghetti as far as a kitchen is concerned. Barcodes differ per
 * product; the pantry row shouldn't have to. This scores the catalogue name
 * against existing item names so the scanner can propose the row it probably
 * belongs on - it still asks, because own-brand linguine sometimes genuinely
 * deserves its own line.
 */

/** Preselect the suggestion at or above this. */
export const STRONG_MATCH = 0.6;

/** Worth showing, not worth assuming. */
export const WEAK_MATCH = 0.34;

/**
 * Supermarket range and marketing words. They appear in catalogue names and
 * never in the name a person gives a pantry row, so they only ever dilute the
 * comparison. Deliberately short: anything genuinely distinguishing, like
 * "wholemeal" or "smoked", has to survive.
 */
const NOISE = new Set([
  "the", "a", "of", "and", "with", "in", "by",
  "finest", "everyday", "essential", "essentials", "value", "basics",
  "brand", "pack", "multipack", "original",
]);

/**
 * Strips a plural so "Onions" and "Onion" meet in the middle.
 *
 * The -es cases are here because stripping only the s left "tomatoes" as
 * "tomatoe", which meets "tomato" nowhere - so a recipe calling for tomatoes
 * scored zero against a pantry row called "Plum tomatoes". Restricted to the
 * endings where -es is genuinely the plural (-oes, -ses, -xes, -zes, -ches,
 * -shes); a blanket -es would turn "cheese" into "chee".
 */
function stem(token: string): string {
  if (token.length > 4 && /(?:o|s|x|z|ch|sh)es$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Breaks a name into comparable tokens: no punctuation, no pack sizes, no
 * brand, no marketing. "Tesco Spaghetti 500g" and "Spaghetti" both come out
 * as {spaghetti}.
 */
export function tokenise(name: string, brand?: string | null): string[] {
  const brandTokens = new Set(
    (brand ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(stem),
  );

  return name
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .map((token) => token.replace(/\.$/, ""))
    .filter(Boolean)
    .filter((token) => !/^[\d.]+$/.test(token)) // bare pack counts: "6"
    .filter((token) => !/^[\d.]+[a-z]+$/.test(token)) // pack sizes: "500g", "1l"
    .map(stem)
    // Two letters or fewer carries no signal and mostly means packaging
    // scraps: the "No." in "Napolina Spaghetti No. 5" is not a distinguishing
    // feature of the spaghetti.
    .filter((token) => token.length > 2 && !NOISE.has(token) && !brandTokens.has(token));
}

/**
 * Dice coefficient over the two token sets, with a floor for one name wholly
 * containing the other - "spaghetti" inside "wholewheat spaghetti" is a better
 * match than the raw overlap suggests.
 *
 * Exported because lib/pantry-match.ts scores recipe lines against stock and
 * must not grow a second opinion about what two names being the same thing
 * means. It caches its own tokens across lines, which is why it wants the
 * scorer rather than rankItems.
 */
export function nameSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;

  const dice = (2 * shared) / (setA.size + setB.size);

  const contained =
    (shared === setA.size || shared === setB.size) && shared > 0 ? 0.8 : 0;

  return Math.max(dice, contained);
}

export interface Candidate {
  item: Item;
  score: number;
}

/**
 * Existing items ranked against a scanned product, best first.
 *
 * A pack size in a different dimension than the item is a mild penalty, not a
 * halving. A loaf counted as one and sold as 800g is still that loaf, and
 * onions kept as a count are still onions in a 1kg bag - the words are right
 * and only the measure differs. It's enough to break a tie, not to overrule a
 * clear name match.
 */
export function rankItems(
  productName: string | null,
  brand: string | null,
  packUnit: string | null,
  items: Item[],
): Candidate[] {
  if (!productName) return [];

  const product = tokenise(productName, brand);
  if (product.length === 0) return [];

  const packDimension: Dimension | null = packUnit ? dimensionOf(packUnit) : null;

  return items
    .map((item) => {
      let score = nameSimilarity(product, tokenise(item.name));
      if (packDimension && packDimension !== item.dimension) score *= 0.75;
      return { item, score };
    })
    .filter((candidate) => candidate.score >= WEAK_MATCH)
    .sort((a, b) => b.score - a.score);
}

/**
 * The catalogue name with brand and pack size taken off, for prefilling a new
 * item. "Tesco Spaghetti 500g" becomes "Spaghetti" - a pantry row is the thing,
 * not the packet it came in. Falls back to the original if stripping empties
 * it, which happens with products named only for their brand.
 */
export function cleanProductName(
  name: string | null,
  brand: string | null,
): string {
  if (!name) return "";

  const tokens = tokenise(name, brand);
  if (tokens.length === 0) return name.trim();

  // Rebuilt from the original words, not the stemmed ones, so "Tomatoes"
  // doesn't come back as "Tomatoe".
  const keep = new Set(tokens);
  const words = name
    .split(/\s+/)
    .filter((word) => {
      const normalised = stem(word.toLowerCase().replace(/[^a-z0-9]/g, ""));
      return keep.has(normalised);
    });

  // Catalogue entries shout: "PESTO alla GENOVESE". Words in full caps are
  // brought back down so the field doesn't need retyping, at the cost of
  // flattening the occasional real acronym.
  const rebuilt = words
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word.toLowerCase() : word))
    .join(" ")
    .trim();

  if (!rebuilt) return name.trim();

  return rebuilt.charAt(0).toUpperCase() + rebuilt.slice(1);
}
