# Writing recipes into the pantry

This is for a Claude session — desktop, mobile, or another Claude Code — that
has been asked to read someone's kitchen stock and put a recipe into it.

You do not need this repository. Everything here is reachable over HTTP with a
token.

---

## 1. Getting in

Every request needs a bearer token:

```
Authorization: Bearer <PANTRY_API_TOKEN>
```

Ask the pantry's owner for the token. It is not in this file and should never
be pasted into a chat you don't control. A wrong or missing token gets a plain
`401` with no detail — that is the gate doing its job, not a bug to work around.

The base URL is wherever the pantry is deployed. Everything below is relative
to it.

> **If you are ever unsure whether you are allowed to write**, ask the person
> first. Reads are safe and repeatable. `POST`, `PUT` and `DELETE` change a real
> kitchen that someone is going to cook from tonight.

---

## 2. Read the kitchen first

```
GET /api/pantry
```

This is the only call you need before writing anything. It returns:

| Key | What it holds |
|---|---|
| `pantry.items` | Everything in stock: name, quantity, unit, dimension, category, location, expiry |
| `recipes` | What already exists, with a `url` for each |
| `vocabulary.units` | **The only units you may use**, grouped by dimension |
| `vocabulary.locations` | Where things live in this kitchen |
| `writing_recipes.schema` | The full JSON Schema for the document you send back |

The endpoint is self-describing on purpose. If this file and
`writing_recipes.schema` ever disagree, **the endpoint is right** — it ships
with the running code, and this file is a copy.

Read it before composing. Suggesting a recipe around 400g of tofu when there
are 80g left is the single most common way to be unhelpful here.

---

## 3. The recipe document

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

`item_name` is matched against the pantry's item names, case-insensitively.

- **An exact match links the line to stock**, so cooking the recipe decrements
  it. Copy names from `pantry.items` verbatim when you mean the same thing.
- **A name the pantry doesn't have is accepted**, with a warning. The line
  shows as "not in pantry" and cooking flags it for manual handling. This is
  correct behaviour for anything the person hasn't bought yet — don't contort
  a recipe to avoid it.

If a step's `uses` names an ingredient that isn't in the recipe, that reference
is dropped with a warning rather than failing the request.

> **Duplicate names are a real limitation.** `uses` binds by name, so if a
> recipe lists "Doenjang" twice, a step saying `uses: ["Doenjang"]` attaches to
> the first. Prefer one line per ingredient and put the split in the `note`.

---

## 5. Units and dimensions

Three dimensions — mass, volume, count — and **conversion only ever happens
within one**. Grams never become millilitres, because there is no density data
in this system and inventing some would corrupt the stock counts.

Each pantry item is stored in one canonical unit: grams, millilitres, or a bare
count. So:

- Asking for `tbsp` of something the pantry keeps in **grams** is accepted, but
  **it cannot be decremented when cooked**, and you'll get a warning saying so.
- Asking for `g` of something kept as a **count** has the same problem.

Check `dimension` on the pantry item before choosing a unit. If doenjang is
stored in grams, write `60 g`, not `3 tbsp` — even though the recipe book says
tablespoons. Convert it yourself; you know roughly what a tablespoon of paste
weighs and the system deliberately doesn't guess.

---

## 6. What comes back

**`201 Created`**

```json
{ "id": 7, "url": "/recipes/7", "warnings": [] }
```

**`422 Unprocessable`** — the document is not a recipe. Nothing was written.

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

**Warnings on a `201` mean it saved and something wants a human eye.** Report
them to the person; don't silently swallow them, and don't try to "fix" them by
renaming their ingredients to whatever happens to be in the cupboard.

The two you'll see most:

| Warning | What it means |
|---|---|
| `"X" isn't in the pantry` | Fine. They'll buy it. |
| `"X" is measured in g, so tbsp can't be taken out of stock` | Your unit choice can't decrement. See §5. |

---

## 7. Changing a recipe that already exists

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

**Read stock before you suggest.** The whole point of this endpoint is that you
can see what's actually in the kitchen. A recipe built around things they have
is worth more than a better recipe built around things they don't.

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

**Never post the same recipe twice to check it worked.** Read `recipes` from
`/api/pantry` first; duplicates are tedious to clean up by hand.

---

## 9. Worked flow

1. `GET /api/pantry`.
2. Read `vocabulary.units` and `pantry.items`. Note which items are stored in
   which dimension.
3. Compose. Copy item names verbatim where you mean the pantry's item. Convert
   your units to that item's dimension.
4. `POST /api/recipes`.
5. On `422`, fix the paths listed and resend once.
6. On `201`, tell the person the recipe's `url` and read them any warnings.
