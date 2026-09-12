# Phase 5 — the app follows you through the trip

Scoped 12 Sep 2026 from Luna's list, while the redesign is out with Claude
Design. Phase 4's spine was *the app should have an opinion*. This one is:

> **The app should follow you through the trip.** Tonight, the walk to the
> shop, the checkout, the walk home, the stove. Today each of those is a
> separate screen you navigate to. They are one continuous thing and the app
> should behave like it knows that.

Luna's own account of using it, which is the acceptance test for P1:

> I'm walking to the shop, open the app. If Tonight takes my fancy I pick that
> and pin the shopping list, otherwise I scroll Discover to grab a recipe. Buy
> my stuff, check out — either just check off "I've bought these" or scan the
> receipt to add the ingredients plus whatever else I bought. Get home, "start
> cooking" should be ready and waiting. Goes into cooking, with read-aloud of
> each step and voice for "next step", "previous step", "step 4".

---

## Where it got to, 12 Sep 2026

Built, in this order: **P1** the trip, **P4** the product split with ratings
and receipt prices, **P5** the stats screen, **P9** print, **P8** auto-tagging
widened to method and meal, **P6** the Discover ranking. **P2** arrived with
the design pass as the vessel control.

**P3 (hands-free) is not built.** Luna: "speech synthesis was undiscussed
please don't add this." The read-aloud and voice-command work was reverted
before it was committed; nothing of it is in the tree.

**P7 (social with something to do) is the open one**, and the roadmap says to
ask before building it. The question to answer first is which of these is
wanted: a cook on somebody else's recipe telling them, a feed of cooks rather
than of posts, or neither.

Also still outstanding from phase 4: **M9, receipt scanning quality.** It has
a new reason to happen - the scanner now keeps prices, so anything it reads
badly is a wrong price as well as a wrong line.

---

## The one refactor, and it is forced

`products.barcode` is a **global** primary key, but the row also carries
`kitchen_id` and `item_id`. So two kitchens scanning the same tin of beans get
one row, and whoever scanned last owns it — their mapping silently replaces the
other's. That is already a bug; it has just never fired because there is one
active household.

P4 forces the decision, because "which baked bean is best" is a question about
a barcode across *everyone*, and the current table cannot hold both a shared
fact and a private mapping. The split is small and additive:

- **`products`** keyed by barcode stays, but holds only what is true of the
  product everywhere: name, brand, pack size, nutrition. It belongs to nobody.
- **`kitchen_products`** (`kitchen_id`, `barcode`) holds what one kitchen
  decided: which `item_id` it maps to, when they last saw it.

`items` and the scanner's behaviour are untouched. Follow the `AGENTS.md`
routine and keep `products.kitchen_id`/`item_id` frozen in place rather than
dropping them, the way `items.category` was.

**Everything else in this phase needs no schema rewrite**, and two things that
sound like they would already have a home:

- The three-layer model — generic food → pantry item → barcoded product —
  exists. `lib/generic-nutrition.ts`, `items`, `products`. Nothing has ever
  *surfaced* the product layer, which is the whole of P4.
- Saved / authored / adopted are already three distinct states:
  `recipe_likes`, `recipes.author_id`, `cookbook`. P6's ranking can read them
  today.

---

## P1 · The trip — about two days

**The spine, and the thing to build first.**

- **Pin the list.** Choosing a recipe on Tonight pins its shortfall as the
  live list. A pinned list survives leaving the app and is the first thing on
  screen when you come back to it in a shop.
- **Checkout, two ways.** "Got everything" as one button, or scan the receipt.
  The receipt path should *reconcile* against the list rather than ignoring it:
  matched lines tick themselves off, everything else is new stock. That is the
  receipt review sheet (`docs/DESIGN-BRIEF.md` item 2) doing one more job.
- **Come home to a ready button.** If a recipe is pinned and its shortfall is
  now bought, the app opens on **Start cooking**. No navigating.
- The pinned recipe is one row — `kitchen_id`, `recipe_id`, `pinned_at` — not a
  state machine. Anything that needs a machine here is over-built.

## P2 · Sliders instead of sums — about a day

**"How full is the soy sauce?" is a picture, not a number.**

Luna's point, and the best friction idea in the list: the app asks for numbers
nobody has. Nobody knows they have 320ml of soy sauce; they know the bottle is
about two-thirds.

**This needs no schema at all.** `pack_size` and `quantity` already exist, and
`openFraction()` in `lib/containers.ts` already turns them into a fraction. A
slider drawn as the actual container writes `quantity = fraction × pack_size`.

- Packaged things get a container slider; the number becomes the *result*, not
  the input, and stays visible for anyone who wants it.
- Loose things (flour, rice) get a coarse slider — full / most / half / low /
  nearly out — mapping onto the same field.
- Counted things keep steppers. A slider for "3 onions" would be silly.
- It should reduce how many numbers are on screen, not add a control beside
  them. If both survive, this failed.

## P3 · Cooking hands-free — about a day and a half

**Read the step out; take "next" as a word.**

- **Read-aloud** uses `speechSynthesis`, which is solid everywhere including
  iOS Safari. Per-step, with a play/stop control and the step highlighted as
  it reads.
- **Voice commands** — "next step", "back", "step four", "repeat", "how much
  tofu" — use `SpeechRecognition`, and this is the honest caveat: on iOS Safari
  it is `webkitSpeechRecognition`, it does not listen continuously, and it can
  require a fresh tap per utterance. **Prototype that one specific thing before
  committing to the design**, and have a fallback that is genuinely good rather
  than a consolation: a huge full-width "next" target, and the existing
  keep-screen-awake toggle.
- Whatever happens with voice, the read-aloud alone is most of the value.

## P4 · Which baked bean — about a day and a half

**Aldi vs Lidl vs Tesco, answered from your own history.**

After the refactor above, `product_ratings` (`barcode`, `user_id`, `rating`,
optional note) aggregates across everyone who has ever scanned that barcode.
That is the "best baked bean" table, and it is three columns.

- Rate a product where you meet it: after cooking with it, or from the item
  page's list of barcodes you have bought under that row.
- The item page becomes the comparison: "Baked beans — you have bought 4 kinds"
  with brand, price-per-100g where known, nutrition, and your rating.
- Open Food Facts already supplies brand and nutrition, so most of the compare
  table fills itself.
- **Price is the missing column**, and the receipt scanner already reads prices
  it currently throws away. Capturing them is what makes this a real answer
  rather than a preference poll.

## P5 · Nerd stats — about a day

**Letterboxd for a kitchen.**

The data is already there and unread: `cook_events` since phase 1, ratings,
nutrition, tags, shopping history.

Worth building, roughly in order of how often anybody would look:
what you actually cook (frequency, the long tail you never repeat), the year
in food, waste — things that expired unused, which is the number this app is
really for — cuisine mix from recipe tags, and cost per cook once P4 has
prices.

Two rules: **every number is clickable through to the thing it counts**, and
nothing is shown that needs more data than this kitchen has. A stats page full
of zeroes in month one is worse than a stats page that arrives in month three.
Load the `dataviz` skill before drawing any of it.

## P6 · Discover that knows you — about a day and a half

**Currently a reverse-chronological list of everything visible.**

- Rank on what phase 4 already computes: readiness against *your* stock,
  fatigue, your tags, what people you follow adopted — not just liked.
  **Adopting is the strong signal** and nothing reads it yet.
- **Show your own recipes there**, marked as yours. Luna asked for this
  specifically, and it is also the only way to see what a recipe looks like to
  everybody else.
- Make the three states visible and different: **authored**, **saved** (liked,
  not adopted) and **in the cookbook** (adopted, linked, cookable). They are
  different commitments and currently only the last one shows.
- Aggregated ratings exist (`recipe_ratings`, averaged) but are not ranked on.

## P7 · Social with something to do — about a day

**"Doesn't feel deep enough" — because there is nothing to do but look.**

Follows, likes, comments and forks exist. What is missing is anything that
happens *between* two people:

- **Cook something somebody shared and tell them.** A cook event on a forked
  or followed recipe is the one social act this app can offer that no other app
  can, and it is currently silent.
- A feed of cooks rather than of posts — "Sam made your soup" beats "Sam liked
  your soup".
- Ask Luna before building anything beyond that. Social features are easy to
  add and hard to remove, and this is a private app for a small network.

### Four candidates, 12 Sep 2026 — not built, for Luna to pick from

Written down when P7 came up and the answer was "not sure". Ranked by how much
they are about cooking rather than about an audience, which is the test that
keeps this from turning into a feed.

**1. "Charlotte made your soup."** A cook on a recipe you wrote, or one forked
from yours, said once on the recipe and once on Discover. Needs no schema -
`cook_events` joined to `recipes.author_id` is the whole query - and it is the
only notification this app would have that is about somebody cooking rather
than somebody tapping. Half a day. *My pick, with the next one.*

**2. A line back to the author when you cook it.** The Cooked confirmation
already appears at exactly the right moment; it could offer one field: "used
less gochugaru", "doubled the beans". Stored against the recipe as a tip, shown
under the ingredients. This is what the design pass suggested when it deleted
the comment thread - *recipe-level tips and variations, not a global feed* -
and it is the one kind of writing people actually do about food. Half a day,
one small table.

**3. "Three kitchens have everything for this in right now."** Readiness is
already computed per kitchen; showing it across the people you follow turns a
recipe into an invitation. No schema at all. The risk is that it reads as
surveillance of somebody's cupboards, so it would have to be a count and never
a list of names.

**4. Passing a recipe deliberately.** "Send this to @sam" lands in their Saved
with a line from you. A message in the shape of a recipe rather than an inbox:
nothing to keep up with, no unread count, and it is what people actually do
with a link. A day.

**Deliberately not proposed:** a global activity feed, notification badges,
follower counts, or anything with an unread state. Every one of them is a
thing to keep up with, and none of them helps anybody decide what to cook.

## P8 · Auto-tagging — half a day

Extends phase 4's `suggestCuisines`, which is a small marker lexicon and a
deliberate bias to miss rather than invent.

- Widen it from cuisine to method (roast, one pan, no cook) and meal
  (breakfast, packed lunch), still from ingredients and step text.
- Tag on save and on import, always as a suggestion with one tap to accept.
- **Never apply a tag without being asked.** A tag that appears on its own is
  the app deciding what you cooked.

## P9 · Print — half a day

**Every important screen printable.**

The shopping list on paper, the recipe to cook from with hands covered in
flour, the stock list for a stocktake, the stats.

- A print stylesheet, not an export pipeline: drop the nav, the chrome and the
  interactive controls, set the type in points, black on white.
- The shopping list prints grouped by shop with real tick boxes.
- A recipe prints as a recipe: ingredients, method, scaled to the servings you
  had on screen.

---

## Order, and what the designer needs to know now

**P1 and P2 first** — they are the spine and the best friction win, and both
change screens the redesign is drawing *right now*. P3 needs a spike before it
needs a design. P4 needs its refactor before anything else in it. P5 to P9 are
independent.

**Send Design these four before it finishes**, or they get bolted on:

1. **The trip has states** a screen must show: list pinned, in the shop,
   bought, ready to cook.
2. **The container slider** replaces number entry in several places.
3. **A stats surface exists**, and it is a real screen, not a panel.
4. **Every important screen has a print form.**

**Rough total: 9 to 11 days**, plus implementing whatever the redesign returns.

## Still outstanding from phase 4

- **M9, receipt scanning quality** — kill the unconditional 1600px resample in
  `lib/scan-image.ts` first; it is most of the win. P4 wants the same pipeline
  to start keeping prices, so do them together.
- The pre-rotation sqld token is still valid, with no expiry and no revocation.
- No CSP or `X-Frame-Options`.
- `db.packthings.fyi` is reachable from the open internet.
