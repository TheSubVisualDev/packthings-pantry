# Where I'm at

Live progress on the tester-feedback round. Updated as I go — check the
timestamp to see how fresh it is.

**Last updated:** 13 Sep 2026, after batch B pushed
**Doing right now:** C — plain-text recipe paste (reading how the paste box
works today)
**Next after that:** D — bug report / feature request form
**Blocked on you:** nothing yet. F (meal planner) is where I stop and ask.

---

## Batches

| | Batch | State |
|---|---|---|
| A | Six visual fixes from the screenshots | **done, pushed** `04cd93f` |
| B | `~` approximate amounts and "to taste" | **done, pushed** `6fc9246` |
| C | Paste a plain-text recipe and have it parsed | in progress |
| D | Bug report / feature request, with photos | not started |
| E | Shopping lists without a kitchen | not started |
| F | Weekly meal planner + nutrition | **needs your call** |

---

## A — six visual fixes · done

Pushed as `04cd93f`.

1. **"In stock" and "To buy" were the same grey chip** — the real bug behind
   img1. Different shapes now: a tick against an outlined basket.
2. **The filled circle read as "you have this"** — it is the cooking
   checklist. One line above the list says so.
3. **Ingredient lines lead with the amount** (img5) — "2 packs Tortellini"
   over "600g · preferred filling". Units say themselves properly: two tins,
   not two tin.
4. **Quick adjust rows stopped wrapping** (img2) — a long name pushed the
   stepper onto its own line against the left edge.
5. **Search placeholder fits** (img3), **Save button no longer ghosts**
   (img4) — it changed width on top of a backdrop-blur, which iOS paints
   twice.
6. **Tap the sides of the cook screen to move** (img6) — plus arrow keys.
   The footer buttons stay.

## B — approximate and unmeasured amounts · done

Pushed as `6fc9246`. Migration run against a clone twice, then live. Backup
at `../backups/pre-approx-2026-09-13.db`.

- Type `~70` in the quantity box → reads "~70g Brown Onion" everywhere. Still
  comes off the shelf; just stops claiming a precision nobody had.
- New unit **to taste** in the dropdown, for a seasoning with no amount at
  all. Cooking subtracts nothing. The shopping list leaves it alone if you
  have any and lists it if you have none. Nutrition skips it.
- `npm run check:amounts` — 40 cases.

## C — paste a plain-text recipe · in progress

The ask: paste a wall of text (ingredients, steps) and have the site pick it
apart. Today's paste box only accepts JSON, which means it only works if you
have already asked Claude to write some.

## D — bug report / feature request · not started

Your ask: a form in the app where people write in and attach pictures, stored
in the DB, plus a skill that reads them and collates them into yes/no for
your approval.

## E — shopping lists without a kitchen · not started

## F — weekly meal planner + nutrition · needs your call

The biggest item by a distance and the one with the most ways to build it.
I'll stop here and put the options to you rather than guess.
