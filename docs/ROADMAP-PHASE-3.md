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

## The latent bug, fixed — DONE 11 Sep 2026

`items.name` was `UNIQUE` **globally** rather than per kitchen, so the second
kitchen to buy milk could not write it down. SQLite cannot drop a column
constraint, so the table had to be rebuilt, and **sqld allows no pragma control at
all**: `foreign_keys=OFF` is accepted and ignored, `defer_foreign_keys` likewise,
and `legacy_alter_table` will not even parse. Every published recipe for this
starts by turning foreign keys off, and none of them was available.

`scripts/rebuild-items.mjs` does it instead by writing down what the drop would
destroy and putting it back, all inside one transaction. Referencing tables are
**discovered** through `PRAGMA foreign_key_list` rather than listed: the first
version had a hand-written list of the three tables that null their link, missed
`item_tags` because it cascades instead, and silently deleted all nineteen tag
links on the clone it was rehearsed against. The rehearsal is why that is a
sentence here rather than an incident.

Verified on a clone before it touched anything: every row and link preserved,
`item_tags` included, no item left filed under a tag it no longer carries, and
the constraint proven both ways — two kitchens can now hold the same name, one
kitchen still cannot hold it twice.

---

# Wave A — make it feel instant

Nothing new is worth building on top of an app that feels slow to touch.

### S0 · Kill the lag — DONE 11 Sep 2026 (`7688a04`, and the protocol fix after it)

**The measurement changed the plan, which is why it came first.** The region was one
cause and the smaller one. `npm run probe` against the real Nuremberg box, from a
machine 32 ms away:

| | over `https:` | over `wss:` |
| --- | --- | --- |
| one query | 67 ms | **38 ms** |
| five, sequential | 370 ms | 195 ms |
| five, `Promise.all` | 206 ms | **43 ms** |

One query over `https:` cost two round trips, and five cost ten: `@libsql/client`
opens a fresh TCP and TLS connection per `execute()` with no pooling whatsoever. sqld
serves Hrana over a WebSocket on the same port, which holds one connection open and
pipelines over it — so a single query drops to exactly one round trip and parallel
queries collapse into one.

**The consequence worth keeping:** every `Promise.all` call site in the app got about
five times faster without being touched, so the batching refactor this milestone
originally planned was not needed at all.

Shipped:

1. `lib/db.ts` upgrades an `https:` URL to `wss:`, with `LIBSQL_PROTOCOL=http` as a
   one-variable rollback that needs no deploy.
2. `vercel.json` pins functions to `fra1`. The box is in Nuremberg — confirmed, not
   assumed: `db.packthings.fyi` resolves to a `your-server.de` host in Bavaria.
3. The steppers and the opened toggle are optimistic. The toggle also used to flip
   its label whether or not the write landed, so it could say something was open
   when it wasn't.
4. `currentUser` and `currentKitchen` are wrapped in React's `cache()` — the header
   and the page body each asked separately, two queries apiece, on every render.
5. `/api/health` reports region, protocol and three timings, so the next person to
   say "it feels slow" has a number instead of a hypothesis. `npm run probe` is the
   same measurement from a laptop.

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
