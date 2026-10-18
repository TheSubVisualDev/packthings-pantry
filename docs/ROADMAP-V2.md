# v2 - recipes and receipts

Scoped 18 Oct 2026 from Sam's outline (`message.txt`, the Discord thread) and
Luna's answers. Built on the `v2` branch; `main` stays deployed until v2 is
ready to replace it.

> **Goals.** Simplify weekly purchases of food. Reduce food bills. Reduce the
> complexity of bill splitting. Analyse the key costs of food and look for
> cheaper alternatives.

The spine, in Sam's words: *we avoid recipe first, we avoid fridge tracking, we
treat that as a data void that we work around by just analysing what goes in
and how often it goes in.* Stock tracking is the thing v1 asked people to keep
up with and nobody did. v2 stops asking. A receipt is the record.

## Decisions, 18 Oct 2026

| Question | Answer |
|---|---|
| What goes | Everything under `/pantry`: stock, the shelf, containers, vessels, expiry, barcode-to-stock, the trip, Tonight. |
| Old stock rows | Deleted after a backup - 31 in Pack Kitchen, 17 in Lindsey's. |
| What stays | Recipes and the cookbook, meal plan, shopping list, the social layer, reports, admin. |
| Bill split | Per line: each line can say who shares it. No eaters named means the whole household. |
| Receipt line model | From `message.txt`; Sam's drawing of one data point was an incomplete screenshot. |
| Receipt formats | Built against common UK tills, tuned on real receipts afterwards. |

Not asked, decided: **no vision model** (server-side AI is parked until a
Claude API key exists, and Tesseract cannot run server-side). Ingest is the
browser OCR that already exists, or typing a receipt in, which Sam's outline
explicitly accepts - *"i can guarantee the information is correct"*.

## What a receipt is

**A receipt** has a date bought (`'YYYY-MM-DD'`, a day not an instant, like
`meal_plan.on_date`), a shop, a purchaser, the last four digits of the card
when the till printed them, a total, and a status: **open** until somebody
says *"I can no longer annotate this receipt"* and closes it.

**A line** has the receipt's own wording (kept, for the "what's an Indian
selection" moments), a cleaned name, a price in pence, a count, an optional
amount and unit, a category, and these flags from the outline:

- **long-term** - the massive bag of rice. Bought rarely, used forever, not
  worth tracking per meal.
- **snack for** - one person's junk food. Comes out of the split entirely and
  out of household spend, but is kept on the record.
- **eaters** - who shares the cost. Empty means everybody in the household.
- **meals** - which pseudorecipes it went towards (see below). A line can be
  tagged with more than one, unless it is **used up whole** - the pack of
  mince in a spag bol.
- **use-by** - optional, and never asked for. Sam: *"we want to remove as much
  interaction with the actual food as possible."*

## The checklist

Every receipt that is not closed has a checklist, most important first, and
the inbox sorts by it. **Hard** things block a fair split; **soft** things
make the analysis better but nobody is chased for them.

1. Who paid (hard) - guessed from the card's last four digits once they are
   known.
2. Prices on every line (hard).
3. The date (hard).
4. The shop (soft).
5. Categories (soft).
6. Who shared it, snacks (soft - the default is everyone, which is right most
   of the time and costs 60p when it is not).
7. Meal tags (soft).

## It learns

When a receipt's wording has been explained once - `INDIAN SELECTN` is a
"Indian selection", Starches, long-term no - that answer is stored against the
wording and filled in next time. Same for a card's last four digits and who
owns it. Over months the checklist gets shorter on its own.

## Pseudorecipes

Sam's idea, and the one that makes Darcy's cooking fit: *"pseudorecipes are
moodboards of ingredients associated with a dish."* A meal tag - "ramen" -
collects every line ever tagged with it. The more often an ingredient is
bought for ramen, the higher it ranks. Nothing has to be weighed or written
down at the stove. Each meal has a kind - **batch** (spag bol, chili),
**riff** (Darcy's ramen), **single** (a fixed dinner), **lunch** - and can be
linked to a real recipe once one is written.

## What the numbers say

- Spend by week, month and quarter; by category; by shop.
- Repeat buys: what gets bought again and again, and what it costs each time
  and in which shop - the "look for cheaper alternatives" question.
- Days between buys, per thing. *"Based on how often you buy soy sauce you've
  probably got through it"* - a suggestion on the shopping list, never a
  claim, and it fades if you stop buying something.
- **Who owes whom.** Who paid minus who shared, per line, netted across the
  household, with a way to record a payment back.

## Milestones

1. **Schema** - new tables, tested on a clone, run twice. *An hour.*
2. **Receipt core** in `lib/` - meta extraction (date, shop, card, total),
   the checklist, the split, the learning. Checks for each. *An afternoon.*
3. **The gut** - `/pantry`, `/tonight`, stock libraries and their checks out;
   cooking records a cook and moves no stock; the shopping list moves to
   `/list` and stops reading shelves. *A day.*
4. **Receipts UI** - inbox, a receipt's page, the line editor, typed entry,
   settings for categories and cards. *An afternoon.*
5. **Spend, split and pseudorecipes** - `/spend`, balances, meal pages, the
   "probably due" suggestions on the list. *An afternoon.*
6. **Ship**, in this order, with Luna's go-ahead at the time:
   1. `npm run migrate` on production. Additive; v1 keeps running.
   2. Merge `v2` into `main`; Vercel deploys. The new code ignores stock rows.
   3. Live for a day or two. Rolling back to v1 still works, because the
      stock rows are still there.
   4. A fresh `clone-db` backup, then `scripts/retire-stock.mjs --yes`.

   Deleting first breaks the running v1; merging before migrating breaks v2.

## Not in v1 of v2

- The shopping-list *builder* (pick five pseudorecipes, get a week's list,
  answer "do you have soy sauce?"). Sam calls it the second project; it needs
  months of receipts before it has anything to say.
- An editing "terminal" for pseudorecipes beyond renaming, merging, kind and
  linking a recipe.
- Reading the feedback-survey code off the bottom of a receipt to enter the
  gift-card draws. Possible with the same OCR; not the point of this.
- Guessing a use-by date. The shelf-life table goes with the stock it served.

## Before any of it works for real

Sam (`exodddus`) is not in Pack Kitchen. Nothing can be split with somebody
who is not in the household - invite him from `/kitchens`.
