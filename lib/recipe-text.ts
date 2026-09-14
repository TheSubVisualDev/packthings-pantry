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
/*
 * Case-insensitive, all of them.
 *
 * These matched lower case only, so a line beginning "Tablespoon of poppy
 * seeds" - which is how a person writes it when the unit starts the sentence -
 * found no unit at all and became an ingredient called "Tablespoon of poppy
 * seeds" with no amount. Capitalisation is a fact about where a word sits in a
 * sentence, not about what it means.
 */
const UNIT_WORDS: [RegExp, string][] = [
  [/^(kilograms?|kilos?|kgs?)\b/i, "kg"],
  [/^(grams?|grammes?|gms?|g)\b/i, "g"],
  [/^(millilitres?|milliliters?|mls?)\b/i, "ml"],
  [/^(litres?|liters?|ltrs?|l)\b/i, "l"],
  [/^(tablespoons?|tbsps?|tbs|tblsp)\b/i, "tbsp"],
  [/^(teaspoons?|tsps?)\b/i, "tsp"],
  [/^(tins?|cans?)\b/i, "tin"],
  [/^(packets?|packs?|pkts?|bags?|boxes|box)\b/i, "pack"],
  [/^(jars?|pots?|tubs?)\b/i, "jar"],
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
  [/^(fl\.?\s?oz|fluid ounces?)\b/i, "fl oz", 28.4, "ml"],
  [/^(ounces?|ozs?)\b/i, "oz", 28.35, "g"],
  [/^(pounds?|lbs?)\b/i, "lb", 453.6, "g"],
  [/^(cups?)\b/i, "cup", 240, "ml"],
  [/^(pints?|pts?)\b/i, "pint", 568, "ml"],
  [/^(quarts?|qts?)\b/i, "quart", 1137, "ml"],
  [/^(sticks?) (of )?butter\b/i, "stick of butter", 113, "g"],
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

  /**
   * Anything after the first comma is preparation, not name.
   *
   * Unless it turns out that the name was after the comma. "2 large,
   * un-waxed lemons or a large orange" splits into "large" and the rest, and
   * "large" is a word this file then strips as an estimate - leaving nothing
   * at all, and the whole line thrown away as unreadable. So the split is
   * provisional: if what is left in front of the comma turns out to be only
   * adjectives, the comma was punctuation inside the name and not the start
   * of an instruction.
   */
  const whole = rest;
  const comma = rest.indexOf(",");
  let afterComma: string | null = null;
  if (comma !== -1) {
    const after = rest.slice(comma + 1).trim();
    if (after) afterComma = after;
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

  let name = tidyName(rest);

  /**
   * Nothing left in front of the comma: it was not an instruction after all.
   *
   * Undo the split and read the line whole, minus the estimating words, which
   * are still notes wherever they were. Better a long ingredient name that
   * can be corrected in the editor than a line silently dropped.
   */
  if (!name && afterComma) {
    let retry = whole.replace(LOOSE_WORDS, " ");
    if (loose && noteParts[0] === loose[0].toLowerCase()) noteParts.shift();
    // The loose word applies to the amount either way.
    if (loose) {
      if (unit !== UNMEASURED) approx = true;
      noteParts.unshift(loose[0].toLowerCase());
    }
    retry = retry.replace(/\s{2,}/g, " ");
    name = tidyName(retry);
    afterComma = null;
  }

  if (afterComma) noteParts.push(afterComma);
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
  return STEP_VERB.test(line.trim());
}

/**
 * The verbs a method opens on.
 *
 * Kept as a list rather than made clever, and extended when something turns up
 * missing: "Sift the flour and baking powder together" was read as an
 * ingredient called Sift the flour and baking powder together, because sift
 * was not on it. Baking verbs were the gap - the original list was written
 * from savoury recipes and has fry, simmer and roast but not knead, prove or
 * chill.
 *
 * "Cream" and "batter" are deliberately NOT on it. They are verbs, but they
 * are also things you buy, and "Cream cheese" on a line of its own would stop
 * being an ingredient - which is a worse failure than a step misread as one,
 * because a missing ingredient is missing from the shopping list too.
 */
const STEP_VERB =
  /^(heat|add|stir|pour|mix|combine|bring|season|serve|cook|fry|bake|place|put|remove|cut|chop|slice|drain|whisk|beat|fold|simmer|boil|roast|grill|preheat|melt|leave|set|repeat|transfer|reduce|cover|garnish|sprinkle|spoon|return|blend|blitz|rinse|wash|peel|allow|meanwhile|once|when|while|finally|next|then|sift|sieve|tip|knead|prove|rest|chill|freeze|thaw|defrost|marinate|steam|poach|sear|braise|strain|skim|taste|adjust|top|finish|assemble|layer|roll|spread|arrange|scatter|dot|brush|line|grease|turn|flip|lower|raise|increase|discard|reserve|check|continue|stand|warm|cool|crush|grate|zest|squeeze|divide|shape|form|pinch|press|toss|coat|dust|drizzle|fill|stuff|wrap|seal|slide|lift|scrape|deglaze|thicken|whip|rub|dip|plate|switch|use|start|begin)\b/i;

/** "Serves 4", "Makes 12", "Feeds 6", "For 2 people". */
function readServings(line: string): number | null {
  /**
   * The word has to actually mean servings.
   *
   * A bare "for 4" used to count, which read "bake for about 40 minutes" as a
   * recipe for forty people - and a wrong serving count is worse than none,
   * because every quantity on the page gets scaled by it. "For" only counts
   * when something after the number says who it is for.
   */
  const explicit = line.match(
    /\b(?:serves?|makes|feeds|yields?)\s+(?:about\s+|around\s+)?(\d+)\b/i,
  );
  const withNoun = line.match(
    /\bfor\s+(?:about\s+|around\s+)?(\d+)\s*(?:people|persons?|servings?|portions?)\b/i,
  );
  const bareNoun = line.match(/\b(\d+)\s*(?:servings?|portions?)\b/i);

  const found = explicit ?? withNoun ?? bareNoun;
  if (!found) return null;

  // A number followed by a unit of time is a cooking time that happened to
  // sit near one of those words.
  if (new RegExp(String.raw`\b${found[1]}\s*(?:min|hour|hr|sec)`, "i").test(line)) {
    return null;
  }

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
 * "Takes 40 minutes", "Ready in 1 hr 15", "Total time: 25 mins".
 *
 * The headline time, which is how most handwritten recipes give one - they
 * say how long the thing takes, not how long the oven is on. Read apart from
 * prep and cook because it is neither: it is both added together, and the
 * only honest place to put it is the cooking time when nothing else claims
 * one.
 *
 * Anchored on those words rather than on "N minutes", because half the
 * sentences in a method carry a duration and reading "bake for 30 minutes" as
 * the recipe's total is how a two-hour stew comes out at half an hour.
 */
function readTotalMinutes(line: string): number | null {
  const word = String.raw`takes|ready\s+in|total(?:\s*time)?|time`;
  const loose = String.raw`(?:about\s+|around\s+|roughly\s+)?`;
  const patterns = [
    new RegExp(
      String.raw`\b(?:${word})\s*[:\-]?\s*${loose}(\d+)\s*(?:hours?|hrs?|h)\b\s*(\d+)?`,
      "i",
    ),
    new RegExp(
      String.raw`\b(?:${word})\s*[:\-]?\s*${loose}(\d+)\s*(?:minutes?|mins?)\b`,
      "i",
    ),
    /\b(\d+)\s*(?:minutes?|mins?)\s*(?:in\s+)?total\b/i,
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
 * A method written as one paragraph, cut into steps.
 *
 * Plenty of recipes - handwritten ones especially - put the whole method in a
 * block: "Preheat the oven. Wash the lemons, cover with water and boil for an
 * hour. Cool and remove the pips." That is one step to a reader looking for
 * line breaks and six steps to anybody cooking it, and the difference matters
 * on the cook screen, where the whole point is one instruction at a time.
 *
 * Split at a full stop followed by a capital, which is a sentence boundary and
 * not a decimal point, an abbreviation, or the "180c/350f" in an oven
 * temperature. Sentences are then glued back into steps of a workable length:
 * "Cool." on its own is a step nobody needed a screen for.
 */
function intoSteps(paragraph: string): string[] {
  const sentences = paragraph
    // Split after . ! or ? when the next thing along is a capital or a digit.
    // The lookbehind keeps the punctuation on the sentence it belongs to.
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length < 2) return [paragraph];

  /**
   * Short sentences join the one before them.
   *
   * "Cool in the tin before turning out." is a step. "Cool." is half of the
   * sentence in front of it, and putting it on a screen of its own makes the
   * method look longer and say less.
   */
  const MIN_WORDS = 4;
  const steps: string[] = [];
  for (const sentence of sentences) {
    const short = sentence.split(/\s+/).length < MIN_WORDS;
    if (short && steps.length > 0) steps[steps.length - 1] += ` ${sentence}`;
    else steps.push(sentence);
  }

  return steps;
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

  /**
   * Lines, with the invisible ones thrown away.
   *
   * A recipe pasted out of a website or a word processor is full of zero-width
   * spaces, non-breaking spaces and byte-order marks used as spacers - and
   * String.trim removes none of them, so a "blank" separator line arrives as a
   * line with one character on it. One of those became an ingredient called
   * nothing, which pushed the blurb into the method, which latched the reader
   * into step mode, which turned every ingredient after it into an
   * instruction. A whole recipe came apart from one invisible character.
   */
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u200B-\u200D\uFEFF\u00A0\u2060]/g, " ").trim())
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
    const foundTotal = readTotalMinutes(line);
    if (servings === null && foundServings !== null) servings = foundServings;
    if (prep === null && foundPrep !== null) prep = foundPrep;
    if (cook === null && foundCook !== null) cook = foundCook;

    // A line that was ONLY metadata has now been read and should not also
    // become an ingredient called "Serves 4".
    const onlyMetadata =
      (foundServings !== null ||
        foundPrep !== null ||
        foundCook !== null ||
        foundTotal !== null) &&
      line.replace(
        /\b(serves?|makes|feeds|yields?|portions?|for|prep(aration)?|cook(ing)?|bak(e|ing)|takes?|ready|in|active|time|total|about|around|roughly|approx(imately)?|hours?|hrs?|minutes?|mins?|people|persons?|servings?)\b|\d+|[:\-–—,.()|·•]/gi,
        "",
      ).trim().length === 0;

    /**
     * A headline time is the cooking time, but only off a line that is nothing
     * else.
     *
     * "This takes about 20 minutes" in the middle of a method is a step, and
     * taking its duration as the whole recipe's would be wrong more often
     * than right.
     */
    if (onlyMetadata && cook === null && foundTotal !== null) cook = foundTotal;

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

    /**
     * Prose before any ingredient is not the method.
     *
     * Without headings the reader guesses from shape, and a blurb under the
     * title looks exactly like an instruction: long, prose, no leading number.
     * It used to latch the reader into step mode on the spot, and every
     * ingredient after it was read as an instruction - the whole recipe, in
     * order, as a method.
     *
     * A method cannot begin before the shopping list. So until something has
     * been read as an ingredient, a long line is kept as prose rather than
     * promoted, and it ends up as the blurb or as notes.
     */
    const isStep = stated
      ? where === "steps"
      : where === "steps" || (ingredientLines.length > 0 && looksLikeStep(line));

    if (isStep) {
      // Without headings, the method starting is the one transition that does
      // stick: a recipe never goes back to listing ingredients afterwards.
      where = "steps";
      stepLines.push({ text: line, section });
      continue;
    }

    // Prose, before anything has been listed. The blurb if there is not one
    // yet, and otherwise something to keep rather than to mistake for food.
    if (!stated && ingredientLines.length === 0 && looksLikeStep(line)) {
      if (description === null) description = line;
      else extraNotes.push(line);
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

  /**
   * One line per instruction, however the method was written.
   *
   * A numbered list arrives as one line each and is left alone; a paragraph
   * arrives as one line for the lot and is cut into sentences. Only when the
   * whole method is one or two lines, because a writer who has already broken
   * their method into lines has said where the steps are and should not be
   * second-guessed.
   */
  const asParagraphs = stepLines.length <= 2;

  const steps = stepLines.flatMap(({ text: stepText, section: stepSection }) => {
    const body = stepText.replace(/^(step\s*)?\d+\s*[.):\-]\s*/i, "").trim();
    const bodies = asParagraphs ? intoSteps(body) : [body];
    return bodies.map((each) => ({
      body: each,
      ...(stepSection ? { section: stepSection } : {}),
    }));
  });

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
