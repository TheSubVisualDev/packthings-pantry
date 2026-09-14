/**
 * Text a recipe carries that was written for one purpose and is read for
 * another - normalised at display time only. The stored value never changes;
 * these run again on every render, the same as `sayAmount` and friends in
 * `lib/units.ts` do for quantities.
 */

/**
 * Ingredient names are stored plural on purpose - the stock list needs "Brown
 * Onions" to say what's on the shelf whether there's one or five. A recipe
 * line for exactly one of a count-unit ingredient printed that string
 * unchanged reads as "1 Brown Onions", which nobody would say out loud.
 *
 * Scoped tight: only a bare `count` unit at exactly quantity 1. Tins, packs
 * and jars already say "tin"/"pack"/"jar" for their own plural and leave the
 * product name alone, and mass or volume never pluralise a name to begin
 * with.
 */
export function displayItemName(
  name: string,
  quantity: number | null,
  unit: string,
): string {
  if (unit !== "count" || quantity !== 1) return name;
  return singularizeLastWord(name);
}

/**
 * Singularises only the last word of a name - "Frozen Peas" -> "Frozen Pea",
 * never touching "Frozen".
 *
 * English plurals are irregular enough that this only takes the three
 * endings that are unambiguous in a kitchen: -ies, the -oes/-es that follows
 * o/s/x/z/ch/sh, and a plain trailing -s. Anything else - a name that's
 * already singular, an uncountable like "Hummus", an irregular plural like
 * "Chillies" that doesn't actually stem to "Chilli" this way - is left typed
 * exactly as stored. A wrong singular is worse than a plural, which is also
 * why this never touches anything but a quantity-1 count line.
 */
function singularizeLastWord(name: string): string {
  // [\s\S] rather than the s flag, which needs an es2018 target.
  const split = name.match(/^([\s\S]*?)(\S+)$/);
  if (!split) return name;
  const [, head, lastWord] = split;
  return `${head}${singularizeWord(lastWord)}`;
}

function singularizeWord(word: string): string {
  // Trailing punctuation ("seeds," "nuts/seeds") has to come back on
  // afterwards rather than defeat the endswith checks below.
  const trail = word.match(/[^a-zA-Z]*$/)?.[0] ?? "";
  const core = trail ? word.slice(0, word.length - trail.length) : word;
  const lower = core.toLowerCase();

  if (lower.length > 4 && lower.endsWith("ies")) {
    // The replacement "y" has to match the case of the letters it's
    // replacing, or "CRANBERRIES" comes back "CRANBERRy".
    const shouting = core[core.length - 1] === core[core.length - 1].toUpperCase();
    return `${core.slice(0, -3)}${shouting ? "Y" : "y"}${trail}`;
  }
  if (lower.length > 4 && /(?:o|s|x|z|ch|sh)es$/.test(lower)) {
    return `${core.slice(0, -2)}${trail}`;
  }
  /**
   * A plain trailing -s, but not where the s was never a plural.
   *
   * "Hummus" came back "Hummu". A word ending -us, -is or -ss is singular
   * already and stripping the s invents a word: hummus, couscous, asparagus,
   * molasses, watercress. There is no rule that separates those from a real
   * plural, so the ending is simply left alone - "1 Hummus" reads fine and
   * "1 Hummu" does not, and this whole function exists on the principle that
   * a wrong singular is worse than a plural.
   */
  if (
    lower.length > 3 &&
    lower.endsWith("s") &&
    !/(?:ss|us|is)$/.test(lower)
  ) {
    return `${core.slice(0, -1)}${trail}`;
  }
  return word;
}

/**
 * Short words that are their letters, not a word to title-case - an
 * abbreviation would come back "Bbq" or "Diy" otherwise. Deliberately short:
 * every entry here is one a title-cased version would visibly mangle, not a
 * general acronym dictionary.
 */
const KEEP_UPPER = new Set(["BBQ", "DIY", "BLT", "TV", "UK", "US", "USA"]);

/**
 * Roman numerals a title might carry - "Part II", "World War II" - listed
 * rather than matched by character set, because a character-set match on
 * I/V/X/L/C/D/M also matches ordinary words like "MIX" and "CIVIL".
 */
const ROMAN_NUMERALS = new Set(
  ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"],
);

/**
 * Whether a title reads as shouted rather than deliberately cased.
 *
 * Almost every letter uppercase, not literally every letter: a straight
 * equality check would refuse to normalise a title that survived a paste with
 * one stray lowercase character, and that's exactly the kind of title this
 * exists for. A genuinely mixed-case title - normal sentence or title case
 * with the odd capital - sits far below the threshold and is left alone.
 */
function isShoutedTitle(title: string): boolean {
  const letters = title.match(/[A-Za-z]/g);
  if (!letters || letters.length < 2) return false;
  const upper = letters.filter((ch) => ch === ch.toUpperCase()).length;
  return upper / letters.length >= 0.9;
}

/**
 * "CRANBERRY & PUMPKIN SEED FLAPJACKS" -> "Cranberry & Pumpkin Seed
 * Flapjacks" - an importer's all-caps title, read the way a person would
 * type it, wherever the recipe's name is printed.
 *
 * Only touches a title `isShoutedTitle` calls essentially all upper case;
 * a deliberate acronym title or genuine mixed case comes back unchanged.
 * "&" and anything with no letters at all (numbers, punctuation) passes
 * through untouched on its own, since there's no case for it to have.
 */
export function displayTitle(title: string): string {
  if (!isShoutedTitle(title)) return title;

  return title
    .split(/(\s+)/)
    .map((token) => (/^\s+$/.test(token) ? token : titleCaseWord(token)))
    .join("");
}

function titleCaseWord(word: string): string {
  const bare = word.replace(/[^A-Za-z]/g, "");
  if (!bare) return word;

  const upperBare = bare.toUpperCase();
  if (KEEP_UPPER.has(upperBare) || ROMAN_NUMERALS.has(upperBare)) {
    return word.toUpperCase();
  }

  let seenLetter = false;
  return word.replace(/[A-Za-z]/g, (letter) => {
    if (seenLetter) return letter.toLowerCase();
    seenLetter = true;
    return letter.toUpperCase();
  });
}
