import { getDb } from "./db";
import { VISIBLE_TO_VIEWER, viewerArgs } from "./social";
import type {
  Item,
  Recipe,
  RecipeWithAuthor,
  RecipeIngredient,
  RecipeStep,
  RecipeStepWithIngredients,
  RecipeWithIngredients,
} from "./types";

/** No kitchen means no stock, which is a real state rather than an error. */
export async function getItems(kitchenId: number | null): Promise<Item[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: "SELECT * FROM items WHERE kitchen_id = ? ORDER BY category NULLS LAST, name",
    args: [kitchenId],
  });
  return result.rows as unknown as Item[];
}

/**
 * The columns every recipe listing wants: the row, who wrote it, and what
 * people made of it. Ratings are averaged across everyone rather than being one
 * shared number, which is what having more than one household requires.
 */
const RECIPE_WITH_AUTHOR = `
  SELECT r.*, u.handle AS author_handle, u.display_name AS author_name,
         (SELECT ROUND(AVG(rating), 1) FROM recipe_ratings WHERE recipe_id = r.id) AS avg_rating,
         (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) AS rating_count
  FROM recipes r
  LEFT JOIN users u ON u.id = r.author_id
`;

/**
 * Your own collection - what the cook-from-stock panel ranks.
 *
 * `term` searches within it, by name, blurb or ingredient. No visibility clause
 * here: these are yours, and you can always see your own.
 */
export async function getMyRecipes(
  authorId: number,
  term = "",
): Promise<RecipeWithAuthor[]> {
  const needle = `%${term.trim().toLowerCase()}%`;
  const filtered = term.trim().length > 0;

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE r.author_id = ?
          ${
            filtered
              ? `AND (
                  LOWER(r.name) LIKE ?
                  OR LOWER(COALESCE(r.description, '')) LIKE ?
                  OR EXISTS (
                    SELECT 1 FROM recipe_ingredients ri
                    WHERE ri.recipe_id = r.id AND LOWER(ri.item_name) LIKE ?
                  )
                )`
              : ""
          }
          ORDER BY r.times_cooked DESC, r.name`,
    args: filtered ? [authorId, needle, needle, needle] : [authorId],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

/**
 * Everything a person is allowed to see, newest first - the discover page.
 *
 * The visibility rule is in the WHERE clause rather than filtered afterwards,
 * so there is no version of this query that forgets it.
 */
export async function browseRecipes(
  viewerId: number,
  options: { authorId?: number; limit?: number } = {},
): Promise<RecipeWithAuthor[]> {
  const byAuthor = options.authorId ? "AND r.author_id = ?" : "";

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER} ${byAuthor}
          ORDER BY r.id DESC
          LIMIT ?`,
    args: [
      ...viewerArgs(viewerId),
      ...(options.authorId ? [options.authorId] : []),
      options.limit ?? 60,
    ],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

/**
 * Just who wrote a recipe, with no visibility check.
 *
 * Attribution is a credit, not access. "Adapted from @someone" has to keep
 * working after they make the original private, or taking your copy private
 * would quietly erase the person you got it from.
 */
export async function getRecipeAuthorHandle(
  recipeId: number,
): Promise<{ id: number; handle: string } | null> {
  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle FROM recipes r
          JOIN users u ON u.id = r.author_id
          WHERE r.id = ?`,
    args: [recipeId],
  });
  return (result.rows[0] as unknown as { id: number; handle: string }) ?? null;
}

/** Kept for the API, which lists what the calling account wrote. */
export async function getRecipes(authorId: number): Promise<Recipe[]> {
  return getMyRecipes(authorId);
}

export async function getRecipe(
  id: number,
  viewerId: number,
): Promise<RecipeWithIngredients | null> {
  // Four reads rather than one join: the join would multiply every ingredient
  // by every step that mentions it, and stitching the rows back apart in JS is
  // more code than fetching them separately.
  const [recipeResult, ingredientResult, stepResult, linkResult] = await Promise.all([
    getDb().execute({
      sql: `SELECT r.* FROM recipes r WHERE r.id = ? AND ${VISIBLE_TO_VIEWER}`,
      args: [id, ...viewerArgs(viewerId)],
    }),
    getDb().execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
      args: [id],
    }),
    getDb().execute({
      sql: "SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
      args: [id],
    }),
    getDb().execute({
      sql: `SELECT si.step_id, si.ingredient_id
            FROM recipe_step_ingredients si
            JOIN recipe_steps s ON s.id = si.step_id
            WHERE s.recipe_id = ?`,
      args: [id],
    }),
  ]);

  const recipe = recipeResult.rows[0] as unknown as Recipe | undefined;
  if (!recipe) return null;

  const ingredients = ingredientResult.rows as unknown as RecipeIngredient[];
  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const usesByStep = new Map<number, RecipeIngredient[]>();
  for (const row of linkResult.rows as unknown as {
    step_id: number;
    ingredient_id: number;
  }[]) {
    const ingredient = byId.get(row.ingredient_id);
    if (!ingredient) continue;

    const bucket = usesByStep.get(row.step_id);
    if (bucket) bucket.push(ingredient);
    else usesByStep.set(row.step_id, [ingredient]);
  }

  const steps: RecipeStepWithIngredients[] = (
    stepResult.rows as unknown as RecipeStep[]
  ).map((step) => ({
    ...step,
    uses: (usesByStep.get(step.id) ?? []).sort((a, b) => a.position - b.position),
  }));

  return { ...recipe, ingredients, steps };
}

/** Item names currently in stock, lowercased, for recipe match indicators. */
export async function getStockedItemNames(
  kitchenId: number | null,
): Promise<Set<string>> {
  if (kitchenId === null) return new Set();

  const result = await getDb().execute({
    sql: "SELECT name FROM items WHERE kitchen_id = ? AND quantity > 0",
    args: [kitchenId],
  });
  return new Set(
    (result.rows as unknown as { name: string }[]).map((r) => r.name.toLowerCase()),
  );
}

export interface RecipeWithMatch extends RecipeWithAuthor {
  /** Ingredient lines whose item is currently in stock. */
  have: number;
  total: number;
}

/**
 * Recipes ranked for the "cook with what you have" panel, each with a count of
 * how many of its lines are stocked *in this kitchen*. One query for all
 * ingredient lines rather than one per recipe.
 */
export async function getRecipesWithMatches(
  kitchenId: number | null,
  authorId: number,
  term = "",
): Promise<RecipeWithMatch[]> {
  const [recipes, stocked, ingredientRows] = await Promise.all([
    getMyRecipes(authorId, term),
    getStockedItemNames(kitchenId),
    getDb().execute("SELECT recipe_id, item_name FROM recipe_ingredients"),
  ]);

  const byRecipe = new Map<number, string[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(row.item_name);
    else byRecipe.set(row.recipe_id, [row.item_name]);
  }

  return recipes.map((recipe) => {
    const names = byRecipe.get(recipe.id) ?? [];
    return {
      ...recipe,
      have: names.filter((name) => stocked.has(name.toLowerCase())).length,
      total: names.length,
    };
  });
}

/**
 * Recipes from people you follow, newest first.
 *
 * A one-way follow is enough to see somebody in your feed - following is how
 * you said you wanted to. Mutual is only needed to unlock friends-only
 * recipes, and the visibility clause already handles that.
 */
export async function getFeed(
  viewerId: number,
  limit = 40,
): Promise<RecipeWithAuthor[]> {
  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER}
            AND r.author_id <> ?
            AND EXISTS (
              SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = r.author_id
            )
          ORDER BY r.id DESC
          LIMIT ?`,
    args: [...viewerArgs(viewerId), viewerId, viewerId, limit],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

/**
 * Searches recipes you're allowed to see, by name, blurb or ingredient.
 *
 * LIKE rather than full-text: a pantry holds hundreds of recipes, not millions,
 * and an FTS table is a second thing to keep in step with the first for a
 * gain nobody would notice.
 */
export async function searchRecipes(
  viewerId: number,
  term: string,
  limit = 40,
): Promise<RecipeWithAuthor[]> {
  const needle = `%${term.trim().toLowerCase()}%`;
  if (needle.length <= 2) return [];

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER}
            AND (
              LOWER(r.name) LIKE ?
              OR LOWER(COALESCE(r.description, '')) LIKE ?
              OR EXISTS (
                SELECT 1 FROM recipe_ingredients ri
                WHERE ri.recipe_id = r.id AND LOWER(ri.item_name) LIKE ?
              )
            )
          ORDER BY (LOWER(r.name) LIKE ?) DESC, r.id DESC
          LIMIT ?`,
    args: [...viewerArgs(viewerId), needle, needle, needle, needle, limit],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

export interface RecipeSocial {
  likes: number;
  youLiked: boolean;
}

export async function getRecipeSocial(
  recipeId: number,
  viewerId: number,
): Promise<RecipeSocial> {
  const result = await getDb().execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = ?) AS likes,
            EXISTS (SELECT 1 FROM recipe_likes WHERE recipe_id = ? AND user_id = ?) AS you_liked`,
    args: [recipeId, recipeId, viewerId],
  });

  const row = result.rows[0] as unknown as { likes: number; you_liked: number };
  return { likes: row.likes, youLiked: row.you_liked === 1 };
}

export interface Comment {
  id: number;
  body: string;
  created_at: string | null;
  user_id: number;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

/** Comments from people you haven't blocked, and who haven't blocked you. */
export async function getComments(
  recipeId: number,
  viewerId: number,
): Promise<Comment[]> {
  const result = await getDb().execute({
    sql: `SELECT c.id, c.body, c.created_at, c.user_id, u.handle, u.display_name, u.avatar_url
          FROM recipe_comments c
          JOIN users u ON u.id = c.user_id
          WHERE c.recipe_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = c.user_id AND b.blocked_id = ?)
                 OR (b.blocker_id = ? AND b.blocked_id = c.user_id)
            )
          ORDER BY c.created_at, c.id`,
    args: [recipeId, viewerId, viewerId],
  });
  return result.rows as unknown as Comment[];
}

export async function searchPeople(viewerId: number, term: string) {
  const needle = `%${term.trim().toLowerCase()}%`;
  if (needle.length <= 2) return [];

  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle, u.display_name
          FROM users u
          WHERE u.id <> ?
            AND (LOWER(u.handle) LIKE ? OR LOWER(u.display_name) LIKE ?)
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = u.id AND b.blocked_id = ?)
                 OR (b.blocker_id = ? AND b.blocked_id = u.id)
            )
          ORDER BY u.handle
          LIMIT 10`,
    args: [viewerId, needle, needle, viewerId, viewerId],
  });
  return result.rows as unknown as {
    id: number;
    handle: string;
    display_name: string;
  }[];
}

export interface ExpiringItem extends Item {
  /** The earlier of the packet date and the opened-plus-shelf-life date. */
  use_by: string;
  days_left: number;
  /** True when the deadline comes from having opened it, not the packet. */
  because_opened: number;
}

/**
 * The deadline that actually applies to a jar.
 *
 * A sealed thing is good until the date on it. An open thing is good for
 * however long it keeps once open, counted from when it was opened - and if
 * both apply, whichever comes first wins. Written once here because three
 * places need to agree about it.
 */
const USE_BY = `
  MIN(
    COALESCE(expiry_date, '9999-12-31'),
    COALESCE(
      CASE WHEN opened_at IS NOT NULL AND shelf_life_days IS NOT NULL
        THEN date(opened_at, '+' || shelf_life_days || ' days')
      END,
      '9999-12-31'
    )
  )
`;

/**
 * What's about to go off, soonest first.
 *
 * Anything already past is included with a negative count, because "this went
 * off on Tuesday" is more useful than silence.
 */
export async function getExpiring(
  kitchenId: number | null,
  withinDays = 7,
): Promise<ExpiringItem[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT *, ${USE_BY} AS use_by,
                 CAST(julianday(${USE_BY}) - julianday('now') AS INTEGER) AS days_left,
                 (opened_at IS NOT NULL
                   AND shelf_life_days IS NOT NULL
                   AND date(opened_at, '+' || shelf_life_days || ' days') <=
                       COALESCE(expiry_date, '9999-12-31')) AS because_opened
          FROM items
          WHERE kitchen_id = ?
            AND quantity > 0
            AND ${USE_BY} < '9999-12-31'
            AND julianday(${USE_BY}) - julianday('now') <= ?
          ORDER BY use_by`,
    args: [kitchenId, withinDays],
  });
  return result.rows as unknown as ExpiringItem[];
}

export async function getItem(
  kitchenId: number,
  itemId: number,
): Promise<Item | null> {
  const result = await getDb().execute({
    sql: "SELECT * FROM items WHERE id = ? AND kitchen_id = ?",
    args: [itemId, kitchenId],
  });
  return (result.rows[0] as unknown as Item) ?? null;
}
