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
