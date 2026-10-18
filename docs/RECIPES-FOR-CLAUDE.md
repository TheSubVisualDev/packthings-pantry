# Writing recipes into the pantry

This is for a Claude session — the app, the web, or another Claude Code — that
has been asked to read someone's cookbook and put a recipe into it.

> **The app does not track what is in the cupboard.** It did until v2 (18 Oct
> 2026), when stock tracking was taken out: it was the thing nobody kept up to
> date, so every number in it was wrong. If what someone has in matters to a
> suggestion, ask them.

You do not need this repository.

---

## 1. Getting in

There are two ways in, and **which one you have decides everything below.**

### The connector (the Claude apps)

The pantry is a remote MCP server. Once its owner has added it under
**Settings → Connectors**, you get tools directly:

| Tool | What it does |
|---|---|
| `get_pantry` | The kitchen's cookbook and its open shopping list, plus the units this app accepts. Still called `get_pantry` so existing connectors keep working; it has no stock in it. |
| `list_recipes` | The recipes this account has written |
| `search_recipes` | Search what this account can see, by name or description |
| `get_recipe` | One recipe in full — ingredients and method |
| `create_recipe` | Write a new recipe in. Saves private. |

If you have these tools, **use them and ignore the HTTP sections.** You cannot
make authenticated HTTP calls from a chat session — there is no tool for it —
so the REST API below is not an alternative you can fall back on.

### The HTTP API (Claude Code, or a terminal)

Only reachable where something can actually make the request. Every call needs:

```
Authorization: Bearer <token>
```

Ask the pantry's owner for the token. It is not in this file and should never
be pasted into a chat you don't control. A wrong or missing token gets a plain
`401` with no detail — that is the gate doing its job, not a bug to work around.

The base URL is wherever the pantry is deployed.

> **If you are ever unsure whether you are allowed to write**, ask the person
> first. Reads are safe and repeatable. Writes change a real cookbook that
> someone is going to cook from tonight.

---

## 2. Read the kitchen first

`get_pantry` — or `GET /api/pantry` over HTTP.

This is the only call you need before writing anything. It gives you:

| | What it holds |
|---|---|
| cookbook | The recipes this kitchen cooks: id, name, how often cooked |
| shopping_list | What somebody means to buy: name, amount, and the recipe it is for |
| `legal_units` | **The only units you may use** |
| `stock_tracked` | Always `false`. Nothing here says what is in the cupboard. |

Both are self-describing on purpose. If this file and what the pantry tells you
ever disagree, **the pantry is right** — it ships with the running code, and
this file is a copy.

The shopping list is not the cupboard. Something on it is something they have
*not* got yet. Do not read it as stock in either direction.

An account can have no kitchen at all. That is a normal state, not an error:
recipes can still be written, and the shopping list is then a personal one.

---

## 3. The recipe document

The same document either way: the arguments to `create_recipe`, or the body of
`POST /api/recipes` with `Content-Type: application/json`.

```json
{
  "name": "Doenjang-jjigae",
  "description": "A soybean paste stew that comes together in one pot.",
  "base_servings": 4,
  "prep_minutes": 15,
  "cook_minutes": 25,
  "source": "Claude",
  "notes": "Press the tofu harder than feels necessary.",

  "ingredients": [
    { "item_name": "Doenjang",    "quantity": 60,  "unit": "g",     "section": "The broth" },
    { "item_name": "Sesame oil",  "quantity": 2,   "unit": "tbsp",  "section": "The broth" },
    { "item_name": "Firm tofu",   "quantity": 400, "unit": "g",     "note": "pressed, cubed", "section": "The stew" },
    { "item_name": "Onion",       "quantity": 1,   "unit": "count", "note": "sliced thin",    "section": "The stew" },
    { "item_name": "Cucumber",    "quantity": 1,   "unit": "count", "optional": true,         "section": "To serve" }
  ],

  "steps": [
    { "body": "Press the tofu under something heavy.",        "minutes": 10, "section": "Prep",      "uses": ["Firm tofu"] },
    { "body": "Warm the sesame oil, fry the onion until it gives up.", "minutes": 6, "section": "Prep", "uses": ["Sesame oil", "Onion"] },
    { "body": "Stir the doenjang through and bring it up.",                  "section": "The stew",  "uses": ["Doenjang"] },
    { "body": "Add the tofu and simmer.",                     "minutes": 15, "section": "The stew",  "uses": ["Firm tofu"] }
  ]
}
```

### Required

- `name`
- `base_servings` — a whole number, 1–100
- `ingredients` — at least one

Everything else is optional. A recipe with no `steps` is still valid.

### Fields worth understanding

**`base_servings`** is how many people *the quantities below* serve. Cooking
scales from it; the stored numbers never change. Write the quantities you
actually mean at one serving count and say what that count is. Do not try to
pre-scale anything.

**`unit`** must be one of `vocabulary.units`. At the time of writing:
`kg`, `g`, `l`, `ml`, `tbsp`, `tsp`, `count`, `tin`, `pack`, `jar`. **Read the
endpoint rather than trusting this list.**

There are no cups, no ounces, no "handful". `count` is the unit for whole
things — two onions is `{"quantity": 2, "unit": "count"}`.

`tin`, `pack` and `jar` are the same thing as `count`, there so a line can read
like a recipe: `{"quantity": 1, "unit": "tin", "item_name": "Tinned tomatoes"}`.
A tin is **not** 400g — tins aren't all 400g, and a unit whose size depended on
the product would be unconvertible. If the size matters, put it in `note`.

**`note`** is preparation, not quantity: `"finely chopped"`, `"at room
temperature"`, `"drained"`. It never contains a number that matters.

**`section`** groups lines under a heading — `"For the sauce"`, `"The stew"`.
Ingredients and steps have their own sections and they don't have to match.
Use them when a recipe genuinely has parts; a six-line weeknight dinner does
not need them.

**`steps[].minutes`** is how long that step takes unattended, so the cooking
view can show a timer. Put it on "simmer for 20 minutes", not on "chop the
onion".

**`steps[].uses`** lists `item_name` values *from this same recipe*, so the
method can show "400g Firm tofu" beside the instruction instead of making the
cook scroll back up. This is the most useful optional field in the document and
the one most worth filling in.

---

## 4. Naming ingredients

`item_name` is the ingredient as a person would write it on a shopping list,
because that is where it ends up: shopping for a recipe puts its lines on the
list by name. "Firm tofu", not "tofu (firm, 400g block)". Names are no longer
matched against stock — there is none — so nothing is gained by bending a name
to match something else.

If a step's `uses` names an ingredient that isn't in the recipe, that reference
is dropped with a warning rather than failing the request.

> **Duplicate names are a real limitation.** `uses` binds by name, so if a
> recipe lists "Doenjang" twice, a step saying `uses: ["Doenjang"]` attaches to
> the first. Prefer one line per ingredient and put the split in the `note`.

---

## 5. Units and dimensions

Three dimensions — mass, volume, count — and **conversion only ever happens
within one**. Grams never become millilitres, because there is no density data
in this system and inventing some would make the nutrition figures wrong.

Write the unit a cook would measure with. `3 tbsp` of doenjang is fine; so is
`60 g`. Scaling works within a dimension either way.

For an amount nobody measures — "salt, to taste", "oil for frying" — use the
unit `"some"` with no quantity and put the wording in `note`. Those lines are
never put on the shopping list.

---

## 6. What comes back

**Saved.** `create_recipe` returns the id, the url and any warnings; over HTTP
it is a `201`:

```json
{ "id": 7, "url": "/recipes/7", "warnings": [] }
```

Recipes save **private**. Only the owner can share them, from the recipe page —
so don't tell someone their recipe is public, and don't try to make it so.

**Rejected.** The document is not a recipe, and nothing was written. The tool
returns an error listing every problem; over HTTP it is a `422`:

```json
{
  "problems": [
    { "path": "ingredients[0].unit", "message": "\"cups\" is not a unit this pantry uses. Legal units: kg, g, l, ml, tbsp, tsp, count." }
  ],
  "warnings": []
}
```

Every problem carries the path of the thing that caused it. Fix and resend —
do not retry the same body.

**Warnings on a save mean it saved and something wants a human eye.** Report
them to the person; don't silently swallow them, and don't try to "fix" them by
renaming their ingredients to whatever happens to be in the cupboard.

The one you'll see:

| Warning | What it means |
|---|---|
| `unknown-reference` | A step's `uses` names something the recipe does not list. Usually a typo. |

There were two more, about stock (`not-stocked`, `unit-mismatch`). They went
with stock tracking in v2.

---

## 7. Changing a recipe that already exists

**Over the connector you can read but not change.** `get_recipe` shows you one;
there is no edit and no delete tool, deliberately. Talk the person through the
change and let them make it on the recipe page, or hand them the corrected
document to paste in.

Over HTTP:

```
GET  /api/recipes/{id}     → the document
PUT  /api/recipes/{id}     → replace its contents
DELETE /api/recipes/{id}   → remove it
```

**`GET` returns exactly what `PUT` accepts.** So "halve the chilli" is: fetch,
edit the one number, send it back. Don't rebuild the document from memory —
you'll drop the `note` fields and the `uses` links.

`PUT` replaces everything in the document. `rating` and `times_cooked` are the
household's history, not part of the document: they come back on `GET`, and
`PUT` ignores them. You cannot edit someone's rating of their own dinner.

`DELETE` takes the cooking history with it. Ask first. Always.

---

## 8. Practices

**Ask what they have, if it matters.** The app does not know what is in the
cupboard, and the shopping list is what is missing rather than what is there.
The cookbook tells you what this kitchen already likes to cook.

**One line per ingredient.** Not "salt, to taste" as a step and again as a
line. Pick one.

**Write steps a person can follow with one hand.** They are being read next to
a hot pan. Short sentences, one action each, no paragraph that hides a second
instruction at the end.

**Fill in `uses`.** It costs you one array and saves them scrolling mid-cook.

**Don't invent precision.** `"quantity": 1.5, "unit": "tsp"` is fine.
`"quantity": 1.4732` is noise.

**Set `source`.** If you composed it, say `"Claude"`. If it's adapted from
somewhere, name the somewhere. It shows on the recipe page and it's how they'll
remember where a dish came from a year later.

**Put honest advice in `notes`.** It's for what happened last time — "tofu
struggled to absorb the sauce" is exactly the kind of thing that belongs there.

**Never write the same recipe twice to check it worked.** Check `list_recipes`
first; duplicates are tedious to clean up by hand.

---

## 9. Worked flow

1. `get_pantry` (or `GET /api/pantry`).
2. Read the legal units, and the cookbook so you do not write a recipe they
   already have.
3. Compose. Name ingredients the way they would go on a shopping list.
4. `create_recipe` (or `POST /api/recipes`).
5. If it's rejected, fix the paths listed and send once more.
6. When it saves, tell the person the recipe's url, say it saved privately, and
   read them any warnings.
