// Seeds a starter pantry and the doenjang-jjigae reference recipe from the brief.
// Usage: node --env-file=.env.local scripts/seed.mjs
//
// Note: cucumber and sugar are deliberately absent from the pantry. The brief
// uses them as the "can't-match" case - those recipe lines must surface for
// manual handling rather than silently decrementing.

import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.LIBSQL_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const items = [
  // name, quantity, canonical unit, dimension, category, location
  ["Doenjang", 500, "g", "mass", "Condiments", "Fridge"],
  ["Firm tofu", 800, "g", "mass", "Chilled", "Fridge"],
  ["Onion", 6, "count", "count", "Veg", "Cupboard"],
  ["Red chilli", 8, "count", "count", "Veg", "Fridge"],
  ["Garlic clove", 20, "count", "count", "Veg", "Cupboard"],
  ["Spring onion", 5, "count", "count", "Veg", "Fridge"],
  ["Courgette", 2, "count", "count", "Veg", "Fridge"],
  ["Sesame oil", 250, "ml", "volume", "Oils", "Cupboard"],
  ["Soy sauce", 500, "ml", "volume", "Condiments", "Cupboard"],
  ["Mirin", 300, "ml", "volume", "Condiments", "Cupboard"],
  ["Rice vinegar", 250, "ml", "volume", "Condiments", "Cupboard"],
  ["Gochugaru", 200, "g", "mass", "Spices", "Spice rack"],
  ["Short grain rice", 2000, "g", "mass", "Dry goods", "Cupboard"],
  ["Dried anchovy", 150, "g", "mass", "Dry goods", "Cupboard"],
  ["Egg", 12, "count", "count", "Chilled", "Fridge"],
  ["Plain flour", 1500, "g", "mass", "Dry goods", "Cupboard"],
  ["Olive oil", 750, "ml", "volume", "Oils", "Counter"],
  ["Tinned tomatoes", 4, "count", "count", "Tins", "Cupboard"],
  ["Spaghetti", 1000, "g", "mass", "Dry goods", "Cupboard"],
  ["Parmesan", 200, "g", "mass", "Chilled", "Fridge"],
];

const recipes = [
  {
    name: "Doenjang-jjigae",
    base_servings: 5,
    rating: 4,
    times_cooked: 1,
    notes:
      "Tofu struggled to absorb the sauce - next time press it harder and add it later so it simmers in the broth rather than sitting on top.",
    ingredients: [
      ["Doenjang", 3, "tbsp"],
      ["Sesame oil", 2, "tbsp"],
      ["Soy sauce", 1, "tbsp"],
      ["Mirin", 2, "tsp"],
      ["Rice vinegar", 1, "tsp"],
      ["Firm tofu", 400, "g"],
      ["Onion", 1, "count"],
      ["Red chilli", 2, "count"],
      ["Garlic clove", 4, "count"],
      ["Courgette", 1, "count"],
      ["Cucumber", 1, "count"],
      ["Sugar", 1, "tsp"],
    ],
  },
  {
    name: "Spaghetti al pomodoro",
    base_servings: 2,
    rating: 5,
    times_cooked: 6,
    notes: "Finish the pasta in the sauce with a splash of pasta water.",
    ingredients: [
      ["Spaghetti", 200, "g"],
      ["Tinned tomatoes", 1, "count"],
      ["Garlic clove", 3, "count"],
      ["Olive oil", 3, "tbsp"],
      ["Parmesan", 40, "g"],
    ],
  },
  {
    name: "Kimchi fried rice",
    base_servings: 2,
    rating: null,
    times_cooked: 0,
    notes: null,
    ingredients: [
      ["Short grain rice", 300, "g"],
      ["Egg", 2, "count"],
      ["Sesame oil", 1, "tbsp"],
      ["Soy sauce", 2, "tsp"],
      ["Spring onion", 2, "count"],
    ],
  },
];

for (const [name, quantity, unit, dimension, category, location] of items) {
  await client.execute({
    sql: `INSERT INTO items (name, quantity, canonical_unit, dimension, category, location)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            quantity = excluded.quantity,
            location = excluded.location`,
    args: [name, quantity, unit, dimension, category, location],
  });
}

for (const recipe of recipes) {
  const existing = await client.execute({
    sql: "SELECT id FROM recipes WHERE name = ?",
    args: [recipe.name],
  });
  if (existing.rows.length > 0) {
    console.log(`skip (exists): ${recipe.name}`);
    continue;
  }

  const inserted = await client.execute({
    sql: `INSERT INTO recipes (name, base_servings, rating, times_cooked, notes)
          VALUES (?, ?, ?, ?, ?) RETURNING id`,
    args: [
      recipe.name,
      recipe.base_servings,
      recipe.rating,
      recipe.times_cooked,
      recipe.notes,
    ],
  });
  const recipeId = inserted.rows[0].id;

  for (const [itemName, quantity, unit] of recipe.ingredients) {
    await client.execute({
      sql: `INSERT INTO recipe_ingredients (recipe_id, item_name, quantity, unit)
            VALUES (?, ?, ?, ?)`,
      args: [recipeId, itemName, quantity, unit],
    });
  }
  console.log(`seeded: ${recipe.name}`);
}

const counts = await client.execute(
  "SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM recipes) AS recipes",
);
console.log("Counts:", counts.rows[0]);
