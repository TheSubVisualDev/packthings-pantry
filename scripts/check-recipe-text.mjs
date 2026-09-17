// Checks the reader that turns a pasted wall of text into a recipe.
//
//   npm run check:recipe-text
//
// Every line of this is a guess, so the cases are chosen by how expensive the
// guess is to get wrong. A missed note costs nothing - it sits in the editor
// waiting to be typed. A wrong quantity is the one that matters, because it
// looks right and gets cooked, so the cases that matter most here are the ones
// where a number appears somewhere that is not the amount:
//
//   "1 onion (about 150g)"   - the brackets are not the quantity
//   "2 x 400g tins"          - two numbers, both meaningful, neither 800
//   "Serves 4"               - not an ingredient called Serves
//
// The second thing being defended is that the reader never invents an amount.
// A line it cannot read comes back unmeasured with the original words kept, so
// a person sees an obviously incomplete line rather than a confidently wrong
// one.

import { readIngredientLine, readRecipeText } from "../lib/recipe-text.ts";

let failures = 0;
function check(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`  ${what}\n    expected ${b}\n    got      ${a}`);
  }
}

/** One line, with the fields that were actually set. */
function line(text) {
  const read = readIngredientLine(text, []);
  if (!read) return null;
  return read;
}

/* --- the ordinary shapes --- */

check("weight", line("100g chorizo sausage"), {
  item_name: "Chorizo sausage",
  quantity: 100,
  unit: "g",
});

check("a space before the unit", line("300 ml double cream"), {
  item_name: "Double cream",
  quantity: 300,
  unit: "ml",
});

check("the unit spelled out", line("2 tablespoons olive oil"), {
  item_name: "Olive oil",
  quantity: 2,
  unit: "tbsp",
});

check("a bare count", line("2 onions"), {
  item_name: "Onions",
  quantity: 2,
  unit: "count",
});

// A unit with no number in front of it means one of them.
check("an implied one", line("tbsp vegetable oil"), {
  item_name: "Vegetable oil",
  quantity: 1,
  unit: "tbsp",
});

check("a bullet", line("- 500g plain flour"), {
  item_name: "Plain flour",
  quantity: 500,
  unit: "g",
});

check("a numbered list", line("1. 500g plain flour"), {
  item_name: "Plain flour",
  quantity: 500,
  unit: "g",
});

/* --- the note, which is everything after the comma --- */

check("a preparation note", line("100g chorizo sausage, diced"), {
  item_name: "Chorizo sausage",
  quantity: 100,
  unit: "g",
  note: "diced",
});

check("brackets are a note", line("2 cloves garlic (crushed)"), {
  item_name: "Garlic",
  quantity: 2,
  unit: "count",
  note: "cloves, crushed",
  approx: true,
});

check("optional", line("1 red pepper (optional)"), {
  item_name: "Red pepper",
  quantity: 1,
  unit: "count",
  optional: true,
});

check("optional after a comma", line("50g parmesan, optional"), {
  item_name: "Parmesan",
  quantity: 50,
  unit: "g",
  optional: true,
});

/* --- numbers that are not the amount --- */

// The expensive one. Reading the brackets as the quantity cooks 150 onions.
check("a number in the brackets", line("1 onion (about 150g)"), {
  item_name: "Onion",
  quantity: 1,
  unit: "count",
  note: "about 150g",
});

// Two numbers, both meaningful. Flattening this to 800g loses the fact that
// you buy them in tins, which is the thing the shopping list needs to know.
check("the x shape", line("2 x 400g tins chopped tomatoes"), {
  item_name: "Chopped tomatoes",
  quantity: 2,
  unit: "tin",
  pack_size: 400,
  pack_unit: "g",
});

check("the x shape with of", line("2 x 300g packs of fresh tortellini"), {
  item_name: "Fresh tortellini",
  quantity: 2,
  unit: "pack",
  pack_size: 300,
  pack_unit: "g",
});

// The same thing with the x left out, which is just as common.
check("the x left out", line("2 400g tins chopped tomatoes"), {
  item_name: "Chopped tomatoes",
  quantity: 2,
  unit: "tin",
  pack_size: 400,
  pack_unit: "g",
});

// A weight followed by a word starting with a digit must NOT look for a pack
// size: "100 g" has no second number and going looking for one is how a
// parser reads the next ingredient as this one's packaging.
check("no pack hunting after a weight", line("100g chorizo"), {
  item_name: "Chorizo",
  quantity: 100,
  unit: "g",
});

/* --- fractions and ranges --- */

check("a written fraction", line("1/2 tsp salt"), {
  item_name: "Salt",
  quantity: 0.5,
  unit: "tsp",
});

check("a vulgar fraction", line("½ tsp salt"), {
  item_name: "Salt",
  quantity: 0.5,
  unit: "tsp",
});

check("a mixed number", line("1 1/2 tbsp honey"), {
  item_name: "Honey",
  quantity: 1.5,
  unit: "tbsp",
});

check("a mixed vulgar number", line("1½ tbsp honey"), {
  item_name: "Honey",
  quantity: 1.5,
  unit: "tbsp",
});

// A range takes its first number, not its middle. "2-3 cloves" means two will
// do; asking for 2.5 cloves is a precision the writer deliberately avoided.
check("a range", line("2-3 cloves of garlic"), {
  item_name: "Garlic",
  quantity: 2,
  unit: "count",
  note: "cloves",
  approx: true,
});

/* --- the writer estimating, said out loud --- */

check("a large onion", line("1 large brown onion, diced"), {
  item_name: "Brown onion",
  quantity: 1,
  unit: "count",
  note: "large, diced",
  approx: true,
});

check("a tilde somebody typed", line("~70g brown onion"), {
  item_name: "Brown onion",
  quantity: 70,
  unit: "g",
  approx: true,
});

check("about", line("about 200g mushrooms"), {
  item_name: "Mushrooms",
  quantity: 200,
  unit: "g",
  approx: true,
});

check("a handful", line("a handful of fresh basil"), {
  item_name: "Fresh basil",
  unit: "some",
  note: "handful",
});

/* --- no amount at all, which is an answer --- */

check("to taste", line("Salt to taste"), {
  item_name: "Salt",
  unit: "some",
  note: "to taste",
});

check("for frying", line("Vegetable oil, for frying"), {
  item_name: "Vegetable oil",
  unit: "some",
  note: "for frying",
});

// A bare noun is a real ingredient with a real absence of an amount. Inventing
// a 1 here would be the app making something up.
check("a bare noun", line("Black pepper"), {
  item_name: "Black pepper",
  unit: "some",
});

/* --- units this pantry does not keep --- */

const converted = [];
check("ounces", readIngredientLine("8 oz cream cheese", converted), {
  item_name: "Cream cheese",
  quantity: 226.8,
  unit: "g",
});
check("the conversion is reported", converted.length, 1);

check("cups", line("2 cups milk"), {
  item_name: "Milk",
  quantity: 480,
  unit: "ml",
});

check("pounds", line("1 lb beef mince"), {
  item_name: "Beef mince",
  quantity: 453.6,
  unit: "g",
});

/* --- a whole paste --- */

const WHOLE = `Creamy Tomato Tortellini
A weeknight favourite.
Serves 4 | Prep 10 mins | Cook 25 mins

Ingredients
2 x 300g packs fresh tortellini
300ml double cream
100g chorizo sausage, cut lengthways into 4 strips then diced
1 large brown onion, diced
2 x 400g tins chopped tomatoes
1 tbsp vegetable oil, for frying
1 red pepper, cut into bite-sized pieces (optional)
Salt and pepper to taste

Method
1. Heat the oil in a saucepan over a medium heat and fry the onion until soft.
2. Add the chorizo to the saucepan, then add the tortellini to a pot and cover with boiling water.
3. Stir through the cream and season.`;

const whole = readRecipeText(WHOLE);
check("the title", whole.document.name, "Creamy Tomato Tortellini");
check("the blurb", whole.document.description, "A weeknight favourite.");
check("servings", whole.document.base_servings, 4);
check("prep", whole.document.prep_minutes, 10);
check("cook", whole.document.cook_minutes, 25);
// Eight written lines, but salt and pepper are two things.
check("ingredient count", whole.document.ingredients.length, 9);
check("step count", whole.document.steps.length, 3);
// The numbering is stripped: "1." is the list, not the instruction.
check(
  "the first step",
  whole.document.steps[0].body.startsWith("Heat the oil"),
  true,
);
check("nothing went unread", whole.unread, []);

// "Serves 4 | Prep 10 mins | Cook 25 mins" must not become an ingredient.
check(
  "metadata is not an ingredient",
  whole.document.ingredients.some((l) => /serves|prep|cook/i.test(l.item_name)),
  false,
);

/* --- a paste with no headings at all, out of a chat --- */

const BARE = `Garlic Butter Pasta
400g spaghetti
50g butter
4 cloves garlic, sliced
Salt and pepper

Cook the spaghetti in salted boiling water until al dente.
Melt the butter in a pan and soften the garlic without colouring it.
Toss the drained pasta through the butter and season well.`;

const bare = readRecipeText(BARE);
check("bare: the title", bare.document.name, "Garlic Butter Pasta");
check("bare: ingredients", bare.document.ingredients.length, 5);
check("bare: steps", bare.document.steps.length, 3);
// No count anywhere, so it says so rather than pretending it knew.
check("bare: assumed servings", bare.document.base_servings, 4);
check(
  "bare: and said so",
  bare.notes.some((note) => /assumed 4/i.test(note)),
  true,
);

/* --- sections --- */

const SECTIONED = `Lasagne
Serves 6

For the sauce
2 x 400g tins chopped tomatoes
1 onion, diced

For the topping
250g mascarpone
50g parmesan

Method
Fry the onion, add the tomatoes and simmer for twenty minutes.
Layer it up and bake.`;

const sectioned = readRecipeText(SECTIONED);
check("sections are kept", sectioned.document.ingredients[0].section, "For the sauce");
check("the second section", sectioned.document.ingredients[2].section, "For the topping");
check("sectioned: ingredients", sectioned.document.ingredients.length, 4);
check("sectioned: steps", sectioned.document.steps.length, 2);

/* --- nothing at all --- */

const empty = readRecipeText("   \n\n  ");
check("empty stays empty", empty.document, {});


/* --- a real recipe that broke all of this at once --- */

/**
 * Pasted from a website, and every assumption in here failed on it.
 *
 * No headings. A zero-width space used as a spacer, which String.trim does not
 * remove - so a "blank" line arrived as a line, became an ingredient called
 * nothing, pushed the blurb into the method, latched the reader into step mode
 * and turned every ingredient after it into an instruction. "bake for about 40
 * minutes" was read as a recipe for forty people. "Tablespoon of poppy seeds"
 * found no unit because the patterns were lower-case only. And the method was
 * one paragraph, which is one step to anything looking for line breaks.
 */
const CAKE = [
  "LEMON & ALMOND CAKE",
  "",
  "\u200B",
  "",
  "Baked for the recent Yoga & Creativity day retreat, this moist, zesty cake is perfect with a cup of fresh mint tea. Tastes good made with orange as an alternative to lemon.",
  "",
  "\u200B",
  "",
  "2 large, un-waxed lemons or a large orange",
  "",
  "6 eggs",
  "450g ground almonds",
  "",
  "250g sugar",
  "",
  "1 teaspoon of baking powder",
  "",
  "Tablespoon of poppy seeds",
  "",
  "\u200B",
  "",
  "Preheat oven to 180c/350f/gas mark 4. Wash lemons, cover with water and gently boil for one hour. Cool and remove the pips with a fork then blend to a pulp. Beat eggs in a large bowl. Add the remaining ingredients. Mix thoroughly, pour into a lined 20cm spring base cake tin and bake for about 40 minutes or until cooked. Cool in the tin before turning out.",
].join("\n");

const cake = readRecipeText(CAKE);

check("cake: the title", cake.document.name, "LEMON & ALMOND CAKE");

// The blurb is prose before any ingredient, which cannot be a method step -
// a method does not begin before the shopping list.
check(
  "cake: the blurb is the blurb",
  String(cake.document.description).startsWith("Baked for the recent"),
  true,
);

// "bake for about 40 minutes" is a cooking time standing near the word "for".
check("cake: not forty servings", cake.document.base_servings, 4);
check(
  "cake: and it says it guessed",
  cake.notes.some((note) => /assumed 4/i.test(note)),
  true,
);

// Six written lines, six ingredients, nothing dropped and nothing invented.
check("cake: ingredient count", cake.document.ingredients.length, 6);
check("cake: nothing unread", cake.unread, []);

// The comma here is punctuation inside the name, not the start of an
// instruction: splitting on it leaves only the word "large".
check("cake: the lemons survive", cake.document.ingredients[0], {
  item_name: "Un-waxed lemons or a large orange",
  quantity: 2,
  unit: "count",
  note: "large",
  approx: true,
});

// A unit at the start of a sentence is capitalised, and means one of them.
check("cake: a capitalised unit", cake.document.ingredients[5], {
  item_name: "Poppy seeds",
  quantity: 1,
  unit: "tbsp",
});

check("cake: grams read", cake.document.ingredients[2], {
  item_name: "Ground almonds",
  quantity: 450,
  unit: "g",
});

// One paragraph, seven instructions.
check("cake: the method is cut up", cake.document.steps.length, 7);
check("cake: first step", cake.document.steps[0].body, "Preheat oven to 180c/350f/gas mark 4.");
check(
  "cake: last step",
  cake.document.steps[6].body,
  "Cool in the tin before turning out.",
);

// An oven temperature is not a sentence boundary, and neither is a decimal.
check(
  "cake: 180c/350f stayed together",
  cake.document.steps[0].body.includes("350f/gas mark 4"),
  true,
);

/* --- a writer who broke their own method into lines is not second-guessed --- */

const NUMBERED = `Quick Eggs
2 eggs
1 tbsp butter

Method
1. Melt the butter.
2. Beat the eggs. Season them well.
3. Cook gently, stirring. Serve at once.`;

const numbered = readRecipeText(NUMBERED);
// Three written steps stay three, even though two of them hold two sentences.
check("a numbered method is left alone", numbered.document.steps.length, 3);
check(
  "including its multi-sentence steps",
  numbered.document.steps[1].body,
  "Beat the eggs. Season them well.",
);

/* --- the headline time, which most handwritten recipes give instead of two --- */

// "Serves 6. Takes 40 minutes." came out of the importer as ingredient number
// one, called "Serves 6. Takes 40 minutes.", with the time thrown away: the
// residue test did not know the word "takes", so the line read as part
// metadata and part something else, and something else means ingredient.
const HEADLINE = `Throwaway Test Loaf

Serves 6. Takes 40 minutes.

200g plain flour
2 tsp baking powder

Sift the flour and baking powder together.`;

const headline = readRecipeText(HEADLINE);
check("headline: servings read", headline.document.base_servings, 6);
check("headline: the time is kept", headline.document.cook_minutes, 40);
check("headline: and is not an ingredient", headline.document.ingredients.length, 2);
check(
  "headline: the first ingredient is an ingredient",
  headline.document.ingredients[0].item_name,
  "Plain flour",
);

for (const [line, minutes] of [
  ["Ready in 1 hr 15", 75],
  ["Total time: 25 mins", 25],
  ["Takes about 90 minutes", 90],
  ["45 minutes in total", 45],
]) {
  const read = readRecipeText(`Test\n\n${line}\n\n200g flour\n\nMix it.`);
  check(`headline: "${line}"`, read.document.cook_minutes, minutes);
  check(`headline: "${line}" left no ingredient`, read.document.ingredients.length, 1);
}

// A duration inside an instruction is not the recipe's total. A stew that
// says "bake for 30 minutes" halfway through takes longer than half an hour.
const INSIDE = `Test

200g flour

Mix it. This takes about 20 minutes.
Bake for 30 minutes.`;
const inside = readRecipeText(INSIDE);
check("a duration inside a step is not the total", inside.document.cook_minutes, undefined);
check("and the step survives", inside.document.steps.length, 3);

/* --- what the 14 Sep audit found, so it cannot come back --- */

// A prep line was claiming the cooking slot, because readTotalMinutes had a
// bare "time" in its word list and matched "Prep time: 15 minutes". The real
// "Cook time: 35 mins" underneath was then discarded as a duplicate. Shipped
// in the same commit that added this file's headline-time cases, none of which
// had both a prep line and a cook line in them.
const BOTH = readRecipeText(
  "Test Stew\n\nPrep time: 15 minutes\nCook time: 35 mins\n\n200g beef\n\nSimmer the beef.",
);
check("prep and cook are read separately", BOTH.document.prep_minutes, 15);
check("and the cook line wins its own slot", BOTH.document.cook_minutes, 35);

// A headline time must not outrank a specific line that has not been read yet.
const LATE = readRecipeText(
  "Test\n\nTotal: 50 minutes\nCook time: 35 mins\n\n200g beef\n\nSimmer it.",
);
check("a later cook time beats an earlier total", LATE.document.cook_minutes, 35);

// A numbered method, hard-wrapped, which is what copying off a blog gives you.
// Every physical line used to become its own instruction, so eight steps came
// out as eleven, cut mid-word.
const WRAPPED = readRecipeText(`Chicken Thing

200g chicken
1 onion

1. Heat the oil in a large pot over medium-high heat. Season the
chicken and brown it on all sides, about 5 minutes.
2. Remove the chicken and set aside. Add the onion and cook until
softened, around 8 minutes.
3. Return the chicken to the pot and simmer for 20 minutes.`);
check("a wrapped numbered method keeps its count", WRAPPED.document.steps.length, 3);
check(
  "and its sentences are whole",
  WRAPPED.document.steps[0].body.endsWith("about 5 minutes."),
  true,
);

// An unnumbered method has had its steps chosen by whoever wrote it.
const PLAIN = readRecipeText(
  "T\n\n200g beef\n\nBrown the beef.\nAdd the onion.\nSimmer for an hour.",
);
check("an unnumbered method is left alone", PLAIN.document.steps.length, 3);

// A headnote wrapped over several lines was arriving as a description cut off
// mid-sentence plus the other half of that sentence in "notes", which is the
// field labelled what happened last time you made it.
const BLURB = readRecipeText(`Weeknight Chicken

I make this at least twice a month - it's the kind of thing you can throw
together after work with stuff that's basically always in the cupboard.
My mother-in-law swears by adding a bay leaf.

200g chicken
1 onion

Brown the chicken, then add the onion.`);
check("a wrapped headnote stays in one piece", BLURB.document.description.endsWith("bay leaf."), true);
check("and none of it leaks into notes", BLURB.document.notes, undefined);
check("and none of it is read as food", BLURB.document.ingredients.length, 2);
check("brown the X is a step", BLURB.document.steps.length, 1);

// ...but brown is still a colour on an ingredient line.
const BROWN = readRecipeText(
  "Sugar Test\n\n200g brown sugar\n100g brown rice\n1 brown onion\n\nMix it all.",
);
check("brown sugar is still shopping", BROWN.document.ingredients.length, 3);

// Size and portion words were being taken as the name, so the shelf was
// searched for "Inch piece of ginger". A live recipe already holds
// "Teaspoon of cinnamon" from this.
for (const [line, name] of [
  ["1-inch piece of ginger, grated", "Ginger"],
  ["1 teaspoon of cinnamon", "Cinnamon"],
  ["2 cloves of garlic, minced", "Garlic"],
  ["a pinch of salt", "Salt"],
  ["1 knob of butter", "Butter"],
  ["400g tin of chopped tomatoes", "Chopped tomatoes"],
  ["1 bunch of parsley", "Parsley"],
  ["2 sticks celery", "Celery"],
  ["1 slice of bread", "Bread"],
]) {
  const read = readRecipeText(`T\n\n${line}\n\nMix it.`);
  check(`name from "${line}"`, read.document.ingredients[0].item_name, name);
}

// A measure word with nothing after it is a bad name, but it is the one the
// writer chose. Inventing a better one out of nothing is worse.
const BARE_MEASURE = readRecipeText("T\n\nPiece\n\nMix it.");
check("a bare measure word is kept", BARE_MEASURE.document.ingredients[0].item_name, "Piece");

/* --- a recipe written in parts, off a reel --- */

// The shape that broke it: a caption with two ingredient lists under their own
// sub-headings, one long line in the first, and the method at the bottom. The
// long line was judged an instruction on word count alone, the first
// instruction latches the reader into method mode, and everything after it -
// the whole second list - came out as steps. The method of the recipe was a
// list of its own ingredients.
const IN_PARTS = [
  "POV: One-Pot Lazy Ramen",
  "You'll need (Serves 1-2):",
  "For the broth:",
  "1 tbsp red curry paste",
  "2 cups chicken stock",
  "For the mince:",
  "1/2 pack (~250g) lean mince of choice (OR shredded tofu for a vegetarian version)",
  "1 tbsp oyster sauce",
  "1 tbsp dark soy sauce",
  "*Food Safety Note: always use clean, uncracked eggs and bring the broth to a rolling boil.",
  "Method:",
  "Cook the mince until browned.",
  "Pour in the stock and bring to a boil.",
].join("\n");

const parts = readRecipeText(IN_PARTS);

check(
  "a long ingredient line does not become the method",
  parts.document.ingredients.map((each) => each.item_name),
  ["Red curry paste", "Chicken stock", "Lean mince of choice", "Oyster sauce", "Dark soy sauce"],
);

check(
  "the second list keeps its own section",
  parts.document.ingredients.map((each) => each.section ?? null),
  ["For the broth", "For the broth", "For the mince", "For the mince", "For the mince"],
);

check(
  "the method is the method",
  parts.document.steps.map((each) => each.body),
  ["Cook the mince until browned.", "Pour in the stock and bring to a boil."],
);

// The heading carries the only serving count in the caption, and reading it as
// a heading used to throw it away - so a recipe for one or two was silently
// assumed to feed four.
// 1 rather than 2: "Serves 1-2" is a range, and a range takes its first
// number everywhere in this reader - the same rule that reads "2-3 cloves" as
// two. What is being checked is that the number survives the heading at all,
// instead of the recipe being silently assumed to feed four.
check("the serving count survives its heading", parts.document.base_servings, 1);

// A paragraph about eggs, labelled as a note and written as a sentence. With
// no bare "Notes" line above it, it became an ingredient named after its own
// first clause.
check(
  "a note written as a sentence is a note",
  (parts.document.notes ?? "").startsWith("always use clean"),
  true,
);

// The counter-case for the leading-amount rule: a numbered step is still a
// step. "1. Heat the oil" counts instructions, "1.5 tbsp butter" measures
// butter, and one character separates them.
const NUMBERED_STEPS = readRecipeText(
  ["Curry", "", "1.5 tbsp butter", "2 onions", "", "1. Heat the oil.", "2. Add the onions."].join("\n"),
);
check(
  "a numbered step is not an ingredient",
  NUMBERED_STEPS.document.steps.map((each) => each.body),
  ["Heat the oil.", "Add the onions."],
);
check(
  "and the amounts above it are still ingredients",
  NUMBERED_STEPS.document.ingredients.map((each) => each.item_name),
  ["Butter", "Onions"],
);

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("recipe text: all good");
