import { getDb, plainRows } from "./db";
import { indexStock } from "./pantry-match";
import { countStockedLines, getLinks, resolveWithLinks } from "./cookbook";
import { inStock } from "./containers";
import { totalMinutes } from "./recipe-tags";
import type { RecipeFacts } from "./tonight";
import type { ItemProfile } from "./suggest";
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
  // Plain objects: these reach client components, and a libSQL Row does not
  // survive that boundary quietly. See plainRows in lib/db.ts.
  return plainRows<Item>(result);
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
 * Recipes you have saved off somebody else, newest save first.
 *
 * Saving and adopting are different acts and have always been stored
 * separately - a like is "I want to find this again", adopting is "this is a
 * thing my kitchen cooks" - but nothing has ever shown the first one back to
 * you, so the star was a write-only button. Your own recipes are left out:
 * they are in the tab called Wrote, and a recipe cannot be saved from
 * yourself.
 *
 * The visibility clause still applies. Somebody can make a recipe private
 * after you saved it, and a save is not a way around that.
 */
export async function getSavedRecipes(
  viewerId: number,
  term = "",
): Promise<RecipeWithAuthor[]> {
  const needle = `%${term.trim().toLowerCase()}%`;
  const filtered = term.trim().length > 0;

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          JOIN recipe_likes rl ON rl.recipe_id = r.id AND rl.user_id = ?
          WHERE r.author_id <> ?
            AND ${VISIBLE_TO_VIEWER}
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
          ORDER BY rl.created_at DESC, r.name`,
    args: filtered
      ? [viewerId, viewerId, ...viewerArgs(viewerId), needle, needle, needle]
      : [viewerId, viewerId, ...viewerArgs(viewerId)],
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

export interface RecipeWithMatch extends RecipeWithAuthor {
  /** Ingredient lines whose item is currently in stock. */
  have: number;
  total: number;
  /** Whether this kitchen has adopted it, and can therefore cook it. */
  in_cookbook: boolean;
}

/**
 * Recipes in this kitchen's cookbook, newest adoption first.
 *
 * The visibility clause still applies: somebody can make a recipe private
 * after you adopted it, and the cookbook is not a way around that. The row
 * stays, so it comes back if they change their mind.
 */
export async function getCookbookRecipes(
  kitchenId: number | null,
  viewerId: number,
): Promise<RecipeWithAuthor[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          JOIN cookbook cb ON cb.recipe_id = r.id AND cb.kitchen_id = ?
          WHERE ${VISIBLE_TO_VIEWER}
          ORDER BY r.times_cooked DESC, r.name`,
    args: [kitchenId, ...viewerArgs(viewerId)],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

/**
 * Everything a readiness count needs, fetched once.
 *
 * Ingredient lines, the agreed links, and the stock they point at. Pulled out
 * because four callers want exactly this and each round trip is a hop to
 * Nuremberg.
 */
async function readinessContext(kitchenId: number | null) {
  const [items, links, ingredientRows] = await Promise.all([
    getItems(kitchenId),
    getLinks(kitchenId),
    getDb().execute(
      "SELECT id, recipe_id, item_name, unit FROM recipe_ingredients ORDER BY position, id",
    ),
  ]);

  const byRecipe = new Map<number, RecipeIngredient[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(row);
    else byRecipe.set(row.recipe_id, [row]);
  }

  return {
    stock: indexStock(items),
    byId: new Map(items.map((item) => [item.id, item])),
    links,
    byRecipe,
  };
}

/**
 * Recipes ranked for the "cook with what you have" panel, each with a count of
 * how many of its lines are stocked *in this kitchen*.
 *
 * Reads the cookbook rather than everything you have ever written. A recipe
 * you typed up once and never made is not a suggestion, and ranking it
 * alongside the things you actually cook is how a suggestion panel stops being
 * worth looking at. It also means the counts come from links a person agreed
 * to, rather than from a guess recomputed on every page load.
 */
export async function getRecipesWithMatches(
  kitchenId: number | null,
  viewerId: number,
  term = "",
): Promise<RecipeWithMatch[]> {
  const [recipes, context] = await Promise.all([
    getCookbookRecipes(kitchenId, viewerId),
    readinessContext(kitchenId),
  ]);

  const needle = term.trim().toLowerCase();
  const matching = needle
    ? recipes.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(needle) ||
          (recipe.description ?? "").toLowerCase().includes(needle) ||
          (context.byRecipe.get(recipe.id) ?? []).some((line) =>
            line.item_name.toLowerCase().includes(needle),
          ),
      )
    : recipes;

  return matching.map((recipe) => ({
    ...recipe,
    in_cookbook: true,
    ...countStockedLines(
      context.byRecipe.get(recipe.id) ?? [],
      context.links,
      context.stock,
      context.byId,
    ),
  }));
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
  // Plain objects: these reach a client component, and a libSQL Row does not
  // survive that boundary quietly. See plainRows in lib/db.ts.
  return plainRows<Comment>(result);
}

export async function searchPeople(viewerId: number, term: string) {
  const needle = `%${term.trim().toLowerCase()}%`;
  if (needle.length <= 2) return [];

  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle, u.display_name, u.avatar_url
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
    avatar_url: string | null;
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
            -- An unopened pack goes off too, and quantity only counts the open
            -- one, so three sealed tins would otherwise read as nothing there.
            AND (quantity > 0 OR sealed_count > 0)
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

export interface Rescue {
  item: ExpiringItem;
  /** Recipes that use it, the most makeable first. */
  recipes: RecipeWithMatch[];
}

/**
 * What to cook before it goes off.
 *
 * The stock page has always listed what is expiring, which tells you there is a
 * problem without helping with it. This answers the next question: given that
 * the coriander dies on Thursday, what can actually be made with it tonight.
 *
 * Ranked by how much of the rest of the recipe is already here, because a
 * recipe needing five other things you do not have is not a rescue, it is a
 * shopping trip. Ties go to whatever has been cooked most, on the grounds that
 * a recipe you return to is a recipe that works.
 *
 * The deadline is whichever comes first of the date on the packet and
 * `opened_at + shelf_life_days`, which getExpiring already works out - so this
 * is a ranking problem rather than a second definition of "going off", and
 * there is no way for the two to disagree.
 */
export async function getRescues(
  kitchenId: number | null,
  authorId: number,
  withinDays = 7,
): Promise<Rescue[]> {
  if (kitchenId === null) return [];

  const [expiring, recipes, context] = await Promise.all([
    getExpiring(kitchenId, withinDays),
    getCookbookRecipes(kitchenId, authorId),
    readinessContext(kitchenId),
  ]);
  if (expiring.length === 0) return [];

  const scored = recipes.map((recipe) => {
    const lines = context.byRecipe.get(recipe.id) ?? [];
    /**
     * Which stock rows this recipe actually calls for.
     *
     * Ids rather than lowercased names, because "does this recipe use the
     * coriander that dies on Thursday" was previously asked as a string
     * equality - so a recipe saying "fresh coriander" rescued nothing, which
     * is the failure this whole panel exists to prevent.
     */
    const uses = new Set<number>();
    for (const line of lines) {
      const { item } = resolveWithLinks(line, context.links, context.stock, context.byId);
      if (item) uses.add(item.id);
    }
    return {
      recipe,
      uses,
      ...countStockedLines(lines, context.links, context.stock, context.byId),
    };
  });

  return expiring
    .map((item) => {
      const uses = scored
        .filter((entry) => entry.uses.has(item.id))
        .sort((a, b) => {
          // Proportion rather than count: a recipe with three of four is a
          // better bet than one with four of twelve.
          const readiness = b.have / Math.max(1, b.total) - a.have / Math.max(1, a.total);
          return readiness !== 0 ? readiness : b.recipe.times_cooked - a.recipe.times_cooked;
        })
        .slice(0, 2)
        .map((entry) => ({
          ...entry.recipe,
          have: entry.have,
          total: entry.total,
          in_cookbook: true,
        }));

      return { item, recipes: uses };
    })
    // Items nothing can be made from still belong on the list - they are the
    // ones about to be thrown away - so they are kept, not filtered out.
    .sort((a, b) => a.item.days_left - b.item.days_left);
}

export interface CookedEntry {
  id: number;
  recipe_id: number;
  recipe_name: string;
  servings: number;
  cooked_at: string;
  cooked_by_handle: string | null;
  cooked_by_name: string | null;
  /** Lines the cook said they did not use. Empty for an ordinary cook. */
  skipped: string[];
}

/**
 * What this kitchen has cooked, most recent first.
 *
 * Names and days, which is what was asked for - no heatmap. The data behind it
 * is richer than that, and stored rather than summarised, so a fuller view
 * later needs a query and not a migration.
 *
 * Undone cooks are excluded rather than struck through: undoing one means it
 * did not happen, and a log that shows things that did not happen is not a log.
 */
export async function getCookedLog(
  kitchenId: number | null,
  limit = 60,
  /** Just this recipe, for the history on its own page. */
  recipeId?: number,
): Promise<CookedEntry[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT c.id, c.recipe_id, r.name AS recipe_name, c.servings, c.cooked_at,
                 u.handle AS cooked_by_handle, u.display_name AS cooked_by_name,
                 c.skipped
          FROM cook_events c
          JOIN recipes r ON r.id = c.recipe_id
          LEFT JOIN users u ON u.id = c.cooked_by
          WHERE c.kitchen_id = ? AND c.undone_at IS NULL
            AND (? IS NULL OR c.recipe_id = ?)
          ORDER BY c.cooked_at DESC, c.id DESC
          LIMIT ?`,
    args: [kitchenId, recipeId ?? null, recipeId ?? null, limit],
  });
  return (result.rows as unknown as (Omit<CookedEntry, "skipped"> & { skipped: string | null })[]).map(
    (row) => ({
      ...row,
      // Parsed here rather than at every reader. A row written before the
      // column existed, and one where nothing was skipped, both read as [].
      skipped: row.skipped ? (JSON.parse(row.skipped) as string[]) : [],
    }),
  );
}

export interface Neglected {
  id: number;
  name: string;
  /** Days since anything touched it. */
  idle_days: number;
  recipes: RecipeWithMatch[];
}

/**
 * Things sitting untouched, and what they are good for.
 *
 * The opposite question to the restock one: not "what have I run out of" but
 * "what did I buy and then never use". `updated_at` moves on every adjustment,
 * cook and edit, so it is a fair proxy for when the jar was last thought about.
 *
 * Only things actually in stock, and only past a month, because a fortnight of
 * quiet is not neglect - it is a cupboard working normally.
 */
export async function getNeglected(
  kitchenId: number | null,
  authorId: number,
  idleDays = 30,
): Promise<Neglected[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT id, name,
                 CAST(julianday('now') - julianday(updated_at) AS INTEGER) AS idle_days
          FROM items
          WHERE kitchen_id = ?
            AND (quantity > 0 OR sealed_count > 0)
            AND updated_at IS NOT NULL
            AND julianday('now') - julianday(updated_at) >= ?
          ORDER BY idle_days DESC
          LIMIT 8`,
    args: [kitchenId, idleDays],
  });

  const idle = result.rows as unknown as Omit<Neglected, "recipes">[];
  if (idle.length === 0) return [];

  const [recipes, context] = await Promise.all([
    getCookbookRecipes(kitchenId, authorId),
    readinessContext(kitchenId),
  ]);

  // Scored once, not once per neglected item: resolving is the expensive part
  // and the answer does not depend on which jar is being asked about.
  const scored = recipes.map((recipe) => {
    const lines = context.byRecipe.get(recipe.id) ?? [];
    const uses = new Set<number>();
    for (const line of lines) {
      const { item } = resolveWithLinks(line, context.links, context.stock, context.byId);
      if (item) uses.add(item.id);
    }
    return {
      recipe,
      uses,
      ...countStockedLines(lines, context.links, context.stock, context.byId),
    };
  });

  return idle.map((item) => {
    const uses = scored
      .filter((entry) => entry.uses.has(item.id))
      .sort((a, b) => b.have / Math.max(1, b.total) - a.have / Math.max(1, a.total))
      .slice(0, 2)
      .map((entry) => ({
        ...entry.recipe,
        have: entry.have,
        total: entry.total,
        in_cookbook: true,
      }));

    return { ...item, recipes: uses };
  });
}

/**
 * Everything the Tonight ranker needs, in one pass over the cookbook.
 *
 * Deliberately assembles facts rather than ranking anything: the scoring lives
 * in lib/tonight.ts and stays pure, so check:tonight can argue with a weight
 * without a database.
 */
export async function getTonightFacts(
  kitchenId: number | null,
  viewerId: number,
): Promise<RecipeFacts[]> {
  if (kitchenId === null) return [];

  const [recipes, context, expiring, lastCooked] = await Promise.all([
    getCookbookRecipes(kitchenId, viewerId),
    readinessContext(kitchenId),
    getExpiring(kitchenId),
    /**
     * When each recipe was last actually cooked here.
     *
     * Undone cooks do not count. Pressing undo is saying it did not happen,
     * and a mistake corrected thirty seconds later must not suppress the
     * recipe for a fortnight.
     */
    getDb().execute({
      sql: `SELECT recipe_id,
                   CAST(julianday('now') - julianday(MAX(cooked_at)) AS INTEGER) AS days_since
            FROM cook_events
            WHERE kitchen_id = ? AND undone_at IS NULL
            GROUP BY recipe_id`,
      args: [kitchenId],
    }),
  ]);

  const daysLeftByItem = new Map(expiring.map((item) => [item.id, item.days_left]));
  const expiringNames = new Map(expiring.map((item) => [item.id, item.name]));
  const sinceByRecipe = new Map(
    (lastCooked.rows as unknown as { recipe_id: number; days_since: number }[]).map(
      (row) => [row.recipe_id, row.days_since],
    ),
  );

  return recipes.map((recipe) => {
    const lines = context.byRecipe.get(recipe.id) ?? [];
    const rescues: { name: string; daysLeft: number }[] = [];
    const missing: string[] = [];
    let have = 0;

    for (const line of lines) {
      const { item } = resolveWithLinks(line, context.links, context.stock, context.byId);
      if (item && inStock(item)) {
        have += 1;
        const daysLeft = daysLeftByItem.get(item.id);
        if (daysLeft !== undefined) {
          rescues.push({ name: expiringNames.get(item.id) ?? item.name, daysLeft });
        }
      } else {
        // What the recipe calls it, not what the pantry calls it. The shopping
        // list reads better in the recipe's own words.
        missing.push(line.item_name);
      }
    }

    return {
      id: recipe.id,
      name: recipe.name,
      have,
      total: lines.length,
      rescues,
      missing,
      minutes: totalMinutes(recipe),
      rating: recipe.avg_rating,
      timesCooked: recipe.times_cooked,
      daysSinceCooked: sinceByRecipe.get(recipe.id) ?? null,
    };
  });
}

/**
 * This kitchen's stock, trimmed to the fields an add form can copy.
 *
 * Narrower than getItems on purpose: it is handed to the browser so a new
 * item can inherit the unit, shelf and tags of the nearest thing you already
 * own, and a kitchen's full rows carry nutrition figures, expiry dates and
 * quantities that have no business being suggestions.
 */
export async function getItemProfiles(
  kitchenId: number | null,
): Promise<ItemProfile[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    // One query with the tags and shops folded in as grouped strings, rather
    // than three queries plus stitching. The names cannot contain the
    // separator: both are cleaned to collapsed whitespace on the way in.
    sql: `SELECT i.id, i.name, i.canonical_unit, i.dimension, i.location,
                 i.pack_size, i.pack_unit, i.shelf_life_days,
                 (SELECT GROUP_CONCAT(t.name, '\u001f')
                    FROM item_tags it JOIN tags t ON t.id = it.tag_id
                   WHERE it.item_id = i.id) AS tag_names,
                 (SELECT GROUP_CONCAT(s.name, '\u001f')
                    FROM item_shops ish JOIN shops s ON s.id = ish.shop_id
                   WHERE ish.item_id = i.id) AS shop_names
          FROM items i
          WHERE i.kitchen_id = ?
          ORDER BY i.name`,
    args: [kitchenId],
  });

  const split = (value: string | null) =>
    value ? value.split("\u001f").filter(Boolean) : [];

  return (
    result.rows as unknown as (Omit<ItemProfile, "tags" | "shops"> & {
      tag_names: string | null;
      shop_names: string | null;
    })[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    canonical_unit: row.canonical_unit,
    dimension: row.dimension,
    location: row.location,
    pack_size: row.pack_size,
    pack_unit: row.pack_unit,
    shelf_life_days: row.shelf_life_days,
    tags: split(row.tag_names),
    shops: split(row.shop_names),
  }));
}
