# Where I'm at

Live progress on the tester-feedback round. Updated as I go — check the
timestamp to see how fresh it is.

**Last updated:** 13 Sep 2026, after batch D pushed
**Doing right now:** E — shopping lists without a kitchen
**Next after that:** F, which is where I stop and ask
**Blocked on you:** nothing yet. F (meal planner) is where I stop and ask.

---

## Batches

| | Batch | State |
|---|---|---|
| A | Six visual fixes from the screenshots | **done, pushed** `04cd93f` |
| B | `~` approximate amounts and "to taste" | **done, pushed** `6fc9246` |
| C | Paste a plain-text recipe and have it parsed | **done, pushed** |
| D | Bug report / feature request, with photos | **done, pushed** |
| E | Shopping lists without a kitchen | in progress |
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

## C — paste a plain-text recipe · done

No LLM involved — it is regex heuristics, which is why it could be built.
`/recipes/paste` now opens on **Written out** instead of JSON, and it is in
the + menu rather than three taps deep behind the Claude page.

Reads: `2 x 400g tins chopped tomatoes` (two numbers, both kept), `1 onion
(about 150g)` (the brackets are a note, not the amount), fractions both
written and vulgar, ranges, `oz`/`lb`/`cups` converted and reported, `salt
and pepper to taste` split in two, sections, and a paste with no headings at
all. It never invents an amount: a line it cannot read comes back unmeasured
with the original words kept.

Nothing saves until you have looked at it, and Keep it lands in the **editor**
rather than the recipe page, because a read recipe is a draft.

`npm run check:recipe-text` — 50 cases.

## D — bug report / feature request · done

Exactly the flow you asked for.

1. **`/report`** — one form, both halves. A toggle at the top: *Something's
   broken* / *I wish it did*. One line is all that's required, up to four
   pictures, and it fills in which page they were on and which browser by
   itself. In the account menu as **Report or request**.
2. **`/reports`** — yours only. Anyone else gets a 404, not a refusal: a page
   that says "you're not allowed" has told them there's a there.
3. **The tinder bit** — one card, swipe it, drag tilts it and fades in
   ON THE LIST / NOT FOR NOW. Arrow keys work. Buttons stay for anyone who
   doesn't know the gesture. Undo puts the last one back.
4. **Say "collate the reports"** and the `reports` skill takes the approved
   ones oldest first, looks at the screenshots, does them, and marks each
   done with a note that the person who reported it sees on their own page.

Nothing is deleted by a swipe. Clearing the turned-down ones is a separate
command I'll confirm with you first — an idea that keeps being asked for
after it was turned down is worth knowing, and a deleted row can't tell you.

`@admin` is the one who can triage. `scripts/reports.mjs admin <handle>`
adds another.

## E — shopping lists without a kitchen · not started

## F — weekly meal planner + nutrition · needs your call

The biggest item by a distance and the one with the most ways to build it.
I'll stop here and put the options to you rather than guess.
