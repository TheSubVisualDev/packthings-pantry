# Phase 4 — from "every option" to "the obvious next move"

Re-scoped 12 Sep 2026. Supersedes the 11 Sep version, which was a list of five
features. This one has a spine.

Phase 3 made the pantry *correct*. Phase 4 is about it having an **opinion**.
The test for every screen in this phase is the same: does it answer "what now"
before it offers "what's possible"? Today the app is a very good set of options
— group by three things, browse every recipe, adjust any number. That is a tool
you operate. The thing we want is a tool that goes first.

Three principles, applied everywhere below.

1. **Lead with one recommendation, not a ranked list.** A list is the app
   refusing to decide. One card with a reason on it, and the list behind a tap.
2. **Say why.** A recommendation without a reason is a magic trick, and magic
   tricks are not trusted twice. "Uses the coriander, dies Thursday, you have
   7 of 8" is the whole product.
3. **The default should be right often enough to accept blind.** Every field
   pre-filled from what we already know; typing is the fallback path, not the
   main one.

---

## M1 · One definition of "do I have this" — DONE 12 Sep 2026

**The highest-leverage thing in the phase, and it is invisible.**

Every smart thing the app does rests on matching a recipe line to a stock row,
and that match is currently `name.toLowerCase() === name.toLowerCase()` in
**four** separate places:

- `getStockedItemNames` in `lib/queries.ts` — which is what feeds the
  "cook with what you have" ranking *and* the rescues panel.
- `parseRecipeDocument` in `lib/recipe-schema.ts:122`, resolving `item_id` at
  write time.
- `cookRecipe` in `app/recipes/[id]/actions.ts`, building `itemsByName`.
- Nothing in the shortfall path, which inherits whichever of the above ran.

So a recipe calling for "firm tofu" reads as *not stocked* against a pantry row
called "Tofu", the suggestion ranks below recipes you cannot make, the rescue
never fires, and cooking flags the line. Meanwhile `lib/match.ts` already holds
a tuned Dice-coefficient scorer over stemmed tokens with brand, pack size and
supermarket noise stripped — thresholds picked against real supermarket names —
and it is used **only by the barcode scanner**.

This is the same shape of problem as the one `AGENTS.md` already warns about
for `ADJUST_SQL` / `PACK_SQL` / the cook action: several places deciding what a
jar is, agreeing only by being equally naive.

The work:

- `lib/pantry-match.ts`: one `resolveLine(name, items)` returning
  `{ item, confidence: 'exact' | 'likely' | 'maybe' | 'none' }`, built on
  `rankItems` and the existing `STRONG_MATCH` / `WEAK_MATCH` floors.
- It is **container-aware**: `totalOnHand()` decides stocked, never `quantity`.
  Three sealed tins is stocked. This is the fourth instance of the bug
  `AGENTS.md` names, waiting to happen.
- All four call sites go through it. Cooking still only *auto-applies* an
  `exact` or `likely`; a `maybe` is offered as a pre-selected substitution, so
  a fuzzy match never silently spends the wrong jar.
- `npm run check:match`, fixtures of real recipe lines against real pantry
  names, run through `scripts/ts-imports.mjs` so it tests what ships. This is
  the before-and-after for every ranking change that follows.

**Why first:** M2 cannot ask a sensible question without it, and M4, M5 and M7
all get better for free. None of them can be judged until the join underneath
them is honest.

---

## M2 · The cookbook — DONE 12 Sep 2026

**Recipes you have adopted, with their ingredients linked to your shelves.**

Luna's, 12 Sep 2026, and it resolves something M1 had left dangling: where does
a fuzzy match get confirmed? The answer is that adding a recipe to your cookbook
is a decision you are already making, so it is the one place a `maybe` can ask
without interrupting anything. Confident lines link silently; the rest get one
prompt, once, and never ask again.

It also fixes a latent bug. `recipe_ingredients.item_id` is **one column on a
recipe that many kitchens can see**, resolved at parse time against whichever
kitchen happened to be current. Share a recipe or fork one and that link points
at somebody else's shelves. Cooking never trusted it — `cookRecipe` re-matches
by name every time — so it is simultaneously vestigial and wrong. Which kitchen
row an ingredient means is a fact about **(kitchen, recipe, ingredient)**, and
it has never had anywhere to live.

    CREATE TABLE IF NOT EXISTS cookbook (
      kitchen_id INTEGER NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
      recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      added_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kitchen_id, recipe_id)
    );

    -- Which row on THESE shelves an ingredient line means. The human's
    -- decision, taken once, not a guess recomputed on every page load.
    CREATE TABLE IF NOT EXISTS cookbook_links (
      kitchen_id    INTEGER NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
      item_id       INTEGER REFERENCES items(id) ON DELETE CASCADE,
      PRIMARY KEY (kitchen_id, ingredient_id)
    );

`recipe_ingredients.item_id` is left in place unread, the way `items.category`
and `items.shop` were — retiring a column costs a table rebuild, and keeping it
is the way back if this turns out wrong.

The rules:

- **The cookbook is per kitchen, not per person.** It is a set of shelves that
  the links describe, and a household shares both.
- **Authoring and adopting are separate.** You can write a recipe and not have
  it in your cookbook — a thing you wrote down once is not a thing you cook.
  Your own recipes are offered for adding, not added automatically.
- **You cook out of your cookbook.** Cooking a recipe that is not in it offers
  to add it first, which is where the linking prompt lives. One extra tap the
  first time you cook someone else's recipe, and never again.
- **Adding runs M1 over every line.** `exact` and `likely` link silently;
  `maybe` and `none` are the prompt, with the resolver's alternatives as the
  options and "not in my kitchen" always available — a speculative recipe (M7)
  must be addable with nothing linked at all.
- **Removing keeps the links.** Taking something out of rotation is not saying
  you were wrong about which jar it meant, and re-adding should not re-ask.
- **A null `item_id` on a link is a real answer**, meaning "asked, and this
  kitchen has no such thing" — different from never having asked, which is a
  missing row. Same distinction as `products.nutrition_checked_at`.

**Rotation is a view of the cookbook, not a second concept.** What you actually
cook is already in `cook_events`, so "in rotation" is the cookbook sorted by
recency and frequency, and M4's fatigue signal falls straight out of it. No
second table, no flag to keep true.

Everything downstream narrows to the cookbook: `/tonight` ranks it, the rescues
panel searches it, readiness counts come from its links rather than from
re-matching. That is a smaller, curated, already-human-checked candidate set,
which is the other reason this is worth doing before the recommender.

---

## M3 · Recipe tags — DONE 12 Sep 2026

**"Asian", "10 mins", "weeknight", "uses the oven".**

Items have had tags since phase 3 (`tags` / `item_tags`, kitchen-scoped,
primary tag files the item). Recipes have none. Tags are what let M4 take an
instruction — "something quick", "something Asian" — instead of only ranking.

Schema, additive as always:

    CREATE TABLE IF NOT EXISTS recipe_tags (
      id         INTEGER PRIMARY KEY,
      owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS recipe_tag_links (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      tag_id    INTEGER NOT NULL REFERENCES recipe_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, tag_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_tags_owner_name
      ON recipe_tags(owner_id, LOWER(name));

**Scoped to the author, not the kitchen** — deliberately different from item
tags, and the one real decision in this milestone. A recipe belongs to a person
and travels across kitchens and across the social graph; stock belongs to a set
of shelves. Tagging by kitchen would mean a recipe loses its tags the moment
you switch kitchen, and a forked recipe would arrive carrying a stranger's
vocabulary. Fork copies tag *names* into the forker's own tag list, the same
way `forkRecipe` already copies everything else.

Two kinds of tag, and the second is where the "smart" lives:

- **Typed tags** — cuisine and occasion. "Asian", "Comfort", "Sam likes this".
  Free text, same `cleanTagName` rules, same chip picker component.
- **Derived tags** — computed, never stored, never typed, shown in a different
  weight so they read as facts rather than as opinions. `prep + cook <= 15`
  becomes "15 mins". Five or fewer ingredient lines becomes "5 ingredients".
  One pan, no oven step, becomes "one pan". These cost nothing to maintain, are
  never wrong the way a stale typed tag is, and they are the tags people
  actually filter by. `lib/recipe-tags.ts` holds the derivations so there is
  one definition of what "quick" means.

Suggested-on-save: when a recipe is written, propose tags rather than demand
them — cuisine guessed from ingredient names (gochujang, miso, fish sauce →
Asian), accepted with one tap. Miss one rather than invent one, the same bias
as the receipt parser.

Filtering by tag lands on `/recipes` and in M3.

---

## M4 · "Tonight" — the recommender surface — DONE 12 Sep 2026

**The centrepiece. One screen that decides.**

There are currently three separate answers to "what should I cook", all on the
stock page, all disagreeing: `UseItUp` (rescues), `TopMatchCard`, and the
`SuggestionCard` list. Phase 4 collapses them into one ranked recommendation
with a reason attached, at `/tonight`, surfaced as the top card on `/pantry`
and as the empty state of `/recipes`.

Everything it needs already exists in the database. The ranking is a weighted
sum over signals we are already computing and currently throwing away:

| Signal | Where it lives now | What it means |
|---|---|---|
| Readiness | `getRecipesWithMatches`, after M1 | how much of it is already here |
| Urgency | `getRescues` / `USE_BY` | something in it dies soon |
| Affection | `recipe_ratings`, `times_cooked` | you like it |
| Fatigue | `cook_events.cooked_at` | you had it on Tuesday |
| Effort | `prep_minutes + cook_minutes` | it is a weeknight |
| Shortfall | the existing shortfall path | one shop away, not five |

The rules matter more than the weights:

- **Fatigue is a real signal and nothing implements it.** A recipe cooked in
  the last four days sinks hard. `cook_events` has held the data since phase 1.
- **Urgency outranks readiness.** Something going off on Thursday beats a
  recipe you have every ingredient for, because the alternative to cooking it
  is throwing it away. That is the difference between a recommender and a
  filter.
- **One card, with its reason in words.** "Other ideas" behind a tap.
- **A second card for "nearly"**: the best recipe that is one ingredient short,
  naming that ingredient with a one-tap add-to-list. This is the shortfall
  button finally being useful — it turns a dead end into a plan.
- Filters come from M2: a row of tag chips plus the derived time chips.
  "Asian" and "15 mins" as two taps is the whole interaction.

Weights live in one exported constant with a comment saying what each is for,
and `npm run check:tonight` runs the ranker over fixture kitchens so tuning has
a before and after rather than a feeling.

---

## M5 · Cook as a checklist — DONE 12 Sep 2026

**Cook fires when you are finished, not when you start.**

Today Cook is a button pressed at the beginning and the decrement happens
immediately, which is backwards: the moment you are *done* is the moment stock
has actually moved.

- Each ingredient line gets a tick. Substitutions and the serving count stay
  changeable while you work.
- Confirm at the bottom does what Cook does now, through the same `cookRecipe`
  transaction — the atomicity and the `cook_events` delta log are not being
  rewritten, only the moment they fire.
- The method's keep-screen-awake toggle applies to the whole flow.

**Decided 12 Sep 2026 — confirm asks.** An unticked ingredient is ambiguous and
the app does not guess: confirm lists what was left unticked and asks whether to
skip it or spend it anyway. Chosen over silently skipping because a forgotten
tick would otherwise leave stock quietly too high, and over silently spending it
because that makes the ticking decorative.

The cost is a second decision on every cook, which is the thing this phase is
otherwise removing — so the prompt only appears **when something is actually
unticked**, and a fully ticked cook confirms in one tap like any other. Whatever
is skipped is recorded on the cook event, so the log says what really left the
shelf. `changes` is already a delta list, so a short cook undoes correctly with
no extra work.

---

## M6 · Clickable timers — three quarters of a day

**"Simmer for 20 minutes" is a button.**

`recipe_steps.minutes` already exists and the parser already populates it, so
this is parsing plus a component, not schema.

- Parse timings out of step text where `minutes` is null — the same trick and
  the same bias as the receipt parser: miss one rather than invent one. Ranges
  ("10–12 minutes") take the lower bound; "overnight" and "until golden" are
  deliberately not timers.
- **An end timestamp, never a counting number.** A locked screen, a
  backgrounded tab and a reloaded page all have to leave the timer correct, and
  only an absolute deadline survives all three. `localStorage`, keyed by step.
- **Several at once is the normal case**, not the edge: a stacked tray of
  running timers pinned above the method, each labelled with its step.
- Ring with a notification where permission exists, and an in-page state that
  is unmissable where it does not.

---

## M7 · Speculative recipes — half a day

**Write a recipe for something you cannot make yet.**

The data model needs nothing: `item_name` has been the portable truth since
phase 2, and a null `item_id` is already the handled case. The work is the
editor and everything downstream treating "not in the pantry" as **normal**
rather than as a warning to be cleared.

- The editor stops implying an ingredient must exist. "Not in your kitchen"
  reads as quiet information, in the same weight as a unit.
- `parseRecipeDocument` keeps the warning in the API response — a machine
  caller should still be told — but the editor stops rendering it as a problem.
- Nutrition already does the right thing: unstocked lines fall back to the
  generics table, because a recipe's figures are a property of the dish and not
  of the cupboard. Check the rest of the app agrees.
- The natural next action is "send the whole thing to the shopping list", which
  shares a code path with M4's "nearly" card.

---

## M8 · The friction sweep — one day

**Everything that currently asks a question it could have answered.** Small,
individually unremarkable, collectively the difference Luna is asking for.

1. **Add-item defaults.** Unit, location, tags and shop are all guessable from
   the name, via `rankItems` against existing stock plus whatever the nearest
   existing item does. Arrive filled in, not empty.
2. **One-tap shortfall → list**, from a recipe, from `/tonight`, and in bulk.
3. **Restock is already computed** (`getRestockSuggestions`) and currently sits
   on its own panel. It belongs *in* the shopping list, pre-ticked.
4. **Receipt review**: pre-select the matched row at `STRONG_MATCH` and make
   accepting the whole receipt one button, since M1 makes the matching worth
   trusting. Never designed at all, so it goes to M10 as well.
5. **Expiring-soon dates on open packs.** `shelf_life_days` is null for most
   items, which leaves the whole rescue engine dark for them. Default it from
   the generics table when something is opened, editable after.

Capped at five deliberately. Anything else found goes in a list at the bottom
of this doc rather than into the milestone.

---

## M9 · Receipt scanning quality — half a day

Unchanged from the 11 Sep scoping, and the two corrections there still stand:
**there is no upload** and **there is no lossy codec** — `prepareReceipt` hands
Tesseract raw canvas pixels. Nobody should go hunting for a `toBlob`.

In order of likely return:

1. **Stop downscaling.** `TARGET_WIDTH = 1600` in `lib/scan-image.ts` is
   applied unconditionally, so a 4000px photo is bicubically averaged down to
   1600px before anything reads it — destroying exactly the small print, for no
   benefit now that nothing is transmitted or stored. Only ever enlarge; leave
   big photos alone. This is most of the win.
2. **Adaptive thresholding.** The current stretch is global, so one shadow
   across a curled receipt drags the whole image.
3. **Deskew.**
4. **Crop to the printed block**, so the shop's logo and the card receipt
   stapled underneath are never read at all.

**Keep real photographs as fixtures first**, so this is measurable rather than a
matter of opinion. `npm run check:receipt` covers parsing, not recognition.

---

## M10 · Design pass, mobile first — handoff, runs alongside

Blocked by nothing and blocking nothing, so it runs in parallel from the start.
Mobile first, desktop second; the current layouts were drawn phone-first and
then stretched.

What the designer needs to know:

- Manrope throughout, Plex Mono for barcodes and keys.
- "Fridge Door" palette, **light mode only by decision, not by omission** — no
  dark palette has ever been specified, so none was invented.
- `DESIGN-Recipe-Editor.html` is the existing mockup for the editor.
- **The recipe creator is clunky**: preview-left / fields-right with a tab
  switch on mobile, and the tab switch is the weak part.
- **Three different tab patterns answer the same question** — the header's
  segmented control, the editor's preview/fields toggle, the stock page's
  group-by switch. Pick one.
- **Never designed at all:** selection mode, the bulk bar, receipt review, and
  now `/tonight` and the cook checklist.

---

## Order and total

**M1 to M4 shipped 12 Sep 2026** - the chain is done and the payoff is live at
`/tonight`. M5, M6, M7, M8 and M9 are independent and can be picked up in any
order. M10 runs alongside throughout.

Two things the chain changed that were not in the original plan, both worth
knowing before picking up anything else:

- **`UseItUp` no longer suggests recipes.** It was proposing them by its own
  ranking while Tonight proposed them by another, on the same screen. It lists
  deadlines now, which is the part Tonight structurally cannot show - an
  ingredient nothing uses never appears in a suggestion.
- **`components/recipe-suggestion.tsx` is gone**, replaced by
  `components/tonight-card.tsx`.

M2 is the first milestone that touches the database, so it goes through the
`AGENTS.md` routine before it goes anywhere near live: clone, migrate the clone,
run it twice for idempotency, `PRAGMA foreign_key_check`, keep the clone as the
backup.

**Rough total: 7 days of building, plus whatever the design pass returns.**

## Inherited, still outstanding

From `STATE-2026-09-11.md`, unchanged and not part of this phase unless picked
up deliberately:

- The pre-rotation sqld token is still valid, with no expiry and no revocation.
- No CSP or `X-Frame-Options`.
- `db.packthings.fyi` is reachable from the open internet.
