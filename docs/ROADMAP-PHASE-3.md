# Phase 3 — the cyborg phase

Planned 11 Sep 2026, after phase 2 closed (`49cc397`).

**The thesis, and the acceptance test for everything below:** the pantry has to be
*faster to update than to skip*. Every item here is judged on whether it removes a
moment where you'd otherwise not bother. That ranking is why "make it feel instant"
comes before any new feature, and why the receipt scanner outranks nutrition.

## Decisions made, do not re-litigate

- **Tags replace categories.** Not alongside — the `category` column is retired. An
  item has any number of tags plus one **primary** tag, which is what grouping uses;
  without a primary, grouping would put one row in three groups at once.
- **Shop is its own field on `items`, not a tag.** Where you buy something is a
  different kind of fact from what it is: tags describe the ingredient, shop
  describes the errand. Folding it into the tag list would put `shop:tesco` next to
  `sauce` in every tag picker and every group-by menu, which is noise in both.
- **Receipts: photo, then OCR, then match.** Not Claude vision — no API key, no
  per-scan cost. Accepted trade: worse on faded thermal paper.
- **Only uncertain receipt lines are confirmed.** Confident matches apply straight
  away. `rankItems()` already returns a score, with 0.6/0.34 thresholds tuned against
  real supermarket names during the barcode work — reuse them, don't invent new ones.
- **Restock is a per-item `restock_to`**, a number you set. Usage-based prediction is
  a later addition on top, not the mechanism.
- **The cooked log is a list of names and days.** No heatmap. Store the full data so
  a richer view is possible later without a migration.
- **Remix and the cooked log are separate features.** The GitHub-style log is about
  *meals cooked*, not recipe edits. There is no recipe version history in this phase.

## The container model

The change the stock half of this phase hangs on.

An item stops being "1320 ml of soy sauce" and becomes **"2 sealed bottles + 320 ml in
the open one"**.

On `items`:

- `pack_size` / `pack_unit` — what **one** container holds (500, ml). Null means a
  loose amount, which is today's behaviour.
- `sealed_count` — full, unopened containers.
- `quantity` — keeps its name, now means *what is left in the open one*.
- `restock_to` — how many containers you want on hand.
- `shop` — where you buy it, which is what groups the shopping list.

Total on hand is `sealed_count * pack_size + quantity`.

**The rule:** when the open container reaches 0, `sealed_count` drops by one and
`quantity` resets to `pack_size`. At `sealed_count` 0 you are out. The consequence
that matters: the progress bar shows "two-thirds of a bottle" and never lies about
what is in the bottle, because its maximum is the bottle's capacity rather than a
running total that changes every time you shop.

Three things this gets for free:

1. **3 tins at 400 g** is the same shape as 3 bottles at 500 ml. "Tins and jars with
   secondary volume or mass" needs no separate feature.
2. **Barcode scans already know pack size.** `parsePackSize()` in `lib/off.ts` has
   parsed it since the scanner shipped and `products` stores it — it has simply had
   nowhere to go on the item until now.
3. **`opened_at` becomes unambiguous.** It is the open container's date, not the
   row's.

**Unspecified quantity** is `pack_size` null *and* `quantity` null. It reads as
"some", shows a chip rather than a bar, and a recipe line against it cannot be
deducted — which is the same case as an unmatched line, already handled by the cook
flow.

## Latent bug, fixed on the way through

`items.name` is `UNIQUE` **globally**, not per kitchen (`db/schema.sql`). The second
kitchen to add "Milk" gets a constraint error. SQLite cannot drop a column constraint
with `ALTER TABLE`, so this needs a table rebuild — which S1 is doing anyway. Do it
there; it will not be cheaper later.

---

# Wave A — make it feel instant

Nothing new is worth building on top of an app that feels slow to touch.

### S0 · Kill the lag — about half a day

No region is pinned anywhere in the repo, so the app is very likely running in a US
Vercel region while `sqld` sits on Hetzner in Europe: every query a transatlantic
round trip of roughly 100 ms, and a page issuing five in sequence feels like half a
second of nothing.

1. Time one query from a deployed route to confirm the diagnosis before changing
   anything — two minutes, and it decides whether the rest of this is worth doing.
2. Pin functions to `fra1` (nearest to Hetzner's German sites; confirm which site the
   box is actually in).
3. Make the quantity steppers and mark-opened optimistic, so they do not wait on a
   round trip at all.
4. Batch the sequential queries on the pantry and recipe pages into `Promise.all`.

### S1 · Tags replace categories — about 1.5 days

One table rebuild carries the whole structural change: `tags` and `item_tags`, the
container columns, `restock_to`, the nutrition columns, and the `items.name` fix.
Migrate every existing `category` string to a tag, set as that item's primary.

Visible in the same milestone, so this is not a day and a half with nothing to show:
group-by-tag on the pantry, the tag index on the kitchen page, a remove-tag control,
tag suggestion on scan from the Open Food Facts categories already being fetched, and
the existing `SoftSelect` combobox extended to an item's own page — today it is only
on the add form, so a wrong category cannot be fixed without re-adding the item.

### S2 · Containers — about 1 day

The model above, in the interface: the bottle and tin bar, auto-decrement when the
open one empties, the unspecified-quantity state, and scans filling `pack_size` from
Open Food Facts without being asked.

# Wave B — nothing gets skipped

The three places stock currently goes stale because updating it is a chore.

### S3 · Bulk actions — about 1 day

Select several stock rows, then: change location, add or remove a tag, mark opened, or
open one screen holding just those rows to adjust their quantities together.

### S4 · Shops and restock — about 1 day

`restock_to` per item, driving a shopping list grouped by `shop` so one trip is
one list. Plus the "add what's missing" button on the recipe page itself —
`AddShortfallButton` exists but is only on the cook panel, so it is there while you
cook and absent while you plan.

### S5 · Receipt scanner — about 1.5 to 2 days

The headline item. Server-side OCR (Vercel Functions allow packages up to 5 GB, so
Tesseract is viable), receipt-line parsing, then `rankItems()` for matching. Confident
lines apply immediately; uncertain ones queue for one screen of decisions. Model the
undo on the existing cook undo, which already stores deltas rather than absolutes for
exactly this reason.

# Wave C — the pantry notices things

### S6 · Nutrition — about half a day

Add `nutriments` to the Open Food Facts field list, store per 100 g, derive a
main-stat label, and let grouping use it — "high protein" becomes a group you can
browse.

### S7 · Suggestions and the cooked log — about 1 day

Restock suggestions from real consumption, "you haven't touched this in a while"
pointing at recipes that use it, and the cooked log: names and days, read straight off
`cook_events`, which already records who, what, when, servings and per kitchen. No new
tables and no writes — the cheapest visible thing in the phase.

### S8 · Remix — about 1 day

Finish what `forked_from_id` started: a Remix action you can actually see, attribution
chains, and "remixes of this" on a recipe.

---

**Rough total: 9 to 10 days.** Wave A is the one that changes how the app feels, B is
the one that changes whether the data stays true, and C is the one that makes it
useful without being asked.
