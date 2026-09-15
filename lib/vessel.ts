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

export interface VesselHints {
  /** What one pack is called, when a barcode said so. */
  packUnit?: string | null;
  /** The item's tags, which sometimes name the packaging. */
  tags?: string[];
  /**
   * What to return when nothing is recognised.
   *
   * Callers disagree about what "I do not know" should look like, and both are
   * right. The shelf wants a bag - a soft slumped shape that carries a level
   * convincingly and claims nothing about packaging. The editable control in
   * components/vessel.tsx wants a jar, which is the shape that reads as
   * "container" at the size it draws. One set of rules, two ideas of nothing.
   */
  fallback?: Vessel;
}

export function vesselFor(
  name: string,
  canonicalUnit: string,
  dimension: string,
  hints: VesselHints = {},
): Vessel {
  const label = estimateFor(name)?.label ?? "";
  // The pack unit and the tags are words about the packet, so they answer this
  // question as well as the name does - "bottle" in a tag is not a guess.
  const said = [name, hints.packUnit ?? "", ...(hints.tags ?? [])].join(" ");

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
  if (has(said, ["oil", "sauce", "vinegar", "juice", "squash", "wine"])) return "bottle";
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
  if (has(said, ["tinned", "tin", "can", "canned"])) return "tin";
  if (has(name, ["jar", "paste", "puree", "pickle", "jam", "chutney"])) return "jar";
  if (has(said, ["bottle"])) return "bottle";
  if (has(said, ["carton"])) return "carton";
  if (has(said, ["bag", "sack", "packet", "pack"])) return "bag";

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
  return hints.fallback ?? "bag";
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

/**
 * What colour the contents are.
 *
 * Not decoration: it is the difference between reading a shelf and reading a
 * bar chart. A row of identical terracotta silhouettes tells you the levels
 * and nothing else, and the whole argument for drawing vessels is that a
 * kitchen is recognisable at a glance.
 *
 * Hues stay inside the app's warm range at a similar chroma, with one green
 * for produce, so a shelf reads as one picture rather than a paint chart -
 * the same rule the design language applies to everything else.
 *
 * Keyed off the food where it is recognised and the vessel otherwise, because
 * the container is a decent proxy when the food is not known: whatever is in
 * an unrecognised tin, it is not bright white.
 */
export function tintFor(name: string, vessel: Vessel): string {
  const label = estimateFor(name)?.label ?? "";
  const n = name.toLowerCase();

  if (label.includes("milk") || has(name, ["milk", "cream", "yoghurt"])) {
    return "oklch(0.93 0.03 90)";
  }
  if (has(name, ["butter", "cheese"])) return "oklch(0.88 0.08 90)";
  if (has(name, ["soy", "vinegar", "worcestershire"])) return "oklch(0.38 0.06 45)";
  if (has(name, ["oil"])) return "oklch(0.82 0.11 85)";
  if (has(name, ["chilli", "chili", "paprika", "gochujang", "tomato", "harissa"])) {
    return "oklch(0.55 0.15 35)";
  }
  if (has(name, ["carrot", "squash", "pepper", "onion"])) return "oklch(0.75 0.12 60)";
  if (n.includes("herb") || has(name, ["oregano", "basil", "parsley", "coriander", "mint", "spinach", "pea", "bean"])) {
    return "oklch(0.68 0.10 130)";
  }
  if (has(name, ["flour", "sugar", "rice", "oats", "couscous"])) return "oklch(0.91 0.03 75)";

  switch (vessel) {
    case "spice": return "oklch(0.62 0.12 50)";
    case "tray": return "oklch(0.68 0.11 30)";
    case "tin": return "oklch(0.60 0.10 45)";
    case "block": return "oklch(0.88 0.06 88)";
    case "tub": return "oklch(0.92 0.03 85)";
    case "bottle": return "oklch(0.70 0.10 70)";
    case "carton": return "oklch(0.90 0.04 80)";
    default: return "oklch(0.86 0.06 72)";
  }
}
