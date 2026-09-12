repo: TheSubVisualDev/packthings-pantry
branch: main
path: (whole repo — read-only source for the design pass)

## Last sync
date: 2026-09-12T09:36:00Z
# commit omitted: only a tree hash (d51c0250b333) was resolved, not a commit sha

### Updated in this project
- Phase 4 design pass drawn as iPhone screens on the real Fridge Door palette (`Pantry Design Pass.dc.html`)
- Stock screen offered as two directions (1a stock-first, 1b collapsed suggestion) — awaiting the user's pick
- Recipe editor reshaped into 4 resumable parts; selection/bulk bar and receipt review designed for the first time
- Design source only — no repository UI was recreated or overwritten

## Screen map
| Screen (badge) | Built from |
|---|---|
| Stock 1a / 1b | app/pantry/page.tsx, components/stock-list.tsx, use-it-up.tsx, tonight-card.tsx |
| Tonight 1c | app/tonight/page.tsx, components/tonight-card.tsx |
| Cookbook 1d | app/recipes/page.tsx, components/recipe-browse-card.tsx |
| Recipe 1e | components/cook-panel.tsx, lib/types.ts (RecipeIngredient) |
| Cook 1f | components/cook-panel.tsx, cook-timers.tsx |
| Recipe editor 1g | DESIGN-Recipe-Editor.html, lib/recipe-schema.ts, suggest.ts |
| Add item 1h | components/add-item-form.tsx, lib/suggest.ts |
| Item detail 1i | components/item-detail.tsx |
| Shopping list 1j | lib/shopping.ts, app/pantry/list |
| Selection + bulk 1k | components/stock-list.tsx, bulk-bar.tsx, globals.css |
| Receipt review 1l | components/receipt-scanner.tsx |
| Barcode scan 1m | components/barcode-scanner.tsx, lib/off.ts |

## Tokens carried over (app/globals.css — Fridge Door, light only)
background oklch(0.956 0.013 64) · ink oklch(0.26 0.012 55) · primary oklch(0.579 0.143 36) · border oklch(0.882 0.023 72) · chip oklch(0.965 0.012 60) · label oklch(0.595 0.098 42) · quantity oklch(0.72 0.02 65) · destructive oklch(0.55 0.16 40) · card radius 20px, control 14px, chips full · Manrope + IBM Plex Mono.
