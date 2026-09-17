// A link becoming text: which links are recognised, which of the three kinds
// of writing is preferred, and what a caption file turns into.
//
//   npm run check:video
//
// Everything here is the part that runs on what came back, never the fetching
// itself. A check that calls YouTube fails on a train and passes at a desk,
// and the thing worth pinning is not "is the internet up" - it is the two
// decisions this makes on somebody's behalf.
//
// The first is which text to read. A description that lists amounts beats a
// transcript every time, because the reader can only take an amount that was
// written down and machine captions are where amounts go wrong: "two
// teaspoons" and "two tablespoons" sound the same and neither may be said at
// all. Preferring the transcript when a description exists would put invented
// numbers in front of somebody who is about to cook them.
//
// The second is what a rolling caption file says. Auto-captions repeat each
// line as they scroll, so the naive join says everything three times - and a
// transcript that repeats itself reads as a recipe with three of every step.

import {
  assemble,
  captionFromPage,
  carveFromDescription,
  carveFromPage,
  textFromHtmlBody,
  recipeLinksIn,
  recipeTextFromPage,
  chooseTrack,
  decodeEntities,
  identifyVideo,
  stripNoise,
  textFromJson3,
  textFromTimedText,
} from "../lib/video-import.ts";

let failures = 0;

function check(what, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) {
    failures += 1;
    console.error(`  ${what}`);
    console.error(`    got  ${JSON.stringify(got)}`);
    console.error(`    want ${JSON.stringify(want)}`);
  }
}

/* -- which links are a video ---------------------------------------------- */

const LINKS = [
  ["https://www.youtube.com/watch?v=gq_8e3brwJA", { host: "youtube", id: "gq_8e3brwJA" }],
  // The share sheet adds tracking and a start time; neither is the id.
  ["https://youtu.be/gq_8e3brwJA?si=AbCdEf&t=42", { host: "youtube", id: "gq_8e3brwJA" }],
  ["https://www.youtube.com/shorts/01hBjAROSs0", { host: "youtube", id: "01hBjAROSs0" }],
  ["https://m.youtube.com/watch?v=gq_8e3brwJA&list=PLxyz", { host: "youtube", id: "gq_8e3brwJA" }],
  ["https://www.youtube.com/embed/gq_8e3brwJA", { host: "youtube", id: "gq_8e3brwJA" }],
  ["https://www.youtube.com/live/gq_8e3brwJA", { host: "youtube", id: "gq_8e3brwJA" }],
  ["  https://youtu.be/gq_8e3brwJA  ", { host: "youtube", id: "gq_8e3brwJA" }],
  ["https://www.instagram.com/reel/CtMXPf7gIB0/", { host: "instagram", url: "https://www.instagram.com/reel/CtMXPf7gIB0/" }],
  ["https://instagram.com/reels/CtMXPf7gIB0", { host: "instagram", url: "https://www.instagram.com/reels/CtMXPf7gIB0" }],
  // A reel linked from inside a profile, which is what the app's own share
  // button produces.
  ["https://www.instagram.com/recipesbyanne/reel/CtMXPf7gIB0/", { host: "instagram", url: "https://www.instagram.com/recipesbyanne/reel/CtMXPf7gIB0/" }],
  // The share sheet's own link, which is a redirect and not a shortcode at
  // all. Rebuilding it as /reel/<that> produced a link to nothing and a login
  // wall - the failure that looked like Instagram refusing the app.
  ["https://www.instagram.com/share/reel/_xY123abcD/", { host: "instagram", url: "https://www.instagram.com/share/reel/_xY123abcD/" }],
  ["https://www.instagram.com/p/CtMXPf7gIB0/?img_index=1", { host: "instagram", url: "https://www.instagram.com/p/CtMXPf7gIB0/" }],
  // A mirror domain names a real post, but the fetch goes to instagram.com.
  ["https://ddinstagram.com/reel/CtMXPf7gIB0/", { host: "instagram", url: "https://www.instagram.com/reel/CtMXPf7gIB0/" }],

  // Not videos. The channel page and the search results are the two somebody
  // actually pastes by accident, and an id of the wrong length is the one that
  // would otherwise be put straight into a request.
  ["https://www.youtube.com/@CurryRecipeAcademy", null],
  ["https://www.youtube.com/results?search_query=curry", null],
  ["https://www.youtube.com/watch?v=tooshort", null],
  ["https://www.instagram.com/recipesbyanne/", null],
  ["not a url at all", null],
  ["", null],

  // Anything else public is a page that might have a recipe marked up in it.
  ["https://example.com/recipes/curry", { host: "page", url: "https://example.com/recipes/curry" }],

  // Not somewhere on the internet. This fetches addresses that arrive from
  // outside, so the ones that only this server can reach are refused - and
  // 169.254.169.254 is the cloud metadata service, which is the one that
  // matters.
  ["http://localhost:3000/admin", null],
  ["http://127.0.0.1/", null],
  ["http://169.254.169.254/latest/meta-data/", null],
  ["http://192.168.1.1/", null],
  ["http://10.0.0.5/", null],
  ["file:///etc/passwd", null],
];

for (const [link, want] of LINKS) {
  check(`identifyVideo(${JSON.stringify(link)})`, identifyVideo(link), want);
}

/* -- rolling captions ------------------------------------------------------ */

// The shape YouTube's json3 actually returns: a first event with no segs at
// all, then the words, with an aAppend event carrying only the newline that
// scrolls the window between each one.
const JSON3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1749440, id: 1 },
    { tStartMs: 2480, segs: [{ utf8: "right" }, { utf8: " we" }, { utf8: " need" }] },
    { tStartMs: 3350, aAppend: 1, segs: [{ utf8: "\n" }] },
    { tStartMs: 3360, segs: [{ utf8: "two" }, { utf8: " tablespoons" }, { utf8: " of" }] },
    { tStartMs: 4100, aAppend: 1, segs: [{ utf8: "\n" }] },
    { tStartMs: 4110, segs: [{ utf8: "curry" }, { utf8: " powder" }] },
  ],
});

check("textFromJson3 drops the rolling repeats", textFromJson3(JSON3), "right we need two tablespoons of curry powder");
check("textFromJson3 survives nonsense", textFromJson3("<html>no</html>"), "");
check("textFromJson3 survives an empty file", textFromJson3(""), "");

const TIMEDTEXT = `<?xml version="1.0" encoding="utf-8"?><transcript>
<text start="2.4" dur="4.6">right we need</text>
<text start="3.3" dur="3.7">right we need</text>
<text start="6.0" dur="2.0">two tablespoons &amp;amp; a pinch</text>
</transcript>`;

check(
  "textFromTimedText collapses a repeated line",
  textFromTimedText(TIMEDTEXT),
  "right we need two tablespoons &amp; a pinch",
);

check(
  "textFromTimedText reads the <p><s> shape too",
  textFromTimedText('<timedtext><p t="0" d="100"><s>one</s><s> onion</s></p></timedtext>'),
  "one onion",
);

// &amp;amp; is an ampersand that was encoded twice on the way out. Decoding
// &amp; last is what stops the second pass turning &amp;lt; into a tag.
check("decodeEntities unwinds in the right order", decodeEntities("salt &amp;lt;3 &quot;flaky&quot;"), 'salt &lt;3 "flaky"');

/* -- a reel's caption ------------------------------------------------------ */

const REEL_PAGE = `<html><head>
<meta property="og:title" content="Anna || Simple healthy recipes on Instagram: &quot;Boursin pasta&quot;" />
<meta property="og:description" content="13K likes, 118 comments - recipesbyanne on June 7, 2023: &quot;Boursin pasta!

Ingredients:
250g uncooked pasta
1 Boursin cheese&quot;" />
</head></html>`;

check("captionFromPage strips the like count and the quotes", captionFromPage(REEL_PAGE), {
  caption: "Boursin pasta!\n\nIngredients:\n250g uncooked pasta\n1 Boursin cheese",
  author: "Anna || Simple healthy recipes",
});

check("captionFromPage on a login wall gives nothing", captionFromPage("<html><body>Log in</body></html>"), {
  caption: "",
  author: null,
});

// The real tail of a real reel: the closing quote is not the last character,
// there is a full stop and a space after it. Checking only endsWith left the
// opening quote on the front of the recipe.
check(
  "the closing quote is found even with punctuation after it",
  captionFromPage(
    '<meta property="og:description" content="2 likes, 0 comments - anne on June 7, 2023: &quot;Boursin pasta #dinner&quot;. " />',
  ).caption,
  "Boursin pasta #dinner",
);

// The byline without a like count in front of it, which is the other shape
// Instagram serves - and the one that made a recipe called
// "baboon.amsterdam on May 28, 2025: "Craving comfort?". The emoji and the
// curly apostrophe arrive as hex references and are sixteen literal
// characters if nobody decodes them.
check(
  "the byline alone is stripped, and hex entities are characters",
  captionFromPage(
    '<meta property="og:title" content="BABOON &#x2022; KITCHENS on Instagram: &quot;x&quot;" /><meta property="og:description" content="baboon.amsterdam on May 28, 2025: &quot;Craving comfort? &#x1f35b;\ndon&#x2019;t forget the roti&quot;. " />',
  ),
  {
    caption: "Craving comfort? 🍛\ndon’t forget the roti",
    author: "BABOON • KITCHENS",
  },
);

check(
  "a caption that opens with a quote and never closes keeps it",
  captionFromPage(
    '<meta property="og:description" content="2 likes, 0 comments - anne on June 7, 2023: &quot;so-called&quot; pasta" />',
  ).caption,
  '"so-called" pasta',
);

/* -- which text is the recipe ---------------------------------------------- */

const REAL_DESCRIPTION = `My most requested curry!

Ingredients
2 tbsp vegetable oil
1 large onion, diced
500g chicken thighs

Method
1. Fry the onion.`;

// What most channels put under a video: links, a sponsor, a playlist. There
// is no recipe in here and reading it as one produces an empty draft.
const BLURB = `Today we're learning how to make Deddy's famous curry chicken!!
Subscribe: https://youtube.com/c/deddy
Instagram: @deddyskitchen
#curry #jamaican`;

check(
  "a written ingredient list is found, under headings the reader knows",
  carveFromDescription(REAL_DESCRIPTION),
  "Ingredients\n2 tbsp vegetable oil\n1 large onion, diced\n500g chicken thighs\n\nMethod\n1. Fry the onion.",
);
check("links and hashtags hold no recipe", carveFromDescription(BLURB), null);
check(
  "two amount lines are not a list - a sentence can hold a number",
  carveFromDescription("Best curry ever\n2 tbsp oil\n1 onion"),
  null,
);

// The description that made the carve necessary, shortened: the ingredients
// are in the middle and an advert is wrapped round them. Read whole, this
// produced two ingredients and fifty-five steps.
const ADVERT = `I GET A LOT OF REQUESTS FOR CURRIES!!! WANT MORE? https://www.youtube.com/playlist?list=PLxyz

CHECK OUT MY AMAZON BEST SELLING COOK BOOKS
OVER 265 REVIEWS!

The Secret to That Takeaway Curry Taste - 6.99 Get Instant Download
 https://payhip.com/b/ioc9F

HERE IS THE RECIPE FOR YOU TO SCREEN SHOT

900g of chicken thigh ( I used Aldi's )
150ml of Extra Virgin Olive Oil
2 Tej Pata
2 Large white onions (very finely chopped)
1 1/2 tsp of salt
10 cloves of chopped garlic

HAVE YOU HEARD ABOUT THE BRITISH INDIAN RESTAURANT SECRETS COURSE?

CHECK OUT THE COURSE HERE
http://curryrecipeacademy.com/sales-p`;

check(
  "the advert is carved off the recipe",
  carveFromDescription(ADVERT),
  `Ingredients
900g of chicken thigh ( I used Aldi's )
150ml of Extra Virgin Olive Oil
2 Tej Pata
2 Large white onions (very finely chopped)
1 1/2 tsp of salt
10 cloves of chopped garlic`,
);

check("a line selling something goes", stripNoise("2 tbsp oil\nSubscribe for more!\n1 onion"), "2 tbsp oil\n1 onion");
check(
  "a line with an amount stays, whatever else is on it",
  stripNoise("2 tbsp of the oil I use, link in bio"),
  "2 tbsp of the oil I use, link in bio",
);
check("a chapter list is not a method", stripNoise("0:00 Intro\n1:24 The sauce"), "");

check("the description wins when it has the amounts", assemble({
  title: "Basic Chicken Curry",
  description: REAL_DESCRIPTION,
  transcript: "all right so today we are making a curry",
}), {
  text: "Basic Chicken Curry\n\nIngredients\n2 tbsp vegetable oil\n1 large onion, diced\n500g chicken thighs\n\nMethod\n1. Fry the onion.",
  from: "description",
});

const spoken = assemble({
  title: "Jamaican Curry Chicken",
  description: BLURB,
  transcript: "first you season the chicken. then you fry it off.",
});
check("a blurb falls through to what was said", spoken?.from, "transcript");
check(
  "the transcript is broken into lines, because the reader works in lines",
  spoken?.text,
  "Jamaican Curry Chicken\n\nfirst you season the chicken.\nthen you fry it off.",
);

check("a caption beats everything - it is what the cook typed", assemble({
  title: "Reel",
  caption: "Boursin pasta\n250g pasta",
  description: REAL_DESCRIPTION,
  transcript: "hello everyone",
}).from, "caption");

check("a blurb with no captions is still better than nothing", assemble({
  title: "Curry",
  description: BLURB,
}).from, "description");

check("nothing written anywhere is nothing", assemble({ title: "Curry" }), null);

/* -- the recipe on a linked page ------------------------------------------- */

// How a food blog actually ships it: one ld+json block, a @graph of a dozen
// nodes describing the site and the author, and the recipe somewhere inside.
// Instructions arrive as HowToStep objects and the amounts as the strings a
// person typed, which is what readRecipeText already reads.
const RECIPE_PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"Evergreen Kitchen"},
 {"@type":"Person","name":"Somebody"},
 {"@type":["Recipe","NewsArticle"],"name":"Easy Halloumi Curry","recipeYield":["4","4 servings"],
  "recipeIngredient":["2½ tablespoons grapeseed oil, divided","1 medium yellow onion, diced ((1½ cups))","4 to 6 tablespoons curry paste ((see note 1))"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Cut the halloumi into 2cm cubes."},{"@type":"HowToStep","text":"Fry until <b>golden</b>."}]}
]}</script>
</head></html>`;

check(
  "the recipe is found inside a @graph and written back out as text",
  recipeTextFromPage(RECIPE_PAGE),
  `Easy Halloumi Curry

Serves 4

Ingredients
2½ tablespoons grapeseed oil, divided
1 medium yellow onion, diced (1½ cups)
4 to 6 tablespoons curry paste (see note 1)

Method
Cut the halloumi into 2cm cubes.
Fry until golden.`,
);

// The other two legal shapes for instructions. A reader that handles only
// HowToStep gets an empty method from half the internet.
check(
  "steps as bare strings and as a section both read",
  recipeTextFromPage(`<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["1 onion"],"recipeInstructions":[{"@type":"HowToSection","name":"For the sauce","itemListElement":[{"@type":"HowToStep","text":"Simmer it."}]},"Serve."]}</script>`),
  `X

Ingredients
1 onion

Method
Simmer it.
Serve.`,
);

check(
  "a page with no recipe in it says so rather than inventing one",
  recipeTextFromPage("<html><script type=\"application/ld+json\">{\"@type\":\"Article\",\"name\":\"X\"}</script></html>"),
  null,
);

check(
  "one unparseable block does not lose the recipe in the next one",
  recipeTextFromPage(`<script type="application/ld+json">{ this is not json }</script><script type="application/ld+json">{"@type":"Recipe","name":"Y","recipeIngredient":["2 eggs"]}</script>`),
  `Y

Ingredients
2 eggs`,
);

/* -- a page whose markup is a shell --------------------------------------- */

// Squarespace declares a Recipe with an empty recipeIngredient and types the
// list into the page body, so a reader that trusts the markup finds a recipe
// with nothing in it. The body is the fallback, and it has to be carved by its
// own headings rather than by the longest run of amounts: a real page has the
// pickles, then the sauce, then the burger, and the longest run is one of the
// three. That is how a burger recipe came back with nine ingredients.
const BODY = `Share & Save

Ingredients
Homemade Dill Pickles:
5 pickling cucumbers, thinly sliced
1 cup (240mL) white distilled vinegar
2 Tbsp (25g) granulated sugar
Homemade Burger Sauce:
3/4 cup (180g) mayonnaise
1 tsp (4g) granulated sugar
Pinch of MSG

Directions
Homemade Dill Pickles:
In a small saucepan, combine the vinegar, water and sugar.
Pack the cucumber slices into a clean heat-proof jar.

Comments & Ratings
Already have an account? Sign in`;

check(
  "every section is kept, and the page's furniture is not",
  carveFromPage(BODY),
  `Ingredients
Homemade Dill Pickles:
5 pickling cucumbers, thinly sliced
1 cup (240mL) white distilled vinegar
2 Tbsp (25g) granulated sugar
Homemade Burger Sauce:
3/4 cup (180g) mayonnaise
1 tsp (4g) granulated sugar
Pinch of MSG

Method
Homemade Dill Pickles:
In a small saucepan, combine the vinegar, water and sugar.
Pack the cucumber slices into a clean heat-proof jar.`,
);

check(
  "the word Ingredients with no list under it is not a recipe",
  carveFromPage(`Ingredients
Coming soon

Comments`),
  null,
);

check(
  "block tags become the line breaks the carve works in",
  textFromHtmlBody("<nav>Recipes</nav><h2>Ingredients</h2><ul><li>1 onion</li><li>2 eggs</li></ul><script>var x = 1</script>"),
  `Ingredients
1 onion
2 eggs`,
);

/* -- which link in a description is the recipe ----------------------------- */

const DESCRIPTION_WITH_LINKS = `This easy Halloumi Curry is made with coconut milk.

Get the recipe here: https://evergreenkitchen.ca/halloumi-curry/

Subscribe: https://www.youtube.com/c/somebody
Instagram: https://www.instagram.com/somebody
My knives: https://amzn.to/3xyz`;

check(
  "the cook's own site is the link worth following",
  recipeLinksIn(DESCRIPTION_WITH_LINKS),
  ["https://evergreenkitchen.ca/halloumi-curry/"],
);

check(
  "a full stop ending the sentence is not part of the address",
  recipeLinksIn("Recipe at https://example.com/curry."),
  ["https://example.com/curry"],
);

check(
  "a link into this network is not followed",
  recipeLinksIn("see http://169.254.169.254/latest/meta-data/ and http://localhost/admin"),
  [],
);

/* -- which caption track --------------------------------------------------- */

check("a typed track beats an auto-generated one", chooseTrack([
  { baseUrl: "a", languageCode: "en", kind: "asr" },
  { baseUrl: "b", languageCode: "en" },
])?.baseUrl, "b");

check("English beats a language this app cannot read", chooseTrack([
  { baseUrl: "a", languageCode: "hi" },
  { baseUrl: "b", languageCode: "en", kind: "asr" },
])?.baseUrl, "b");

check("an auto track is taken when it is all there is", chooseTrack([
  { baseUrl: "a", languageCode: "hi", kind: "asr" },
])?.baseUrl, "a");

check("no tracks is null, not a crash", chooseTrack([]), null);

if (failures > 0) {
  console.error(`\n${failures} problem${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("video import: links recognised, rolling captions collapsed, written text preferred.");
