# What got built from the design pass

12 Sep 2026. `docs/design-pass/HANDOFF.md` is what Claude Design handed over;
this is what happened to it, board by board, and what was deliberately not
done. Written so this can be picked up cold.

## Boards

| Board | What it is | State |
|---|---|---|
| `1b` | Stock, one answer on top | built (`02be561`) |
| `1t` | Adjust in place | built (`02be561`) |
| `1c` | Tonight, and the cook loop | built |
| `1d` | Cookbook: cooking / saved / wrote | built |
| `1e` | Recipe header and the more menu | built |
| `1f` | Step-by-step cook screen | built, new route `/recipes/[id]/cook` |
| `1h` `1s` | The vessel, on the add form | built |
| `1i` | Item detail, shelf first | built, vessel writes here |
| `1j` | Shopping list for walking with | built |
| `1k` | Selection mode and the bulk bar | built |
| `1l` | Receipt review, silent accept | built |
| `1m` | Barcode viewfinder and the found card | built |
| `1n` | Discover: cooked, trusted, cooks like you | built |
| `1o` | The add menu that learns | built |
| `1p` | Empty states that offer the fix | built (stock, cookbook, cooked) |
| `1q` | Login | built |
| `1r` | Account page with the kitchen on it | built |

## What Luna decided about the four open questions

- **Rough amounts** are not a third control - they are what the vessel already
  does. Dragging the liquid to where it looks on the real bottle is a guess by
  eye, so the number it produces snaps to 25ml or 25g (a twentieth of the
  container for small ones) and the readout says "about right, to the nearest
  25ml". The number is still what gets saved. Done.
- **Source chips** are in. `shopping_list.source` is free text, migrated
  through the clone-first ritual: a shortfall line says the recipe name,
  restock says "running low", and a mid-cook one says "ran out cooking Chana
  masala". Done.
- **Streaks: no.** Struck off rather than deferred.
- **The product thumbnail is not worth it for now.** Left alone.

## Things found while building

Each of these was older than the design pass:

- `CookLineResult.remaining` is the OPEN container, and the cook confirmation
  printed it after the word "left" - so a cook that finished the open bottle
  read "0 left" with two sealed ones behind it. There is a `remaining_total`
  now. Fourth bug in the `quantity` vs total family.
- Seven queries handed libSQL `Row` instances to client components, which React
  refuses to serialise: one warning per row and the slow path for the whole
  tree. All of them go through `plainRows` now.
- `[data-bulk="on"] [data-fab]` had been matching nothing since the add button
  moved into the tab bar, so the bulk action bar sat under the nav on a phone
  and its primary button was the half you could not press.
- A recipe card printed "50 min" on one line and a "90 mins" bucket chip under
  it. Derived tags carry a `kind` now so a listing can drop the bucket.
- A box of six eggs read "6count packs", and a shopping line read "1pack".
- **Undo restored the right total to the wrong shelf.** `undoCook` did
  `quantity = quantity + delta` and never touched `sealed_count`, so undoing a
  cook that took 600g out of a 1kg bag plus a sealed one left a single open
  1.4kg bag - a container that does not exist. It goes back through
  `ADJUST_SQL` now, which is the one place the cascade rule is written. Found
  by driving a whole cook through the step-by-step screen against a clone and
  reading the rows afterwards; it was invisible from the screen.
- **Cooking decremented `unspecified` rows**, which have no number to
  decrement - and `ADJUST_SQL` refuses them, so the take could not even be
  undone. Those lines are now left alone.

## The screenshot harness grew three flags

`scripts/screenshot.mjs`, all optional:

    SHOT_CLICK="Select,css:ul li:first-child button"   press things first
    SHOT_ANON=1                                        no session cookie
    SHOT_CAMERA=1                                      a fake camera

Between them they make selection mode, the signed-out screens and the barcode
viewfinder photographable, which none of them was. Two throwaway preview
routes were used for states that need a server round trip to reach - the
cooked confirmation and the receipt review - and deleted afterwards; that
trick is worth repeating rather than shipping scaffolding.
