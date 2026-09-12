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

## Deliberately not built

- **Rough amounts** ("a little / some / loads") from the vessel spec `1s`.
  There is nowhere to put the answer. `unspecified` says there is no number,
  and writing 0.5 into a column that means grams would be the app inventing a
  measurement. It wants a schema decision, not a component.
- **Source chips on the shopping list** ("Pad thai", "running low").
  `shopping_list` has no column saying where a line came from. Additive
  migration, worth doing, has to follow the clone-first ritual in `AGENTS.md`.
- **A streak line on the cooked card** ("3 nights, nothing wasted"). Nothing
  in the schema records waste, so it would be a number the app made up, sitting
  among four true ones.
- **A product thumbnail on the barcode card.** `lib/off.ts` does not fetch an
  image and the picture is worth an extra request to Open Food Facts that this
  does not make yet.

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
- A box of six eggs read "6count packs".

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
