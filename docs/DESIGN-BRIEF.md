# Brief for Claude Design

Written 12 Sep 2026. This is the handoff for the phase 4 design pass.

**Please solve these as design problems, not as restyling.** The engineering
side has taken this as far as it usefully can — the app is correct, it is fast,
it guesses well, and it still feels like a set of parts rather than a thing.
What is left is layout and hierarchy, and that is your half.

---

## What the app is

A pantry tracker for one household. It knows what is on the shelves, what is
about to go off, what you can cook from it, and what to buy. It is used
**one-handed, in a kitchen, on an iPhone**, usually while doing something else.

## The one rule

**Mobile first, desktop serviceable.** The phone layout is the design; the
desktop layout is the accommodation.

It has a test rather than being a slogan: **every `sm:` rule should make
something smaller, tighter or wider — never bigger.** If a control has to grow
on desktop, the phone version was drawn too small and should be fixed there.

Base controls are 44px. Rows of controls scroll sideways rather than wrapping.
Dialogs are bottom sheets that become centred panels on desktop.

## The constraints that are fixed

- **Manrope** throughout, **IBM Plex Mono** for barcodes and keys.
- The **"Fridge Door"** palette, as it exists in `app/globals.css`.
- **Light mode only, by decision, not omission.** If you want a dark palette,
  propose one deliberately — do not assume one.
- `DESIGN-Recipe-Editor.html` is an older mockup of the recipe editor. Treat it
  as history, not as a spec.

## Two rules about meaning

Both are load-bearing and both came out of the friction work. Please keep them
however the visuals change.

1. **An opinion and a measurement must not look the same.** A tag somebody
   typed is a solid chip you can remove; one the recipe worked out about itself
   ("20 mins", "No oven") is an outline with no remove button.
2. **Not having something is not an error.** An ingredient you have not bought
   reads "To buy" in a muted chip, never in the destructive colour. That colour
   is for things that will actually go wrong.

---

## The problems, worst first

### 1. The stock page is six things stacked before you reach the stock

Today, top to bottom on a phone: a "use these up" list, a Shopping link
floating right, a Tonight recommendation card, an "Other ideas" button, a
"grouped by" label with a segmented control, a "Select" button, an "estimate
the missing figures" button, and *then* 29 items.

Every one of those earns its place individually. Together they are a wall, and
the thing the page is named after is below all of it.

**The question:** what is this screen for in the three seconds somebody opens
it while holding a pan? Design the answer. It is legitimate to conclude that
the suggestion belongs on `/tonight` and this page should be the stock.

### 2. The recipe editor has 18 inputs and no shape

Never designed as a whole. Preview-left / fields-right with a tab switch on
mobile, and the tab switch is the weak part. Writing a recipe is a long,
multi-part, resumable task and it is currently one long form.

### 3. Selection mode and the bulk bar have never been designed at all

Entering selection mode, knowing what is selectable, and discovering what the
bar can do are three separate discoveries with no visual support.

### 4. Receipt review asks about every line

It should accept the confident matches silently and ask only about the rest —
the shape the cookbook's "ingredients to check" sheet already uses. The
matching is good enough to trust now. This is a flow problem more than a
visual one.

### 5. Empty states do nothing

Only `/tonight` offers the thing that would fix its own emptiness. Every other
empty state states a fact and stops.

### 6. The app never learns

The add menu offers seven actions in the same order forever. After a month it
knows which two this person uses.

---

## What has already been done, so you are not redoing it

The friction pass (`docs/FRICTION-2026-09-12.md`) and the pre-design pass
(`docs/DESIGN-LANGUAGE.md`) covered:

- **The add form fills itself in** from the nearest thing you already own, and
  folds eleven optional fields behind one line. Three fields and a button.
- **Navigation moved to the bottom** on phones, with the add button raised in
  the middle of it.
- **Four primitives exist** in `components/ui/`: `Sheet`, `Segmented`,
  `FilterChips`, `Page`. Please build on them or replace them deliberately.
- The stock list, recipe cards, "use these up" and search have all had a
  density pass.

## How to look at it

    npm run dev
    npm run shots -- ./out /pantry /pantry/add /recipes /tonight

`scripts/screenshot.mjs` renders real pages at iPhone 17 Pro size with real
data. **Please use it.** Three of the bugs fixed today — a form whose fields
overlapped, a nav that had stopped fitting, a card that rendered as a black
rectangle on iOS — were each obvious in a screenshot and invisible in the
source, and survived weeks of work because nobody took one.
