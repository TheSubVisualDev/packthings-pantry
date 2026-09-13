import { RECIPE_UNITS, UNMEASURED } from "./units";

/**
 * Reading a recipe the way it was written down, rather than the way a
 * database wants it.
 *
 * The paste box already existed and already only took JSON, which means it
 * only worked if you had first persuaded a chat to write some. A tester asked
 * for the obvious thing instead: paste the wall of text off a website or out
 * of a message, and have the app pick it apart.
 *
 * Everything here is a guess, and the guesses are ranked by how bad it is to
 * get them wrong. A missed note is nothing - it sits in the editor waiting to
 * be typed. A wrong quantity is the expensive one, because it looks right and
 * gets cooked, so anything this file cannot read confidently it refuses to
 * invent: the amount comes back unmeasured with the original words kept in the
 * note, which is visibly incomplete rather than quietly wrong.
 *
 * It produces a document for parseRecipeDocument rather than writing anything
 * itself. There is still exactly one definition of what a valid recipe is.
 */

/** What the reader made of a paste, including what it had to guess at. */
export interface ReadResult {
  /** Ready for parseRecipeDocument. Never written directly. */
  document: Record<string, unknown>;
  /**
   * Things it did that the human should know about: a unit converted, a
   * serving count assumed. Not errors - decisions.
   */
  notes: string[];
  /** Lines it could not place anywhere. Shown so nothing vanishes silently. */
  unread: string[];
}

/* -------------------------------------------------------------------------
   Units
   ------------------------------------------------------------------------- */

/**
 * How a person writes a unit, against what this pantry calls it.
 *
 * Longest first when matching, so "tablespoon" is not read as "tbsp" plus
 * junk, and so "fl oz" beats "oz".
 */
const UNIT_WORDS: [RegExp, string][] = [
  [/^(kilograms?|kilos?|kgs?)\b/, "kg"],
  [/^(grams?|grammes?|gms?|g)\b/, "g"],
  [/^(millilitres?|milliliters?|mls?)\b/, "ml"],
  [/^(litres?|liters?|ltrs?|l)\b/, "l"],
  [/^(tablespoons?|tbsps?|tbs|tblsp)\b/, "tbsp"],
  [/^(teaspoons?|tsps?)\b/, "tsp"],
  [/^(tins?|cans?)\b/, "tin"],
  [/^(packets?|packs?|pkts?|bags?|boxes|box)\b/, "pack"],
  [/^(jars?|pots?|tubs?)\b/, "jar"],
];

/**
 * Units this pantry does not keep, and what they come to in one it does.
 *
 * Converted rather than refused, and every conversion is reported. A recipe
 * off an American site is still a recipe, and rejecting it over the word "cup"
 * teaches the person pasting it that the feature does not work. A cup is a
 * volume and is treated as one - 240ml, the US legal cup - which is right for
 * liquid and approximately right for everything else, the same approximation
 * the original recipe was already making.
 */
const FOREIGN_UNITS: [RegExp, string, number, string][] = [
  // [pattern, how to say it, multiplier, unit it becomes]
  [/^(fl\.?\s?oz|fluid ounces?)\b/, "fl oz", 28.4, "ml"],
  [/^(ounces?|ozs?)\b/, "oz", 28.35, "g"],
  [/^(pounds?|lbs?)\b/, "lb", 453.6, "g"],
  [/^(cups?)\b/, "cup", 240, "ml"],
  [/^(pints?|pts?)\b/, "pint", 568, "ml"],
  [/^(quarts?|qts?)\b/, "quart", 1137, "ml"],
  [/^(sticks?) (of )?butter\b/, "stick of butter", 113, "g"],
];

/* -------------------------------------------------------------------------
   Numbers
   ------------------------------------------------------------------------- */

const VULGAR: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅙": 1 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/**
 * A written number at the start of a string: "2", "1.5", "1/2", "1 1/2", "½",
 * "2-3", "a couple of".
 *
 * A range collapses to its first number rather than its middle: "2-3 cloves"
 * means two will do, and a recipe that quietly asked for 2.5 cloves would be
 * the app inventing a precision the writer deliberately avoided. It comes back
 * flagged approximate, which is exactly what a range is.
 */
function readNumber(text: string): {
  value: number;
  rest: string;
  approx: boolean;
} | null {
  let rest = text.trimStart();

  // "a couple of onions", "a few sprigs". Words, not numbers, and always loose.
  const words: [RegExp, number][] = [
    [/^(a couple(\s+of)?)\s+/i, 2],
    [/^(a pair(\s+of)?)\s+/i, 2],
    [/^(half\s+a\s+)/i, 0.5],
  ];
  for (const [pattern, value] of words) {
    const found = rest.match(pattern);
    if (found) return { value, rest: rest.slice(found[0].length), approx: true };
  }

  // "1 1/2" and "1½" - a whole number followed by a fraction.
  const mixed = rest.match(/^(\d+)\s*(\d+)\s*\/\s*(\d+)\b/);
  if (mixed) {
    const bottom = Number(mixed[3]);
    if (bottom > 0) {
      return {
        value: Number(mixed[1]) + Number(mixed[2]) / bottom,
        rest: rest.slice(mixed[0].length),
        approx: false,
      };
    }
  }
  const mixedVulgar = rest.match(/^(\d+)\s*([½⅓⅔¼¾⅕⅙⅛⅜⅝⅞])/);
  if (mixedVulgar) {
    return {
      value: Number(mixedVulgar[1]) + VULGAR[mixedVulgar[2]],
      rest: rest.slice(mixedVulgar[0].length),
      approx: false,
    };
  }

  // A bare fraction.
  const fraction = rest.match(/^(\d+)\s*\/\s*(\d+)\b/);
  if (fraction) {
    const bottom = Number(fraction[2]);
    if (bottom > 0) {
      return {
        value: Number(fraction[1]) / bottom,
        rest: rest.slice(fraction[0].length),
        approx: false,
      };
    }
  }
  const vulgar = rest.match(/^([½⅓⅔¼¾⅕⅙⅛⅜⅝⅞])/);
  if (vulgar) {
    return {
      value: VULGAR[vulgar[1]],
      rest: rest.slice(vulgar[0].length),
      approx: false,
    };
  }

  // A tilde the person typed themselves, which says the rest for us.
  let approx = false;
  if (rest.startsWith("~") || rest.startsWith("≈") || /^about\s+/i.test(rest)) {
    approx = true;
    rest = rest.replace(/^(~|≈|about\s+)/i, "");
  }

  // A plain number, possibly the start of a range.
  const plain = rest.match(/^(\d+(?:\.\d+)?)\s*(?:[-–—]|\bto\b)\s*\d+(?:\.\d+)?/);
  if (plain) {
    return { value: Number(plain[1]), rest: rest.slice(plain[0].length), approx: true };
  }
  const single = rest.match(/^(\d+(?:\.\d+)?)/);
  if (single) {
    return { value: Number(single[1]), rest: rest.slice(single[0].length), approx };
  }

  return null;
}

/** A unit at the start of a string, in this pantry's terms. */
function readUnit(
  text: string,
): { unit: string; rest: string; scale: number; said: string | null } | null {
  const rest = text.trimStart();

  for (const [pattern, unit] of UNIT_WORDS) {
    const found = rest.match(pattern);
    if (found) {
      return { unit, rest: rest.slice(found[0].length), scale: 1, said: null };
    }
  }
  for (const [pattern, said, scale, unit] of FOREIGN_UNITS) {
    const found = rest.match(pattern);
    if (found) {
      return { unit, rest: rest.slice(found[0].length), scale, said };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------
   One ingredient line
   ------------------------------------------------------------------------- */

/** Words that say the writer is estimating, so the app should say so too. */
const LOOSE_WORDS =
  /\b(large|small|medium|big|generous|heaped|heaping|rounded|scant|good|decent|handfuls?|knobs?|splash(es)?|drizzles?|glugs?|dash(es)?|pinch(es)?|bunch(es)?|sprigs?|cloves?)\b/i;

/** Phrases that mean "no amount, and that is the amount". */
const UNMEASURED_PHRASES =
  /\b(to taste|as needed|as required|for (frying|greasing|dusting|drizzling|serving|garnish)|to serve|to garnish|optional extra)\b/i;

/** Two things a recipe always writes as one. Split only these, never guessed. */
const ALWAYS_TWO: [RegExp, string[]][] = [
  [/^salt (and|&) (freshly ground )?(black |white )?pepper$/i, ["Salt", "Pepper"]],
  [/^salt (and|&) pepper$/i, ["Salt", "Pepper"]],
];

/**
 * Tidies the name a line was left with: drops connective words the quantity
 * left behind, strips punctuation, and gives it a capital.
 */
function tidyName(text: string): string {
  const cleaned = text
    .trim()
    // After the connective is dropped, not before: the string arrives with the
    // space the quantity left on it, and "of" behind a space is not "^of".
    .replace(/^(of|the|a|an)\s+/i, "")
    .replace(/^[\s,.;:•\-–—*]+/, "")
    .replace(/^(of|the)\s+/i, "")
    .replace(/[\s,.;:]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return cleaned;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

/** One ingredient, as this file understood it. */
export interface ReadIngredient {
  item_name: string;
  quantity?: number;
  unit: string;
  pack_size?: number;
  pack_unit?: string;
  note?: string;
  optional?: boolean;
  approx?: boolean;
  section?: string;
}

/**
 * Reads one ingredient line.
 *
 * The order matters and is the order the information appears in: how many,
 * what of, what it is, what to do to it. Anything left over after the name is
 * a note, because a note is the one field where being wrong costs nothing.
 */
export function readIngredientLine(
  raw: string,
  notes: string[],
): ReadIngredient | null {
  let line = raw
    .replace(/^[\s•*•●▪\-–—]+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
  if (!line) return null;

  let optional = false;
  // "(optional)" anywhere, and the trailing ", optional".
  if (/\(\s*optional\s*\)/i.test(line) || /,\s*optional\.?$/i.test(line)) {
    optional = true;
    line = line.replace(/\(\s*optional\s*\)/i, "").replace(/,\s*optional\.?$/i, "");
  }

  /**
   * A note in brackets or after a comma is a preparation instruction.
   *
   * Taken off before the quantity is read, because "1 onion (about 150g)" has
   * a number in the brackets that is not the amount - and reading the brackets
   * as the quantity is how a parser cooks 150 onions.
   */
  const noteParts: string[] = [];
  line = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const text = inner.trim();
    if (text) noteParts.push(text);
    return " ";
  });

  // "to taste", "for frying" - the amount is that there isn't one.
  const unmeasuredPhrase = line.match(UNMEASURED_PHRASES);
  if (unmeasuredPhrase) {
    line = line.replace(UNMEASURED_PHRASES, " ");
    noteParts.unshift(unmeasuredPhrase[0].toLowerCase());
  }

  const first = readNumber(line);
  let quantity: number | null = first ? first.value : null;
  let approx = first ? first.approx : false;
  let rest = first ? first.rest : line;

  /**
   * "2 x 400g tins chopped tomatoes", the shape half of a British recipe uses.
   *
   * The first number is how many things, the second is how big each one is -
   * which is exactly pack_size, and is why this is worth reading properly
   * rather than flattening to 800g. A pantry that counts tins and one that
   * weighs the contents both get an answer.
   */
  let packSize: number | undefined;
  let packUnit: string | undefined;

  const multiplied = rest.match(/^\s*[x×*]\s*/i);
  if (quantity !== null) {
    /**
     * The second number, with or without the x between them.
     *
     * "2 x 400g tins" and "2 400g tins" are the same sentence and half of
     * British recipe writing uses each. Without the x it is only safe to look
     * when a container word follows - "2 400g" on its own could be anything,
     * and a parser that guesses there reads the next ingredient as this one's
     * packaging.
     */
    const after = multiplied ? rest.slice(multiplied[0].length) : rest;
    const size = readNumber(after);
    const sizeUnit = size ? readUnit(size.rest) : null;
    const container = sizeUnit
      ? /^\s*(of\s+|each\s+)?(tins?|cans?|packets?|packs?|pkts?|bags?|jars?|pots?|tubs?|boxes|box)\b/i.test(
          sizeUnit.rest,
        )
      : false;

    if (size && sizeUnit && (multiplied || container)) {
      packSize = size.value * sizeUnit.scale;
      packUnit = sizeUnit.unit;
      if (sizeUnit.said) {
        notes.push(
          `Read "${sizeUnit.said}" as ${packUnit} — ${size.value} ${sizeUnit.said} is about ${Math.round(packSize)}${packUnit}.`,
        );
      }
      rest = sizeUnit.rest;
    }
  }

  let unit: string | null = null;
  const read = readUnit(rest);
  if (read && quantity !== null) {
    unit = read.unit;
    if (read.scale !== 1) {
      const before = quantity;
      quantity = Math.round(quantity * read.scale * 100) / 100;
      notes.push(
        `Read "${before} ${read.said}" as ${quantity}${unit} — this pantry has no ${read.said}.`,
      );
    }
    rest = read.rest;

    /**
     * "2 400g tins" with the x left out, and "1 tin of 400g".
     *
     * Only after a container unit: "100 g chopped" must never look for a
     * second number, because the next word being a number there would mean
     * something else entirely.
     */
    if (!packSize && (unit === "tin" || unit === "pack" || unit === "jar")) {
      const inner = readNumber(rest.replace(/^\s*(of|each)\s+/i, ""));
      const innerUnit = inner ? readUnit(inner.rest) : null;
      if (inner && innerUnit && innerUnit.unit !== unit) {
        packSize = inner.value * innerUnit.scale;
        packUnit = innerUnit.unit;
        rest = innerUnit.rest;
      }
    }
  } else if (read && quantity === null) {
    // A unit with no number in front of it: "tbsp olive oil" means one.
    unit = read.unit;
    quantity = 1;
    rest = read.rest;
  }

  /**
   * A number with no unit is a count of things: "2 onions".
   *
   * And a line with neither is unmeasured, which is the honest answer rather
   * than a made-up 1. "Salt" on its own line is a real ingredient with a real
   * absence of an amount.
   */
  if (quantity !== null && unit === null) unit = "count";
  if (quantity === null) unit = UNMEASURED;

  // Anything after the first comma is preparation, not name.
  const comma = rest.indexOf(",");
  if (comma !== -1) {
    const after = rest.slice(comma + 1).trim();
    if (after) noteParts.push(after);
    rest = rest.slice(0, comma);
  }

  /**
   * "large", "a handful of" - the writer is estimating and the app should not
   * pretend otherwise. The word stays in the note: "1 large onion" is what
   * they wrote and is more use than "~1 Onion" on its own.
   */
  /**
   * "large", "a handful of" - the writer is estimating and the app should not
   * pretend otherwise. The word moves to the note whether or not there was a
   * number: "a handful of basil" is an ingredient called basil, and leaving
   * the handful in the name makes it one nothing will ever match to stock.
   * Only a line that HAS an amount can be approximate about it.
   */
  const loose = rest.match(LOOSE_WORDS);
  if (loose) {
    if (unit !== UNMEASURED) approx = true;
    noteParts.unshift(loose[0].toLowerCase());
    rest = rest.replace(LOOSE_WORDS, " ");
  }

  const name = tidyName(rest);
  if (!name) return null;

  const note = noteParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return {
    item_name: name,
    // An unmeasured line sends no quantity and no pack size; the document
    // parser refuses both on one, and rightly.
    ...(unit === UNMEASURED ? {} : { quantity: quantity ?? 1 }),
    unit: unit ?? "count",
    ...(unit !== UNMEASURED && packSize ? { pack_size: packSize, pack_unit: packUnit } : {}),
    ...(note ? { note } : {}),
    ...(optional ? { optional: true } : {}),
    ...(unit !== UNMEASURED && approx ? { approx: true } : {}),
  };
}

/* -------------------------------------------------------------------------
   The whole paste
   ------------------------------------------------------------------------- */

const INGREDIENT_HEADING = /^(ingredients?|you(\s+will)?\s+need|shopping list)\b[:\s]*$/i;
const METHOD_HEADING =
  /^(method|instructions?|directions?|steps?|preparation|how to (make|cook) it|to (make|cook))\b[:\s]*$/i;
const NOTES_HEADING = /^(notes?|tips?|to serve|serving suggestions?)\b[:\s]*$/i;
/** "For the sauce", "For the topping:" - a section within either half. */
const SECTION_HEADING = /^for the .{1,40}$/i;

/**
 * Whether a line looks like something to do rather than something to buy.
 *
 * Length is the strongest signal and the only one that survives every layout:
 * an ingredient is a noun phrase and a step is a sentence. The verb test
 * catches the short ones ("Season and serve"), and the leading-quantity test
 * rescues the long ingredients ("2 x 400g tins of chopped tomatoes, drained").
 */
function looksLikeStep(line: string): boolean {
  const words = line.trim().split(/\s+/).length;
  if (readNumber(line) && words < 12) return false;
  if (words >= 12) return true;
  return /^(heat|add|stir|pour|mix|combine|bring|season|serve|cook|fry|bake|place|put|remove|cut|chop|slice|drain|whisk|beat|fold|simmer|boil|roast|grill|preheat|melt|leave|set|repeat|transfer|reduce|cover|garnish|sprinkle|spoon|return|blend|blitz|rinse|wash|peel|allow|meanwhile|once|when|while|finally|next|then)\b/i.test(
    line.trim(),
  );
}

/** "Serves 4", "Makes 12", "Feeds 6", "For 2 people". */
function readServings(line: string): number | null {
  const found = line.match(
    /\b(?:serves?|makes|feeds|yield(?:s)?|portions?(?: for)?|for)\s+(?:about\s+)?(\d+)\b/i,
  );
  if (!found) return null;
  const value = Number(found[1]);
  return Number.isInteger(value) && value > 0 && value <= 100 ? value : null;
}

/** "Prep 10 mins", "20 minutes preparation", "Cook time: 1 hr 15". */
function readMinutes(line: string, which: "prep" | "cook"): number | null {
  const word = which === "prep" ? "prep(?:aration)?" : "cook(?:ing)?|bak(?:e|ing)";
  const patterns = [
    new RegExp(`\\b(?:${word})(?:\\s*time)?\\s*[:\\-]?\\s*(\\d+)\\s*(?:hours?|hrs?|h)\\b\\s*(\\d+)?`, "i"),
    new RegExp(`\\b(?:${word})(?:\\s*time)?\\s*[:\\-]?\\s*(\\d+)\\s*(?:minutes?|mins?|m)\\b`, "i"),
    new RegExp(`\\b(\\d+)\\s*(?:minutes?|mins?)\\s*(?:of\\s*)?(?:${word})\\b`, "i"),
  ];
  for (const [index, pattern] of patterns.entries()) {
    const found = line.match(pattern);
    if (!found) continue;
    const value = index === 0 ? Number(found[1]) * 60 + Number(found[2] ?? 0) : Number(found[1]);
    if (Number.isFinite(value) && value > 0 && value <= 6000) return Math.round(value);
  }
  return null;
}

/**
 * Turns a pasted recipe into a document parseRecipeDocument will accept.
 *
 * Headings are used when they are there and the shape of the lines is read
 * when they are not, because half the recipes people paste are off a page that
 * had the headings in an image, or out of a message where they got lost. A
 * recipe with no headings at all still comes apart correctly if the
 * ingredients are listed before the method, which is every recipe.
 */
export function readRecipeText(text: string): ReadResult {
  const notes: string[] = [];
  const unread: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { document: {}, notes, unread };
  }

  let name: string | null = null;
  let servings: number | null = null;
  let prep: number | null = null;
  let cook: number | null = null;
  let description: string | null = null;
  const extraNotes: string[] = [];

  const ingredientLines: { text: string; section: string | null }[] = [];
  const stepLines: { text: string; section: string | null }[] = [];

  /**
   * Which half of the recipe we are in.
   *
   * `null` until something says. Before a heading arrives, each line is judged
   * on its own shape - which is how a recipe pasted out of a chat, with no
   * headings at all, still comes apart.
   */
  let where: "ingredients" | "steps" | "notes" | null = null;
  let section: string | null = null;
  /**
   * Whether a heading put us here, or the shape of a line did.
   *
   * A heading is a promise and holds until the next one: everything under
   * "Ingredients" is an ingredient, however it reads. A guess is not, and must
   * be made again on every line - otherwise the first ingredient in a paste
   * with no headings at all sets `where` to "ingredients" and the entire
   * method underneath it is read as shopping.
   */
  let stated = false;

  for (const line of lines) {
    if (INGREDIENT_HEADING.test(line)) {
      where = "ingredients";
      stated = true;
      section = null;
      continue;
    }
    if (METHOD_HEADING.test(line)) {
      where = "steps";
      stated = true;
      section = null;
      continue;
    }
    if (NOTES_HEADING.test(line)) {
      where = "notes";
      stated = true;
      section = null;
      continue;
    }
    if (SECTION_HEADING.test(line)) {
      section = tidyName(line);
      continue;
    }

    // Metadata can appear anywhere - under the title, in a footer, beside a
    // photo - so it is looked for on every line rather than only at the top.
    const foundServings = readServings(line);
    const foundPrep = readMinutes(line, "prep");
    const foundCook = readMinutes(line, "cook");
    if (servings === null && foundServings !== null) servings = foundServings;
    if (prep === null && foundPrep !== null) prep = foundPrep;
    if (cook === null && foundCook !== null) cook = foundCook;

    // A line that was ONLY metadata has now been read and should not also
    // become an ingredient called "Serves 4".
    const onlyMetadata =
      (foundServings !== null || foundPrep !== null || foundCook !== null) &&
      line.replace(
        /\b(serves?|makes|feeds|yields?|portions?|for|prep(aration)?|cook(ing)?|bak(e|ing)|time|total|about|hours?|hrs?|minutes?|mins?|people|servings?)\b|\d+|[:\-–—,.()|]/gi,
        "",
      ).trim().length === 0;
    if (onlyMetadata) continue;

    if (name === null && where === null) {
      // The first real line is the title, unless it is plainly an ingredient -
      // plenty of pastes start straight in at "200g plain flour".
      if (!readNumber(line) && line.length <= 120) {
        name = line.replace(/[:\s]+$/, "");
        continue;
      }
    }

    /**
     * The blurb under the title.
     *
     * Caught here rather than sorted out afterwards, because by the time it
     * reaches the ingredient reader "A weeknight favourite." is an ingredient
     * called A weeknight favourite, and by the time it reaches the step reader
     * it is instruction number one on the cook screen.
     *
     * Only the line directly under the title, only before anything else has
     * been read, and only if it is punctuated like a sentence. "Black pepper"
     * on the second line is an ingredient and stays one.
     */
    if (
      name !== null &&
      description === null &&
      where === null &&
      ingredientLines.length === 0 &&
      stepLines.length === 0 &&
      /[.!?]$/.test(line) &&
      line.split(/\s+/).length >= 3 &&
      !/\d/.test(line)
    ) {
      description = line;
      continue;
    }

    if (where === "notes") {
      extraNotes.push(line);
      continue;
    }

    const isStep = stated
      ? where === "steps"
      : where === "steps" || looksLikeStep(line);

    if (isStep) {
      // Without headings, the method starting is the one transition that does
      // stick: a recipe never goes back to listing ingredients afterwards.
      where = "steps";
      stepLines.push({ text: line, section });
      continue;
    }

    ingredientLines.push({ text: line, section });
    if (where === null) where = "ingredients";
  }

  const ingredients: ReadIngredient[] = [];
  for (const { text: lineText, section: lineSection } of ingredientLines) {
    // The two things every recipe writes as one line.
    /**
     * "Salt and pepper to taste" is two ingredients written as one line, and
     * every recipe writes it that way. Only these exact phrases are split -
     * guessing at "and" in general turns cheese and onion crisps into two
     * things, and a wrong split is more annoying than a missed one.
     */
    const pairable = lineText
      .trim()
      .replace(/[,\s]*\b(to taste|as needed|as required)\b\.?$/i, "")
      .trim();
    const paired = ALWAYS_TWO.find(([pattern]) => pattern.test(pairable));
    if (paired) {
      for (const each of paired[1]) {
        ingredients.push({
          item_name: each,
          unit: UNMEASURED,
          note: "to taste",
          ...(lineSection ? { section: lineSection } : {}),
        });
      }
      continue;
    }

    const read = readIngredientLine(lineText, notes);
    if (!read) {
      unread.push(lineText);
      continue;
    }
    ingredients.push({ ...read, ...(lineSection ? { section: lineSection } : {}) });
  }

  const steps = stepLines.map(({ text: stepText, section: stepSection }) => ({
    body: stepText.replace(/^(step\s*)?\d+\s*[.):\-]\s*/i, "").trim(),
    ...(stepSection ? { section: stepSection } : {}),
  }));

  if (servings === null) {
    servings = 4;
    notes.push("No serving count found — assumed 4. Change it below if not.");
  }

  const document: Record<string, unknown> = {
    name: name ?? "Untitled recipe",
    base_servings: servings,
    ingredients,
    ...(description ? { description } : {}),
    ...(prep ? { prep_minutes: prep } : {}),
    ...(cook ? { cook_minutes: cook } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(extraNotes.length > 0 ? { notes: extraNotes.join("\n") } : {}),
  };

  if (name === null) {
    notes.push('No title found — called it "Untitled recipe".');
  }
  const unmeasured = ingredients.filter((line) => line.unit === UNMEASURED).length;
  if (unmeasured > 0) {
    notes.push(
      `${unmeasured} ${unmeasured === 1 ? "line has" : "lines have"} no amount — left as "to taste" rather than guessing one.`,
    );
  }

  return { document, notes, unread };
}

/** Every unit a read line can come back with, for the editor's pickers. */
export const READ_UNITS = RECIPE_UNITS;
