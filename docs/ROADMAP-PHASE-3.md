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

### S5 · Receipt scanner — DONE 11 Sep 2026

Photograph a receipt, check what it found, put a whole shop away at once.

`lib/ocr.ts` is Tesseract plus the preprocessing that makes it work at all:
rotate by EXIF, greyscale, upscale to 1600px, normalise, sharpen. `lib/receipt.ts`
turns the text into purchases, and `rankItems` — the same scorer the barcode
scanner uses, on the same thresholds — finds them on the shelf.

**A line needs a price to count as a purchase.** That one rule is what keeps the
shop name, the address, the phone number and the half-legible strapline out of
the pantry. Prices are matched against an OCR-repaired copy of the tail only,
never the name, because repairing a name turns "Olive" into "0live".

Confident matches arrive already accepted, so only the doubtful lines cost
attention. Nothing is written until Add.

Measured against the real pantry: 94% OCR confidence on a rendered receipt, five
of six lines confidently matched with brand names correctly ignored, and the one
thing not stocked falling through to an offer to add it. `npm run check:receipt`
keeps both halves honest without needing a database or a photograph.

**Recognition runs in the browser, not on the server** — changed 11 Sep 2026
after it hung in production. The Node build of tesseract spawns a
`worker_threads` Worker *from a file path*, and that path does not survive being
bundled into a serverless function: the worker never starts and the promise
never settles. A hang rather than a crash, which is the worse of the two,
because a crash at least says something.

Before that it failed a different way: Server Actions accept one megabyte by
default and a phone photograph is two to five, so the request was rejected
inside the framework and arrived as a bare digest.

A phone is the better place for all of it. Nothing large is uploaded — the
browser sends the *text* — there is no function timeout to run into, and the
language data is fetched once per device instead of once per cold start. The
preprocessing moved with it: greyscale and a contrast stretch on a canvas,
doing sharp's old job with the decoder the browser already has. Progress is
reported the whole way through, because silence was indistinguishable from the
hang it replaced.

### S5b · Say what you want to keep, in the thing itself — DONE 11 Sep 2026

**Reported 11 Sep 2026, and it is wrong behaviour rather than missing polish.**
Setting "keep 6" on a box of six eggs, with one box already in, suggests buying
**five more boxes — thirty eggs.** Reproduced exactly.

The cause is that `restock_to` counts *packs* while a person counts *the thing*.
Nobody thinks "keep two boxes of eggs"; they think "keep six eggs". The field
does not say which it means, so both readings look right and only one is.

The fix is to stop having two kinds of target. Today there are two columns —
`restock_to` in packs for packaged things, `restock_min` in the item's own unit
for loose ones — which is two rules to learn and a seam to fall down. Instead:

1. **One target, always in the item's own unit.** Keep 6 eggs. Keep 500ml of soy
   sauce. Keep 1kg of flour. The same sentence whether or not it comes in a pack.
2. **Convert to packs only when buying**, rounding up to whole ones. Short 4 eggs
   against a box of six buys one box, not four.
3. **The field says its unit out loud** — "Keep at least ___ eggs" — so the
   number cannot be misread in the first place.
4. **Migrate the existing targets**: a `restock_to` of N packs becomes
   `N × pack_size` in the item's unit, which preserves what people meant even
   though it is not what they typed.

Worth doing at the same time, since it is the same confusion: a part-used open
container currently counts as a whole one you have. That is right for a bottle of
soy sauce and wrong for a box with two eggs left in it, and counting the actual
amount rather than the container makes the question disappear.

**Done.** One column, `items.restock_target`, always in the item own quantity
unit. Packs appear only when buying, where the shortfall rounds UP to whole ones -
you cannot buy two thirds of a box. `restock_to` and `restock_min` are frozen as
the way back.

The five cases that matter, all verified against a clone:

| | |
| --- | --- |
| box of 6, one box in, keep 6 | buy nothing *(was: 5 boxes)* |
| box of 6, 2 eggs left, keep 6 | 1 box, 4 short |
| 500ml bottles, 320ml left, keep 1L | 2 bottles, 680ml short |
| loose, 250g in, keep 500g | 250g |
| loose, 900g in, keep 500g | buy nothing |

The part-used-container rule went with it. Comparing real totals rather than
counting containers makes "does a box with two eggs in count as one I have"
stop being a question.

# Wave C — the pantry notices things

### S6 · Nutrition — DONE 11 Sep 2026

**Fetched once per barcode, then read from our own database forever.** Luna's
call, and the right one: Open Food Facts is free and volunteer-run, and a
barcode's product does not change its recipe, so asking twice spends somebody
else's machine to learn what we already know.

The cache lives on `products`, keyed by barcode, because that is the thing the
figures describe. `nutrition_checked_at` is what makes it a cache rather than a
guess: a row with a date and all-null figures means *asked, and they do not
know*, which is an answer worth keeping — without it every spice would be
re-fetched on every scan. Items get a copy, so grouping a whole shelf is one
query against one table rather than a join per row.

**Grouping is by share of energy, not by weight.** By weight almost everything
reads as carbohydrate, because fat is light and carries more than twice the
energy per gram — butter is 82g fat to 0.6g carbohydrate and would still sort
under carbs. Energy share is what people mean when they call something a fat.

Against the real pantry: butter 99% fat, icing sugar 100% carbs, dashi stock 67%
protein, chilli flakes 48% fat — which reads as "Fat" rather than "Mostly fat",
since a claim needs to clear half the energy to earn the word. Ten items have no
figures and sit in "Not known", last, because that is not a kind of food.

`scripts/fetch-nutrition.mjs` backfilled the barcodes scanned before any of this
existed: 12 of 18 had figures, one request each, a pause between them, and every
answer stamped so a second run costs the catalogue nothing.

### S7 · Suggestions and the cooked log — DONE 11 Sep 2026

**Cook this before it goes off.** The stock page always listed what was
expiring, which tells you there is a problem without helping with it. Each item
now carries the recipes that use it, ranked by how much of the rest is already
in — a recipe needing five other things you do not have is not a rescue, it is a
shopping trip. The proportion is shown rather than the shortfall: "5/6" says
make-this-tonight in a way "1 missing" does not.

The deadline is still whichever comes first of the printed date and
`opened_at + shelf_life_days`, computed once in `getExpiring`, so there is no
second definition of "going off" to disagree with the first.

Items nothing can be made from stay on the list. They are the ones actually
about to be thrown away, which makes them the most worth seeing.

**The cooked log** at `/cooked`: names and days, read straight off `cook_events`.
No heatmap, as asked. Undone cooks are excluded rather than struck through —
undoing one means it did not happen. Sharing the page is **not touched in a
while**, the same question from the other end, with the recipes that would use
the thing up.

**Two container bugs fixed on the way through.** `getExpiring` and
`getStockedItemNames` both tested `quantity > 0`, which has meant "what is in
the OPEN one" since containers arrived — so three sealed tins read as nothing
there, and an unopened pack could go off unmentioned.

### S8 · Remix — DONE 11 Sep 2026

Forking existed but was only reachable as "Save to my recipes" on somebody
else's page, and showed one hop of attribution. Now:

- **Remix works on your own recipes too**, which is the point of the word. The
  commonest reason to copy a recipe is to try it differently, and that is as
  true of something you wrote as of something you found. Your own copy gets
  "(remix)" appended, because two identical names in a list help nobody.
- **The lineage goes all the way back**, not one step. A recipe three people
  have adapted has three people to thank.
- **"Remixes of this"** shows what has been made from it.

**The two directions are deliberately not symmetrical, and this is the part
worth not breaking later.** Looking *back* is a credit, so it skips the
visibility rule: "adapted from @sam" has to survive Sam making the original
private, or taking your own copy private would erase who you got it from. Only
the name and the author travel — never ingredients, never method. Looking
*forward* is a list of other people's work, so it obeys visibility like
everything else: somebody's half-finished variation is not the original
author's to show off.

Verified on a clone with a three-deep chain across two people and a private
link in the middle: the private ancestor is still credited, while each person
sees only their own private remix and not the other's.

A copy always starts private, whatever the original was. Publishing is a
decision, and inheriting it from somebody else's recipe would make it by
accident.

---

**Rough total: 9.5 to 10.5 days.** Wave A is the one that changes how the app feels, B is
the one that changes whether the data stays true, and C is the one that makes it
useful without being asked.
