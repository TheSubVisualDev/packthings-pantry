import type { Macros } from "./nutrition";

/**
 * Rough nutrition for things that never had a barcode.
 *
 * Open Food Facts is keyed on packets, so loose carrots, a bag of flour from a
 * scoop, or "onion" typed by hand will never be in it. These are the standard
 * per-100g figures such foods have in food composition tables - close enough to
 * be worth knowing, never close enough to be called measured.
 *
 * **Estimates are never written into the item's own columns.** They are worked
 * out when something asks, and always travel with the fact that they were
 * guessed. A stored guess is indistinguishable from a scan six months later,
 * and the difference between "this is what the packet says" and "this is what
 * carrots are usually like" is exactly the difference worth keeping.
 *
 * Raw and unprepared unless the name says otherwise, because that is how a
 * pantry holds things. Figures are rounded to the precision they deserve.
 */

export interface Generic extends Macros {
  /** What it is, for saying which guess was used. */
  label: string;
  /**
   * What one of them typically weighs, in grams, when the thing is counted.
   *
   * The bridge between "2 eggs" and figures stated per 100g. Approximate by
   * nature - a large onion is twice a small one - but an approximate weight
   * beats leaving every counted ingredient out of a recipe's total, which is
   * what happened before this existed.
   */
  unitGrams?: number;
  /** Words that mean this thing. Matched whole, against the item's words. */
  words: string[];
}

/** Shorthand so the table below reads as a table and not as boilerplate. */
function food(
  label: string,
  words: string[],
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fibre: number | null = null,
  salt: number | null = null,
  unitGrams?: number,
): Generic {
  return {
    label,
    words,
    kcal_100: kcal,
    protein_100: protein,
    carbs_100: carbs,
    fat_100: fat,
    fibre_100: fibre,
    salt_100: salt,
    unitGrams,
  };
}

export const GENERICS: Generic[] = [
  // Vegetables, raw.
  food("carrots", ["carrot", "carrots"], 41, 0.9, 9.6, 0.2, 2.8, null, 60),
  food("onion", ["onion", "onions"], 40, 1.1, 9.3, 0.1, 1.7, null, 150),
  food("spring onion", ["spring onion", "scallion", "scallions"], 32, 1.8, 7.3, 0.2, 2.6, null, 15),
  food("garlic", ["garlic"], 149, 6.4, 33, 0.5, 2.1, null, 3),
  food("potato", ["potato", "potatoes"], 77, 2, 17.5, 0.1, 2.2, null, 150),
  food("sweet potato", ["sweet potato", "sweet potatoes"], 86, 1.6, 20.1, 0.1, 3, null, 130),
  food("tomato", ["tomato", "tomatoes"], 18, 0.9, 3.9, 0.2, 1.2, null, 120),
  food("pepper", ["pepper", "peppers", "capsicum"], 31, 1, 6, 0.3, 2.1, null, 160),
  food("chilli", ["chilli", "chillies", "chili", "chilies"], 40, 1.9, 8.8, 0.4, 1.5, null, 15),
  food("mushroom", ["mushroom", "mushrooms"], 22, 3.1, 3.3, 0.3, 1, null, 20),
  food("courgette", ["courgette", "courgettes", "zucchini"], 17, 1.2, 3.1, 0.3, 1, null, 200),
  food("aubergine", ["aubergine", "aubergines", "eggplant"], 25, 1, 5.9, 0.2, 3, null, 250),
  food("broccoli", ["broccoli"], 34, 2.8, 6.6, 0.4, 2.6, null, 300),
  food("cauliflower", ["cauliflower"], 25, 1.9, 5, 0.3, 2, null, 600),
  food("cabbage", ["cabbage"], 25, 1.3, 5.8, 0.1, 2.5),
  food("kale", ["kale"], 49, 4.3, 8.8, 0.9, 3.6),
  food("spinach", ["spinach"], 23, 2.9, 3.6, 0.4, 2.2),
  food("lettuce", ["lettuce"], 15, 1.4, 2.9, 0.2, 1.3),
  food("cucumber", ["cucumber"], 15, 0.7, 3.6, 0.1, 0.5, null, 300),
  food("celery", ["celery"], 16, 0.7, 3, 0.2, 1.6, null, 40),
  food("leek", ["leek", "leeks"], 61, 1.5, 14.2, 0.3, 1.8, null, 90),
  food("peas", ["pea", "peas"], 81, 5.4, 14.5, 0.4, 5.7),
  food("green beans", ["green bean", "green beans"], 31, 1.8, 7, 0.2, 2.7),
  food("sweetcorn", ["sweetcorn", "corn"], 86, 3.2, 19, 1.2, 2.7),
  food("squash", ["squash", "butternut", "pumpkin"], 45, 1, 11.7, 0.1, 2),
  food("ginger", ["ginger"], 80, 1.8, 17.8, 0.8, 2),

  // Fruit.
  food("apple", ["apple", "apples"], 52, 0.3, 13.8, 0.2, 2.4, null, 150),
  food("banana", ["banana", "bananas"], 89, 1.1, 22.8, 0.3, 2.6, null, 120),
  food("lemon", ["lemon", "lemons"], 29, 1.1, 9.3, 0.3, 2.8, null, 85),
  food("lime", ["lime", "limes"], 30, 0.7, 10.5, 0.2, 2.8, null, 60),
  food("orange", ["orange", "oranges"], 47, 0.9, 11.8, 0.1, 2.4, null, 130),

  // Dairy and eggs.
  food("whole milk", ["whole milk", "full fat milk"], 61, 3.2, 4.8, 3.3),
  food("semi-skimmed milk", ["semi skimmed milk", "skimmed milk"], 47, 3.4, 4.8, 1.8),
  // Plant milks before plain milk, so the longer phrase wins: almond milk is a
  // quarter the calories of cow milk and matching it as "milk" would be worse
  // than not guessing at all.
  food("almond milk", ["almond milk"], 24, 0.5, 0.3, 1.1),
  food("oat milk", ["oat milk"], 45, 1, 6.7, 1.5),
  food("soya milk", ["soya milk", "soy milk"], 33, 3.3, 0.6, 1.8),
  food("milk", ["milk"], 61, 3.2, 4.8, 3.3),
  food("butter", ["butter"], 717, 0.9, 0.1, 81, null, 1.6),
  food("cheddar", ["cheddar", "cheese"], 403, 25, 1.3, 33, null, 1.8),
  food("double cream", ["double cream", "heavy cream"], 449, 1.7, 2.7, 48),
  food("yoghurt", ["yoghurt", "yogurt"], 61, 3.5, 4.7, 3.3),
  food("eggs", ["egg", "eggs"], 143, 12.6, 0.7, 9.5, null, null, 50),

  // Grains and starches.
  food("plain flour", ["flour"], 364, 10, 76, 1, 2.7),
  food("rice", ["rice"], 365, 7.1, 80, 0.7, 1.3),
  food("pasta", ["pasta", "spaghetti", "linguine", "penne", "macaroni"], 371, 13, 75, 1.5, 3.2),
  food("noodles", ["noodle", "noodles"], 138, 4.5, 25, 2.1, 1.2),
  food("bread", ["bread", "loaf", "bloomer", "baguette"], 265, 9, 49, 3.2, 2.7, 1.2),
  food("oats", ["oat", "oats", "porridge"], 389, 16.9, 66, 6.9, 10.6),
  food("couscous", ["couscous"], 376, 12.8, 77.4, 0.6, 5),

  // Pulses.
  food("lentils", ["lentil", "lentils"], 352, 24.6, 63, 1.1, 10.7),
  food("chickpeas", ["chickpea", "chickpeas"], 119, 7, 20, 2.6, 6),
  food("kidney beans", ["kidney bean", "kidney beans"], 127, 8.7, 22.8, 0.5, 6.4),
  food("baked beans", ["baked bean", "baked beans"], 78, 4.7, 12.9, 0.6, 3.7, 0.6),

  // Meat and fish.
  food("chicken breast", ["chicken"], 165, 31, 0, 3.6),
  food("beef mince", ["mince", "beef"], 137, 21, 0, 5),
  food("pork", ["pork"], 242, 27, 0, 14),
  food("bacon", ["bacon"], 541, 37, 1.4, 42, null, 2),
  food("salmon", ["salmon"], 208, 20, 0, 13),
  food("tuna", ["tuna"], 132, 28, 0, 1),
  food("tofu", ["tofu"], 76, 8, 1.9, 4.8),

  // Dried herbs and spices. Startling numbers by weight - mostly fibre and
  // concentrated oils - but you use a gram, so they barely move a portion.
  // Worth having so a recipe stops reporting them as unknown.
  food("cinnamon", ["cinnamon"], 247, 4, 81, 1.2, 53, null, 2),
  food("cumin", ["cumin"], 375, 18, 44, 22, 11),
  food("oregano", ["oregano"], 265, 9, 69, 4.3, 42),
  food("paprika", ["paprika"], 282, 14, 54, 13, 35),
  food("turmeric", ["turmeric"], 354, 8, 65, 10, 21),
  food("black pepper", ["black pepper", "peppercorn", "peppercorns"], 251, 10, 64, 3.3, 25),
  food("chilli powder", ["chilli powder", "chili powder", "chilli flakes", "gochugaru"], 282, 13, 50, 14, 35),
  food("garlic powder", ["garlic powder"], 331, 17, 73, 0.7, 9),
  food("ground ginger", ["ground ginger"], 335, 9, 72, 4.2, 14),
  food("coriander", ["coriander", "cilantro"], 298, 12, 55, 18, 42),
  food("mixed herbs", ["herbs", "thyme", "rosemary", "basil", "parsley"], 265, 9, 65, 4.3, 40),
  food("bay leaves", ["bay leaf", "bay leaves"], 313, 8, 75, 8, 26, null, 0.2),

  // Pastes and condiments.
  food("gochujang", ["gochujang"], 120, 3, 25, 1, null, 5),
  food("miso", ["miso", "doenjang"], 199, 12, 26, 6, null, 12),
  food("tomato puree", ["tomato puree", "tomato paste"], 82, 4.3, 18.9, 0.5, 4),
  food("mustard", ["mustard"], 66, 4, 5, 3.3, null, 4),
  food("ketchup", ["ketchup"], 102, 1.3, 25, 0.1, null, 2.5),
  food("stock cube", ["stock cube", "stock cubes", "bouillon"], 230, 11, 22, 11, null, null, 10),

  // Store cupboard.
  food("olive oil", ["olive oil"], 884, 0, 0, 100),
  food("oil", ["oil"], 884, 0, 0, 100),
  food("sugar", ["sugar"], 400, 0, 100, 0),
  food("honey", ["honey"], 304, 0.3, 82, 0),
  food("salt", ["salt"], 0, 0, 0, 0, null, 100),
  food("chopped tomatoes", ["chopped tomatoes", "passata", "tinned tomatoes"], 32, 1.6, 5, 0.3, 1.4),
  food("coconut milk", ["coconut milk"], 197, 2, 2.8, 21),
  food("soy sauce", ["soy sauce", "soya sauce", "tamari"], 53, 8, 4.9, 0.6, null, 16),
  food("vinegar", ["vinegar"], 21, 0, 0.9, 0),
  food("peanut butter", ["peanut butter"], 588, 25, 20, 50, 6),
];

/**
 * Finds the generic that best describes a name.
 *
 * Two rules, in order.
 *
 * **Longest phrase wins.** "Almond milk" contains "milk", and cow's milk
 * figures on almond milk would be four times the calories - worse than not
 * guessing. Two words beat one, so the specific entry always takes precedence
 * without an ordering rule anyone has to maintain.
 *
 * **Then the later word wins.** English compounds put the head noun last: rice
 * vinegar is a vinegar, not a rice. Both are single words, so length cannot
 * separate them, and taking the first match scored 45ml of rice vinegar as
 * though it were dry rice - 164 calories instead of 9.
 *
 * Words are matched whole, or "corn" finds itself inside "cornflour" and "pea"
 * inside "peanut butter".
 */
export function estimateFor(name: string): Generic | null {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;

  const haystack = ` ${words.join(" ")} `;

  let best: Generic | null = null;
  let bestLength = 0;
  let bestAt = -1;

  for (const generic of GENERICS) {
    for (const phrase of generic.words) {
      const found = haystack.indexOf(` ${phrase} `);
      if (found === -1) continue;

      const length = phrase.split(" ").length;
      if (length > bestLength || (length === bestLength && found > bestAt)) {
        best = generic;
        bestLength = length;
        bestAt = found;
      }
    }
  }

  return best;
}
