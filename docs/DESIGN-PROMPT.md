# The prompt to hand to Claude Design

Paste the block below into a fresh session that has the repo at
`C:\Users\Luna\Documents\pantry\packthings-pantry` and the canvas link to hand.
Everything it needs to read is named in it.

---

```
I have a pantry-tracker app I want designed properly, from scratch. The
engineering is done and solid; what it lacks is hierarchy. Every screen shows
everything at equal weight and makes me find the thing.

Start here:
  • The canvas: https://claude.ai/code/artifact/895493ae-0dcb-430e-8872-d110ac7c042d
    Ten screens, a first pass, mine to be argued with — not a spec.
  • docs/DESIGN-BRIEF.md — the problems, ranked
  • docs/DESIGN-LANGUAGE.md — the tokens and two rules that must survive
  • docs/FRICTION-2026-09-12.md — what was already fixed, so you don't redo it

Read the real source, not my screenshots. app/globals.css has the exact
palette. components/ has the real anatomy.

WHAT IT IS
A pantry tracker for one household. It knows what's on the shelves, what's
about to go off, what I can cook from it, and what to buy. Used one-handed,
in a kitchen, on an iPhone, usually while doing something else.

THE ONE RULE
Mobile first, desktop serviceable. The phone layout is the design; desktop is
the accommodation. The test: every `sm:` rule should make something smaller,
tighter or wider — never bigger. If a control has to grow on desktop, the
phone version was drawn too small.

FIXED
  • Manrope, IBM Plex Mono for barcodes and keys.
  • The "Fridge Door" palette exactly as it is in app/globals.css.
  • Light mode only, by decision. If you want dark, propose it deliberately.

TWO RULES ABOUT MEANING — keep these however the visuals change
  1. An opinion and a measurement must not look the same. A tag I typed is a
     solid chip I can remove; one the recipe worked out about itself ("20
     mins", "No oven") is an outline with no remove button.
  2. Not having something is not an error. An ingredient I haven't bought
     reads "To buy" in a muted chip, never in the destructive colour. That
     colour is for things that actually go wrong.

WHAT I WANT FROM YOU
Push harder than the canvas does. Don't be precious about keeping anything —
if a better structure exists, take it. In particular:

  1. The stock screen. Six things stacked before you reach the stock. What is
     this screen FOR in the three seconds I open it holding a pan?
  2. The recipe editor. 18 inputs and no shape. Writing a recipe is a long,
     resumable, multi-part task, and it's currently one long form.
  3. Discover / social. Not drawn on the canvas at all. Does it stay a tab,
     fold into the cookbook, or go?
  4. Empty states. Only /tonight offers the thing that would fix its own
     emptiness. Every other one states a fact and stops.
  5. The app never learns. The add menu offers seven actions in the same order
     forever. After a month it knows which two I use.

COVER EVERY SCREEN: stock, tonight, cookbook, recipe, cook, recipe editor,
add item, item detail, shopping list, barcode scan, receipt review, selection
mode, discover, profile, kitchens, settings, login.

COMING NEXT — please leave room for these rather than making me bolt them on
  1. The shop trip is one continuous thing, and a screen needs to show where I
     am in it: list pinned / in the shop / bought / ready to cook. Coming home
     to a waiting "Start cooking" is the moment the whole app is for.
  2. A container slider replaces typed numbers in several places. Nobody knows
     they have 320ml of soy sauce; they know the bottle is two-thirds full.
     The number should become the result, not the input.
  3. A stats surface exists — Letterboxd-for-a-kitchen, what I cook, what I
     waste, the year in food. It is a real screen, not a panel.
  4. Every important screen has a print form: the list on paper, the recipe to
     cook from with floury hands, the stock list for a stocktake.

HOW TO LOOK AT IT
  npm run dev
  npm run shots -- ./out /pantry /pantry/add /recipes /tonight

scripts/screenshot.mjs renders the real pages at iPhone 17 Pro size with real
data. Please use it. Three bugs fixed the day before this brief — a form whose
fields overlapped, a nav that had stopped fitting, a card that rendered as a
black rectangle on iOS — were each obvious in a screenshot and invisible in
the source, and survived weeks of work because nobody took one.

Show me directions before you commit to one.
```
