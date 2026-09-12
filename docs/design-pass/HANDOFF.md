# Handoff: Pantry — Phase 4 Design Pass

## Overview
A mobile-first redesign of the Packthings pantry tracker (one household, used one-handed
in a kitchen on an iPhone). This pass solves the six ranked problems from
`docs/DESIGN-BRIEF.md` as layout & hierarchy — plus several "cyborg" flow optimisations
that let the app do more of the filing. Every screen is drawn on the real **Fridge Door**
palette and type from the existing repo.

## About the design files
`Pantry Design Pass.dc.html` is a **design reference**, not production code. It is a single
streaming HTML prototype (a "Design Component") showing intended look, layout, and a few
live interactions. **Do not ship it.** The task is to recreate these screens in the existing
codebase — **Next.js (App Router) + React + Tailwind v4**, repo
`TheSubVisualDev/packthings-pantry` — using its established primitives and patterns.
Icons in the mock are the Material Symbols font used as stand-ins; the real app uses
**lucide-react** (icon names are called out per screen below).

## Fidelity
**High-fidelity.** Colors, type, spacing, and radii are final and taken from
`app/globals.css`. Recreate pixel-closely using the repo's components. Two boards
(`1s`, `1u`) are documentation/spec, not screens to build.

## Target codebase — reuse, don't reinvent
Build on the existing primitives in `components/ui/`:
- `Sheet` — the one modal (bottom sheet on phone → centred panel at `sm:`).
- `Segmented` — one-of-N view switch (muted track, white active pill).
- `FilterChips` — narrowing a list; `quiet` prop = outline (a fact, not a choice).
- `Page` / `PageTitle` — shell in four named widths (`form`/`read`/`list`/`wide`), `pb-32`.
Nav: `components/bottom-nav.tsx` (phone) + `SiteHeader` segmented tabs (desktop).
The FAB/add sheet is `components/add-menu.tsx`.

## The one rule (carried from the brief)
**Mobile first, desktop serviceable.** Every `sm:` rule makes something *smaller/tighter/
wider*, never bigger. Base controls 44px; `sm:` may drop to 32–36px. Rows of controls
scroll sideways rather than wrap. Dialogs are bottom sheets → centred panels at `sm:`.

## Two rules about meaning (load-bearing — keep however visuals change)
1. **An opinion ≠ a measurement.** A typed tag is a solid chip with a remove ✕; a derived
   fact ("35 min", "No oven") is an outline with no remove. See `1e`.
2. **Not having something is not an error.** "To buy" / "running low" render in a muted
   chip, never `--destructive`. Destructive colour is only for things that will actually go
   wrong (past use-by, a failed cook).

---

## Screens / Views

### Stock — DECISION: two directions (`1a`, `1b`)
Replaces `app/pantry/page.tsx`. Both delete the old wall of six stacked controls.
- **`1a` Stock is the stock** — the Tonight suggestion moves entirely to `/tonight`.
  Top → bottom: header (kitchen name + `29 items · 7 tags`), a slim **Going off** band
  (the one thing no other screen shows), group-by `Segmented` (Tag / Nutrition / Place)
  with a `Select` button, then grouped stock cards.
- **`1b` One answer on top** *(user's pick)* — adds a single collapsed suggestion row above
  the going-off band: terracotta card, `local_fire_department` icon, "TONIGHT / Chana
  masala / Uses up your spinach · all in stock", white "Cook" pill. Then going-off band
  (two compact cards + `+N`), group-by, stock.
- Stock rows: 44px min, hairline dividers, name left, amount right in **IBM Plex Mono**
  `text-quantity`. "open" marker is a muted suffix.
- Group-by label wording: use **"Place"** not "Where".

### Adjust in place — `1t` (cyborg optimisation, INTERACTIVE in mock)
Fold `components/quick-adjust.tsx` into the stock list. Tapping a stock row expands an
inline stepper beneath it (− 44px circle / mono amount / + 44px terracotta circle, `±100 g`
label) plus quick chips: "Used it all", "Opened", "Open item →". No navigation. This makes
the most-frequent action 0 screens deep instead of 3.

### Tonight — `1c` (INTERACTIVE: Cook loop)
`app/tonight/page.tsx`. Title "What to cook" + one-line rationale, `FilterChips`
(Any / Under 30m / Veggie / Asian). **Winner card** (`components/tonight-card.tsx`): label
"Tonight" + "USE IT UP" badge (`alarm`), 22px name, reason line, full-width "Cook it".
**Nearly card**: dashed border, "One thing away" (`shopping_basket`), "+ Add tamarind to
list". Then "Other ideas (9)" chip.
- **Close the cook loop** (built in mock): "Cook it" → replaces the card with a terracotta
  "Cooked!" confirmation: `celebration` icon, streak line ("3 nights, nothing wasted"),
  a "Taken off your shelves" list (Spinach 400 g → 0, Paneer 225 g → 0, Onion 1 → 5),
  "…ran out — added to your list", and **Undo / Done**. Implement as optimistic deduct +
  undo (align with `applyDelta` / cook actions in `lib/`), no confirm form.

### Cookbook — `1d`
`app/recipes/page.tsx`. Adds a `Segmented` under the title for the separation the brief
asked for: **Cooking (18) · Saved (6) · Wrote (4)** — i.e. adopted into the cookbook vs
saved-from-others vs authored-by-you. Search field, `FilterChips`, then
`RecipeBrowseCard` list (64px thumbnail, 2-line title, "35 min · serves 2", match badge
"you have everything" solid / "5/6 in stock" muted).

### Recipe — `1e`
Photo header (flat per-id tint placeholder — **keep the existing charming flat tint**, not
stripes; `placeholder(id)` in `recipe-browse-card.tsx`), back/more circle buttons. Title,
then chips demonstrating meaning rule 1: **solid ink chips with ✕** (typed: veggie, Indian)
beside **outline chips, no ✕** (derived: 35 min, No oven). "You have everything for 2
servings" panel. Ingredient list. Bottom: **two cook entry points** — "Step-by-step"
(`auto_stories`) and "Read as list" (`list_alt`) — this is the interactive/static choice.

### Cook — `1f` (story-style, approved)
Dark full-screen. Progress segments, step counter, ingredient chips for *this* step,
**step photo** (steps carry images — display them), large 20px instruction type, a
**"Meanwhile" parallel-task callout** (`bolt`, e.g. "Get the rice on — 10 min" with its own
timer) for recipes with parallel steps, an inline step timer, Back / Next. Keep the
"story" feel; support parallel steps via the Meanwhile block.

### Add item — `1h` (INTERACTIVE: vessel control)
`components/add-item-form.tsx`. Three fields + button; 11 optional fields folded behind one
line. **Provenance banner** (mandatory): "Filled in like your Soy sauce" + Undo (guesses
only land in untouched fields — see `lib/suggest.ts`). **Amount = the vessel control** (see
`1s`): tap a level (Empty / ¼ / ½ / ¾ / Full) or drag the liquid; number entry stays
available but never required.

### Vessel language — `1s` (SPEC BOARD, implement as one component)
One amount control, behaviour chosen from the item's data — **not** a bottle special-case:
- `dimension: mass|volume` **with** a `pack_size` → **Fill** (bottle/jar/bag/tube glyph
  from tags/`pack_unit`); level maps 0→pack_size.
- `dimension: count` → **Count** (stepper + tap-a-carton for eggs/tins).
- `unspecified` flag → **Rough** (A little / Some / Loads).
Input: `{dimension, pack_size, pack_unit, tags}` (all already on the item). Vessel art is a
lookup, not per-food code. Use everywhere "how much" is asked (add, adjust, item detail,
receipt).

### Item detail — `1i`
`components/item-detail.tsx`. Deadline first (destructive only when actually overdue/open),
the one worth-asking question ("Opened — undo"), then inferred details (In the open one,
Keeps once open, **Place**, Date on packet) and tag chips (meaning rule 1).

### Shopping list — `1j`
`lib/shopping.ts` / `app/pantry/list`. Made streamlined + fun: a **progress bar** ("3 of
10"), items **grouped by the order you walk the shop** (Produce / Chilled / Cupboard) with
52px tap rows and big check circles, source chips ("Pad thai", "running low" — muted, not
destructive), and an "In the basket · N" section with crossed-off, dimmed rows.

### Selection mode + bulk bar — `1k`
`components/stock-list.tsx` + `bulk-bar.tsx`. Solves the three discoveries: (1) **entering**
— a dark context bar replaces the header ("3 selected", ✕, "Select all"); (2) **what's
selectable** — every row shows a check circle, picked rows tinted; (3) **what the bar does**
— a labelled "Do to all 3" grid (Move `place` / Tag `sell` / Opened `check_circle` /
Delete `delete` in destructive text) + a primary "Adjust these" (`tune`). Note: the add FAB
hides while `[data-bulk="on"]` (globals.css already does this).

### Receipt review — `1l`
`components/receipt-scanner.tsx`. Silent-accept: a summary card ("15 matched, ready to go
in · 3 need a quick look", `task_alt`), then only the **unsure** lines as questions
(receipt wording kept visible with option chips + Skip; unmatched → "Add it"). Confident
matches collapse behind "15 matched — review if you like". Primary "Add 16 to stock".

### Barcode scan — `1m`
`components/barcode-scanner.tsx`. Dark viewfinder with a framed reticle + scan line, then a
found-product sheet (thumbnail, name, mono `barcode · 400 g tin`, `check_circle`), a note
that shelf/tags come from your kitchen and pack size off the packet (`lib/off.ts`), and
"Add to pantry".

### Discover — `1n`
`app/discover/page.tsx`. **Social, not a social network** — one tab, recipe-first:
- **Cooking this week** — activity rows (avatar + "@sam cooked it" + actionable match badge
  + `bookmark_add`).
- **Cooks trust these** — cards with trust signals ("cooked 34× · saved by 12", "★ 4.7"),
  not likes.
- **Cooks like you** — follow suggestions framed by overlap ("8 recipes you've saved",
  "cooks the same veg-heavy way") + Follow buttons.
Deliberately omit: comment threads, DMs, notification feed, follower-count clout. If fuller
social is wanted later, add **recipe-level tips/variations**, not a global feed.

### Add menu — `1o` (learning FAB)
`components/add-menu.tsx`. `Sheet` with a "What you use most" pair (large targets — the two
actions this person actually uses) above a "More" grid (Item / Barcode / Receipt / Recipe /
Cooked). Order learned from frequency; can also be context-aware (default Adjust on stock,
Add-to-list on a recipe).

### Empty state — `1p`
Every empty state offers the thing that fixes it. Stock-empty: big icon, "Nothing on the
shelves yet", and three actions (Scan a receipt / Scan a barcode / Add by hand).

### Login — `1q`
Warm surface, mark tile, "Pantry" + one line, Email/Password, "Sign in", "Create an
account". `app/login`.

### Profile & settings — `1r`
Unified into one account screen (recommended): avatar + @handle, a **Kitchen** group
(current kitchen w/ role, Invite someone) and a **Settings** group (Default servings, New
recipes are Private, Password), Sign out in destructive text. `app/settings`,
`app/kitchens`, `components/account-menu.tsx`.

### Sanity check / optimisations — `1u` (SPEC BOARD)
The cyborg flow wins, ranked: adjust-in-place (built, `1t`), close the cook loop (built,
`1c`), a dying item is one tap from a plan (going-off chip → Tonight pre-filtered), snap the
shelf (reuse receipt OCR on a cupboard), context-aware FAB, one-line/voice quick add
(parses to a vessel level), and quiet rewards (Shelved! moment, nothing-wasted streak).

---

## Interactions & behavior
- **Vessel (`1h`, `1s`)**: tap a level OR pointer-drag the liquid; fill animates with a
  slight overshoot (`transition: height .5s cubic-bezier(.34,1.45,.5,1)`). Snap to 5%.
  Active level chip = terracotta; number entry optional.
- **Adjust in place (`1t`)**: tap row → expand stepper; ± change quantity optimistically
  (move before the server — DB is remote), "Used it all" → 0.
- **Cook loop (`1c`)**: "Cook it" → optimistic deduct + "Cooked!" confirmation with Undo;
  ran-out items auto-added to list.
- **Selection**: tap "Select" → context bar + per-row check circles; FAB hides.
- **Receipt**: confident lines pre-accepted; only unsure lines interactive.
- Nav is URL-based (segmented = links, back-buttonable). Sheets: Escape / backdrop / ✕,
  trap focus, lock background scroll (already in `Sheet`).

## Design tokens (from `app/globals.css` — Fridge Door, light only)
| Token | oklch |
|---|---|
| background (warm paper) | `oklch(0.956 0.013 64)` |
| foreground / ink | `oklch(0.26 0.012 55)` |
| card | `#fff` (`oklch(1 0 0)`) |
| surface-raised | `oklch(0.985 0.008 60)` |
| primary (terracotta) | `oklch(0.579 0.143 36)` |
| primary-foreground | `#fff` |
| muted-foreground | `oklch(0.62 0.014 60)` |
| border | `oklch(0.882 0.023 72)` |
| chip | `oklch(0.965 0.012 60)` |
| label | `oklch(0.595 0.098 42)` |
| quantity | `oklch(0.72 0.02 65)` |
| destructive | `oklch(0.55 0.16 40)` |

- **Radii**: card `20px` (`rounded-[20px]`), controls/fields `14px`, chips `rounded-full`.
- **Card shadow**: `0 1px 3px rgba(0,0,0,0.05)`.
- **Type**: **Manrope** everywhere (400–800); **IBM Plex Mono** for amounts, barcodes, keys.
  Headings `font-extrabold tracking-[-0.02em]`; body `font-medium`; secondary `font-semibold`;
  labels `text-xs font-bold uppercase tracking-[0.08em] text-label`.
- **Spacing**: page `px-5 pt-6 pb-32 sm:px-9`; base control height 44px (`sm:` 32–36px).

## Assets
- Icons: **lucide-react** (Boxes/Inventory, UtensilsCrossed/skillet, BookOpen, Compass,
  Plus, Barcode, Receipt, ShoppingBasket, MapPin, Tag, Trash2, Sliders, AlarmClock,
  Camera, Check, X, etc.). The mock uses Material Symbols only as a stand-in.
- Logo/mark: `public/pantry-logo.svg`, `components/pantry-mark.tsx`.
- Recipe images: real photos where present; otherwise the **flat per-id tint** placeholder
  (`placeholder(id)`), NOT gradients-behind-a-mask (those render black on iOS).

## Files
- `Pantry Design Pass.dc.html` — the full prototype (all screens `1a`–`1u`). Open in a
  browser to see it; the vessel, adjust-in-place, and cook-loop are live.
- `github.md` — repo association, screen→source map, and tokens.
