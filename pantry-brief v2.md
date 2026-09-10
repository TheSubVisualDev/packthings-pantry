# Pantry Tracking + Meal Suggestions — Project Brief

## Purpose

A personal pantry tracker with meal suggestions, for a single shared household (me + partner). Delivered as a **deployed web app** (Next.js) so it's usable from a browser, not only a terminal. Claude Code builds and maintains the codebase *and* remains a direct writer to the database (adding/transcribing recipes, bulk stock edits). SQLite-backed. Read/write: pantry stock changes as items are used or bought; recipes are added, rated, and matched against what's currently in stock.

**Scope discipline:** this is pantry + recipes only. Broader finances tracking is explicitly *out of scope* and a possible separate future project — do not build general-purpose or finance-shaped abstractions to accommodate it. If finances happens later, it's its own schema/build.

## Stack

- **Next.js** frontend + server, **self-hosted on a Hetzner VPS**. Deployment target is a persistent-disk box specifically — *not* Vercel/serverless, where the ephemeral read-only filesystem would make an on-disk SQLite file non-viable (writes vanish on cold start). Hetzner keeps the DB as a real file on a real disk, which is the whole reason SQLite still works.
- **SQLite** (single file on the Hetzner disk, no separate DB daemon). Still chosen over Postgres deliberately — pantry scope doesn't justify a hosted DB, network round-trips, or credential management for a two-person household.
- **Two writers, not one.** Both the Next.js server and Claude Code write to the same `.db` file. This is the one assumption that changed from the terminal-only design, and it is *not* free: SQLite must run in **WAL mode** with a sensible **busy-timeout** (e.g. 5s) so a write from one process doesn't error out a concurrent read/write from the other. This is a config step, not a schema change — but it is mandatory, not optional, the moment a long-running server process shares the file with Claude Code. Single physical disk only; SQLite over a network filesystem (NFS/SMB) is unsafe and out of scope.
- **Backup, backup escape hatch — Neon.** If concurrency ever genuinely chafes (lock contention under real use, or a second human writer appears), the documented migration is **Neon (serverless Postgres)**, not a bigger SQLite. The schema is ~95% portable — `REAL`/`TEXT`/`INTEGER` map directly; the main edits are `INTEGER PRIMARY KEY` → `GENERATED`/`SERIAL` and adopting Postgres' connection-pool model. Treat this as a fork to take *if forced*, not something to pre-build for. Do not add a database abstraction layer "in case we switch" — that's the same premature-generalisation trap the finances scope-out warns against.

## Core model

### Units

Every ingredient has ONE **canonical unit**, fixed at the ingredient level. Canonical units fall in one of two **dimensions**:

- **mass** — canonical unit: grams (g)
- **volume** — canonical unit: millilitres (ml)
- **count** — for countable items (eggs, onions): canonical unit is a plain count, its own dimension.

UK measurements throughout. No cups.

**Equivocation (unit conversion) happens ONLY within a dimension.** A recipe line expressed in tbsp for a volume ingredient converts to ml fine. A recipe line in kg for a mass ingredient converts to g fine. Cross-dimension conversion (g↔ml) is **not** done — it would require per-ingredient density data, which we are deliberately not maintaining.

Conversion factors are a small **hardcoded table** in code, not user-maintained data:

- mass: kg→g (×1000), g→g (×1)
- volume: l→ml (×1000), tbsp→ml (×15, UK), tsp→ml (×5, UK), ml→ml (×1)
- count: no conversion

If a recipe ingredient line's unit is in a **different dimension** than the pantry item's canonical unit, auto-decrement does **not** fire for that line — it flags for manual adjustment rather than silently corrupting the count.

### Servings scaling

Recipes store ingredient quantities at a **base servings** count. At cook-time the user picks how many people to feed; ingredient quantities are multiplied by (chosen / base) **for display and decrement only**. Scaled versions are never written back — stored recipe quantities always stay at base servings.

### Auto-decrement

When a recipe is marked cooked (at a chosen serving count), pantry `items` decrement by the scaled, dimension-matched ingredient quantities. Lines that can't be matched (dimension mismatch, or ingredient not in pantry) are surfaced to the user for manual handling — never silently skipped or zeroed.

**Concurrency note (new):** decrement is now a server-side transaction that can race a Claude Code write. Wrap the read-scale-write of a cook event in a single SQLite transaction so a simultaneous stock edit can't interleave and double-apply or lose a decrement. WAL + busy-timeout (see Stack) makes this safe; without them, a cook-event under concurrent access can corrupt quantities.

### Ranking

Single **shared rating** per recipe (one household, one dashboard). No users table. Ranking on the dashboard sorts by this shared rating. Any smarter suggestion logic (weighting by rating + recency + pantry match) is **query/app logic** (now server route / Claude Code), not schema — keep it out of the table design.

## Schema (starting point)

```sql
items (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  quantity      REAL NOT NULL,
  canonical_unit TEXT NOT NULL,        -- 'g' | 'ml' | 'count'
  dimension     TEXT NOT NULL,          -- 'mass' | 'volume' | 'count'
  category      TEXT,
  expiry_date   DATE,
  updated_at    TIMESTAMP
)

recipes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  base_servings INTEGER NOT NULL,
  rating      INTEGER,                  -- shared, nullable until rated
  times_cooked INTEGER DEFAULT 0,
  notes       TEXT
)

recipe_ingredients (
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id),
  item_name   TEXT NOT NULL,            -- matched to items.name
  quantity    REAL NOT NULL,
  unit        TEXT NOT NULL             -- as written in recipe; converted at cook-time
)
```

Notes:
- No `source_type`/`source_ref` on recipes — source (online vs Claude-transcribed) is just the entry method, not persisted. Add later only if provenance tracking becomes a real need.
- `recipe_ingredients.item_name` matches against `items.name`; consider a foreign key to `items.id` once the ingredient list stabilises, but name-matching is fine to start given single-user entry.
- If migrating to Neon later: `INTEGER PRIMARY KEY` → `GENERATED ALWAYS AS IDENTITY`; `TIMESTAMP`/`DATE` are native in Postgres; everything else is unchanged.

## Reference test case (from real use)

The doenjang-jjigae cook (filed separately in `doenjang-jjigae-recipe.md`) is a good end-to-end exercise for the core model — it hits every mechanic that's easy to get wrong. Use it as an acceptance check, not as seed data:

- **Mixed dimensions in one recipe:** sesame oil / soy / mirin / vinegar in **tbsp & tsp** (volume), tofu in **g** (mass), onions / cucumber / chilli as **plain counts**. Confirms the per-line dimension routing works and doesn't try to cross-convert.
- **Base-servings scaling:** recipe was authored at **base 5**. Cooking it at, say, 2 or 8 should scale display + decrement by (chosen/5) and never write the scaled numbers back.
- **Unmatched-line flagging:** at cook time, **cucumber and sugar were not confirmed in pantry stock**. These lines must surface for manual handling rather than silently decrementing to negative or being skipped — the exact "can't-match" path in Auto-decrement.
- **Notes field carrying real feedback:** the "tofu struggled to absorb the sauce" note is the kind of free-text that lives in `recipes.notes` — validates it's there and displayed, not dropped.

## Open / deferred

- Meal history log (what was cooked when) — not in v1 unless wanted; `times_cooked` covers the minimal case.
- Shopping list generation (what's low / needed for a planned recipe) — natural next feature, not v1. Pairs naturally with the unmatched-line flagging above.
- Per-person ratings — explicitly declined; revisit only if the shared-rating model actually chafes.
- Auth on the deployed frontend — a Hetzner-hosted app is internet-reachable. Even for two people, decide **before deploy** whether it's behind basic auth / a VPN / Tailscale, or open. Not a schema concern, but a deploy-day one that the terminal-only design never had to answer.
