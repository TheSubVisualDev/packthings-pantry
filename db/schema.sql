-- Pantry tracker schema. Safe to re-run.
-- Canonical units are fixed per ingredient; conversion only ever happens
-- within a dimension (mass/volume/count), never across.

CREATE TABLE IF NOT EXISTS items (
  id             INTEGER PRIMARY KEY,
  kitchen_id     INTEGER REFERENCES kitchens(id) ON DELETE CASCADE,
  name           TEXT NOT NULL UNIQUE,
  quantity       REAL NOT NULL,
  canonical_unit TEXT NOT NULL,   -- 'g' | 'ml' | 'count'
  dimension      TEXT NOT NULL,   -- 'mass' | 'volume' | 'count'
  category       TEXT,
  location       TEXT,            -- where in the kitchen: Fridge | Freezer | ...
  expiry_date    DATE,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A recipe is a document, not a list: a blurb, timings, where it came from,
-- ordered ingredients and ordered steps. Timings are what it takes at base
-- servings; scaling a cook doesn't scale the simmer.
CREATE TABLE IF NOT EXISTS recipes (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,             -- a line or two, shown above the ingredients
  base_servings INTEGER NOT NULL,
  prep_minutes  INTEGER,
  cook_minutes  INTEGER,
  source        TEXT,             -- a URL, a book, a person, or "Claude"
  rating        INTEGER,          -- shared across the household, null until rated
  times_cooked  INTEGER DEFAULT 0,
  notes         TEXT,             -- what happened last time you made it
  updated_at    TIMESTAMP         -- set explicitly on write; no default, because
                                  -- ALTER TABLE ADD COLUMN can't take one
);

-- item_id is the link to stock; item_name stays alongside it rather than being
-- replaced by it. A recipe calling for "firm tofu" that decrements a pantry row
-- called "Tofu" should still read "firm tofu" on the page - the recipe's own
-- wording is part of the recipe. Null item_id means the line was never matched,
-- which is exactly the "not in pantry" case the cook flow already handles.
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id   INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,        -- as the recipe says it
  quantity  REAL NOT NULL,
  unit      TEXT NOT NULL,        -- as written in the recipe; converted at cook-time
  note      TEXT,                 -- "finely chopped", "at room temperature"
  optional  INTEGER NOT NULL DEFAULT 0,
  section   TEXT,                 -- "For the sauce"
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id, position);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_item ON recipe_ingredients(item_id);

-- Method, in order. `minutes` is for the step that says "simmer for 20", so a
-- cooking view can offer a timer rather than making you read it off the text.
CREATE TABLE IF NOT EXISTS recipe_steps (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL DEFAULT 0,
  section   TEXT,                 -- "Prep", "The stew"
  body      TEXT NOT NULL,
  minutes   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps(recipe_id, position);

-- Which ingredients a step actually uses, so the method can show "400g tofu,
-- 2 tbsp gochujang" beside the instruction instead of sending you back up the
-- page mid-cook. Optional per step: a recipe with none of these still works.
CREATE TABLE IF NOT EXISTS recipe_step_ingredients (
  step_id       INTEGER NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (step_id, ingredient_id)
);

-- One row per cook, so a cook can be reversed and the household has a history.
-- `changes` holds deltas, not the quantities that were there before: Claude
-- Code writes to this database too, so stock may have moved since. Adding a
-- delta back preserves an edit made in between; restoring an absolute would
-- silently discard it. A clamped-short line records what was actually taken.
CREATE TABLE IF NOT EXISTS cook_events (
  id         INTEGER PRIMARY KEY,
  kitchen_id INTEGER REFERENCES kitchens(id) ON DELETE CASCADE,
  cooked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  kitchen_id INTEGER REFERENCES kitchens(id) ON DELETE CASCADE,
  item_id   INTEGER REFERENCES items(id) ON DELETE SET NULL,
  name      TEXT,
  brand     TEXT,
  pack_size REAL,
  pack_unit TEXT,
  seen_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_item ON products(item_id);
CREATE INDEX IF NOT EXISTS idx_items_kitchen ON items(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_products_kitchen ON products(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_cook_events_kitchen ON cook_events(kitchen_id);

-- People. Invite-only: there is no self-serve signup, so no email is stored,
-- nothing is verified, and a forgotten password is reset by whoever runs the
-- pantry rather than by a mail round-trip.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,   -- lowercase, what @mentions will use
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- scrypt, see lib/auth.ts
  avatar_url    TEXT,
  -- Per-user key for the Claude endpoint. Replacing a row's token revokes that
  -- person's API access without touching anyone else's.
  api_token     TEXT UNIQUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_api_token ON users(api_token);

-- The only way in. A code is single-use: redeeming it stamps redeemed_by,
-- which is also the audit trail of who let whom in.
CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note        TEXT,                     -- "for Sam", so a stale code is identifiable
  redeemed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invites_creator ON invites(created_by);

-- A kitchen is a stock list with people attached. Most households have one;
-- the point of having several is a second home, or a friend's cupboard you can
-- see but not touch.
CREATE TABLE IF NOT EXISTS kitchens (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kitchens_owner ON kitchens(owner_id);

-- Who can do what. 'owner' manages people and can delete the kitchen, 'editor'
-- changes stock and cooks, 'viewer' only looks - which is the sharing case: a
-- friend seeing what you have so they can suggest something to make.
CREATE TABLE IF NOT EXISTS kitchen_members (
  kitchen_id INTEGER NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer',   -- owner | editor | viewer
  joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kitchen_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_members_user ON kitchen_members(user_id);

-- Where things live, per kitchen. Was a hardcoded list, which assumed every
-- home has a spice rack and none has a garage freezer. `position` keeps the
-- order you'd actually walk them in, which is not alphabetical.
CREATE TABLE IF NOT EXISTS kitchen_locations (
  id         INTEGER PRIMARY KEY,
  kitchen_id INTEGER NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_kitchen_locations ON kitchen_locations(kitchen_id, position);
