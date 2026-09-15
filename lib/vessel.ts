import { estimateFor } from "./generic-nutrition";

/**
 * What shape of thing this is, so the shelf can draw it.
 *
 * The shelf redesign draws every item as the vessel it actually is - a carton
 * of milk, a slumped bag of flour, a squat jar of gochujang - filled to the
 * level you really have. Nothing in the database says which. There is no
 * packaging column, Open Food Facts is not asked for one, and `count_noun`
 * is empty on all 47 rows, so the shape has to be worked out from the two
 * things that are always there: the name, and the unit it is measured in.
 *
 * That is less fragile than it sounds, because the unit already carries most
 * of the answer. Something measured in millilitres is poured, so it lives in
 * something with a neck or a spout; something counted is not poured at all and
 * a level would be a lie about it. The name only has to settle which of two or
 * three plausible containers it is, and when it cannot, the fallback for the
 * dimension is still right about how the thing behaves.
 *
 * Identity comes from `estimateFor` where the food is recognised - the same
 * matcher the nutrition estimates and the shelf lives use. A second list of
 * words for the same job is the bug this codebase keeps a count of.
 *
 * Being wrong here is cheap, which is why it is allowed to guess at all. A
 * bottle drawn as a jar still shows the right amount at the right level; the
 * worst case is a picture that is slightly the wrong shape, not a number that
 * is wrong. That is a different bargain from the expiry guess, which is why
 * this one needs no marking.
 */

export type Vessel =
  | "bottle"   // a neck: oils, sauces, vinegars
  | "carton"   // a gable top: milks, juices, stock
  | "jar"      // wide mouth, lid: pastes, preserves, pickles
  | "tin"      // a can: tomatoes, pulses, fish
  | "bag"      // soft and slumped: flour, rice, pasta, loose veg
  | "tub"      // tapered pot: cream, yoghurt, spreads
  | "block"    // wrapped: butter, cheese
  | "tray"     // a covered tray: meat and fish
  | "spice"    // a small capped jar: everything on the spice rack
  | "pips";    // counted, and drawn as that many: eggs, onions, cubes

/** Matched on whole words, so "oil" does not fire inside "boiled". */
function has(name: string, words: string[]): boolean {
  const padded = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return words.some((word) => padded.includes(` ${word} `));
}

/**
 * The generic labels that live on a spice rack.
 *
 * Kept as a list of the matcher's own labels rather than as more keywords, so
 * adding a spice to the generics table is the only edit needed. Size is the
 * real signal here and the app does not record it: a jar of paprika and a bag
 * of flour are both "mass", and only knowing what the food IS separates them.
 */
const SPICES = new Set([
  "cinnamon", "cumin", "oregano", "paprika", "turmeric", "black pepper",
  "chilli powder", "garlic powder", "ground ginger", "mixed herbs",
  "bay leaves",
]);

const TINNED = new Set([
  "chopped tomatoes", "chickpeas", "kidney beans", "baked beans", "tuna",
]);

const JARRED = new Set([
  "gochujang", "miso", "tomato puree", "mustard", "ketchup", "peanut butter",
  "honey",
]);

const BAGGED = new Set([
  "plain flour", "rice", "pasta", "noodles", "oats", "couscous", "lentils",
  "sugar", "carrots", "potato", "sweet potato", "onion", "peas",
]);

export function vesselFor(
  name: string,
  canonicalUnit: string,
  dimension: string,
): Vessel {
  const label = estimateFor(name)?.label ?? "";

  /**
   * The name beats the unit, and that ordering was learned from real rows.
   *
   * Half this kitchen's items are placeholders carrying "there is some, nobody
   * said how much" - and every one of those is stored as mass whatever it
   * actually is, because mass is what the form defaults to. So "Olive oil" and
   * "Milk" arrive as grams and a unit-first rule drew both as bags. The other
   * direction fails too: Paprika, Cumin and MSG are stored as `1 count`, and
   * counting-first drew three spice jars as a row of pips.
   *
   * The unit is a good signal about food somebody has actually measured, and a
   * bad one about food somebody has only named. The name is reliable for both.
   */
  if (SPICES.has(label) || has(name, ["salt", "msg", "pepper", "flakes", "powder", "seeds", "ground", "dried"])) {
    // Black pepper, and every jar on the rack, whatever unit it landed in.
    if (!has(name, ["sweet pepper", "peppers", "red pepper flakes"])) return "spice";
  }
  if (has(name, ["oil"])) return "bottle";
  if (has(name, ["milk"])) return "carton";
  if (has(name, ["egg", "eggs"])) return "pips";
  if (has(name, ["cube", "cubes"])) return "pips";

  /**
   * Counted things next, whatever they are made of.
   *
   * This is the one branch that changes what gets DRAWN rather than which
   * picture is used: three of six eggs is three pips, not a box half shaded,
   * because half an egg is not a thing anybody has.
   */
  if (dimension === "count" || canonicalUnit === "count") return "pips";

  // The name wins over the food, because a name is about the packet and the
  // generic is only about the food. "Tinned tomatoes" and "tomato" agree here.
  if (has(name, ["tinned", "tin", "can", "canned"])) return "tin";
  if (has(name, ["jar", "paste", "puree", "pickle", "jam", "chutney"])) return "jar";
  if (has(name, ["bottle"])) return "bottle";
  if (has(name, ["carton"])) return "carton";
  if (has(name, ["bag", "sack", "packet"])) return "bag";

  if (dimension === "volume") {
    if (has(name, ["milk", "cream", "yoghurt", "yogurt"]) || label.includes("milk")) {
      // Cream and yoghurt come in pots; milk comes in a carton or a bottle,
      // and a carton is the one a British fridge is most likely to hold.
      return has(name, ["cream", "yoghurt", "yogurt"]) ? "tub" : "carton";
    }
    if (has(name, ["stock", "broth"])) return "carton";
    // Everything else poured - oil, soy, vinegar, wine - has a neck.
    return "bottle";
  }

  // Mass from here down, which is where the food itself has to answer.
  if (TINNED.has(label)) return "tin";
  if (JARRED.has(label)) return "jar";
  if (has(name, ["butter", "cheese", "cheddar"])) {
    // Peanut butter is a jar and is caught above; dairy butter is a block.
    return "block";
  }
  if (has(name, ["mince", "fillet", "breast", "steak", "chicken", "beef", "pork", "salmon", "bacon"])) {
    return "tray";
  }
  if (BAGGED.has(label) || has(name, ["flour", "sugar", "rice", "pasta", "spaghetti", "oats"])) {
    return "bag";
  }

  /**
   * Nothing recognised, and that is fine.
   *
   * A bag is the honest default for a weighed thing: it is the shape that
   * carries a level convincingly at any size, and unlike a tin or a jar it
   * does not claim to know anything about the packaging.
   */
  return "bag";
}

/**
 * Whether a level can honestly be drawn at all.
 *
 * Three states, matching what the shelf has to say: a real level, a count of
 * things, or an outline with a question mark. `unspecified` is the app's own
 * word for "there is some and nobody said how much", and 17 of 47 items are
 * in it - drawing those full would be the single most misleading thing the
 * redesign could do.
 */
export function fillFor(item: {
  quantity: number;
  pack_size: number | null;
  unspecified?: number;
}): number | null {
  if (item.unspecified === 1) return null;
  if (item.pack_size === null || item.pack_size <= 0) return null;
  return Math.max(0, Math.min(1, item.quantity / item.pack_size));
}
