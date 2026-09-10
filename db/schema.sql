-- Pantry tracker schema. Safe to re-run.
-- Canonical units are fixed per ingredient; conversion only ever happens
-- within a dimension (mass/volume/count), never across.

CREATE TABLE IF NOT EXISTS items (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  quantity       REAL NOT NULL,
  canonical_unit TEXT NOT NULL,   -- 'g' | 'ml' | 'count'
  dimension      TEXT NOT NULL,   -- 'mass' | 'volume' | 'count'
  category       TEXT,
  location       TEXT,            -- where in the kitchen: Fridge | Freezer | ...
  expiry_date    DATE,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipes (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  base_servings INTEGER NOT NULL,
  rating        INTEGER,          -- shared across the household, null until rated
  times_cooked  INTEGER DEFAULT 0,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,        -- matched against items.name
  quantity  REAL NOT NULL,
  unit      TEXT NOT NULL         -- as written in the recipe; converted at cook-time
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- One row per cook, so a cook can be reversed and the household has a history.
-- `changes` holds deltas, not the quantities that were there before: Claude
-- Code writes to this database too, so stock may have moved since. Adding a
-- delta back preserves an edit made in between; restoring an absolute would
-- silently discard it. A clamped-short line records what was actually taken.
CREATE TABLE IF NOT EXISTS cook_events (
  id         INTEGER PRIMARY KEY,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  servings   INTEGER NOT NULL,
  cooked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  undone_at  TIMESTAMP,             -- null until undone; guards double-undo
  changes    TEXT NOT NULL          -- JSON: [{ item_id, delta, unit }]
);

CREATE INDEX IF NOT EXISTS idx_cook_events_recipe ON cook_events(recipe_id, cooked_at DESC);

-- Scanned barcodes, and what they turned out to be. `item_id` is the human's
-- decision, not a guess: a scan of own-brand linguine might belong to a
-- generic "Pasta" row or deserve its own, and nothing in the barcode says
-- which. Null until someone says. Pack size is stored canonically so a
-- restock can add one pack without re-reading the label.
CREATE TABLE IF NOT EXISTS products (
  barcode   TEXT PRIMARY KEY,
  item_id   INTEGER REFERENCES items(id) ON DELETE SET NULL,
  name      TEXT,
  brand     TEXT,
  pack_size REAL,
  pack_unit TEXT,
  seen_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_item ON products(item_id);
