"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireKitchenRole, requireUser } from "@/lib/session";
import { getRecipe } from "@/lib/queries";
import { rate } from "@/lib/recipe-store";
import { resolveWithLinks } from "@/lib/cookbook";
import { indexStock } from "@/lib/pantry-match";
import { resolveAmount, scaleQuantity } from "@/lib/units";
import type {
  CookChange,
  CookEvent,
  Dimension,
  Item,
  Recipe,
  RecipeIngredient,
} from "@/lib/types";

export interface CookLineResult {
  item_name: string;
  /** Amount taken out of stock, in the item's canonical unit. */
  decremented?: number;
  unit?: string;
  remaining?: number;
  /** Set when the line couldn't be applied cleanly. */
  issue?: "not-in-pantry" | "dimension-mismatch" | "unknown-unit" | "short";
  detail?: string;
}

export interface OpenedPack {
  item_id: number;
  item_name: string;
}

export interface CookResult {
  /**
   * Items where cooking finished the open container and broke into a sealed
   * one. Their old expiry date has been cleared - it belonged to a packet that
   * no longer exists - so these are the ones worth asking about.
   */
  opened: OpenedPack[];
  ok: boolean;
  error?: string;
  applied: CookLineResult[];
  flagged: CookLineResult[];
  /** Row in cook_events, and the handle undo needs. Absent if nothing moved. */
  eventId?: number;
}

/**
 * Marks a recipe cooked at the chosen serving count and decrements stock.
 *
 * The whole read-scale-write runs inside one transaction: a stock edit from
 * Claude Code (the other writer on this database) must not interleave and
 * double-apply or lose a decrement. Quantities are recomputed from the
 * database rather than trusted from the client.
 *
 * Lines that can't be matched - ingredient absent, or a unit in a different
 * dimension than the item's canonical unit - are flagged for manual handling
 * rather than silently skipped. Stored recipe quantities always stay at base
 * servings; the scaling applies to the decrement only.
 */
export async function cookRecipe(
  recipeId: number,
  servings: number,
  /**
   * Stand-ins chosen for this cook only, as ingredient line id to stock id.
   *
   * Not written to the recipe: using oat milk tonight because that is what is
   * in does not mean the recipe was always an oat milk recipe. The swap lives
   * in this one cook, and the log records what actually left the shelf.
   */
  substitutions: Record<number, number> = {},
): Promise<CookResult> {
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return { ok: false, error: "Invalid recipe", opened: [], applied: [], flagged: [] };
  }
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) {
    return { ok: false, error: "Invalid serving count", opened: [], applied: [], flagged: [] };
  }

  // Cooking spends stock, so it needs a kitchen you're allowed to change.
  const access = await requireKitchenRole("editor");
  if (!access.ok) {
    return { ok: false, error: access.error, opened: [], applied: [], flagged: [] };
  }

  const tx = await getDb().transaction("write");

  try {
    const recipeResult = await tx.execute({
      sql: "SELECT * FROM recipes WHERE id = ?",
      args: [recipeId],
    });
    const recipe = recipeResult.rows[0] as unknown as Recipe | undefined;
    if (!recipe) {
      await tx.rollback();
      return { ok: false, error: "Recipe not found", opened: [], applied: [], flagged: [] };
    }

    const ingredientResult = await tx.execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY id",
      args: [recipeId],
    });
    const lines = ingredientResult.rows as unknown as RecipeIngredient[];

    const itemResult = await tx.execute({
      sql: "SELECT * FROM items WHERE kitchen_id = ?",
      args: [access.kitchen.id],
    });
    const stock = itemResult.rows as unknown as Item[];
    const stockById = new Map(stock.map((item) => [item.id, item]));

    /**
     * What each line means on these shelves, decided when the recipe was added
     * to the cookbook rather than re-guessed here.
     *
     * This used to be a lowercased name lookup, which is why a recipe calling
     * for "firm tofu" against a row called "Tofu" flagged as an ingredient the
     * kitchen has never held - and why the same recipe could behave
     * differently in two kitchens for no reason anybody could see. The link is
     * a person's answer; a line nobody was asked about falls through to the
     * resolver, which happens when a recipe gains an ingredient after it was
     * adopted.
     */
    const linkResult = await tx.execute({
      sql: `SELECT cl.ingredient_id, cl.item_id
            FROM cookbook_links cl
            JOIN recipe_ingredients ri ON ri.id = cl.ingredient_id
            WHERE cl.kitchen_id = ? AND ri.recipe_id = ?`,
      args: [access.kitchen.id, recipeId],
    });
    const links = new Map<number, number | null>(
      (linkResult.rows as unknown as { ingredient_id: number; item_id: number | null }[]).map(
        (row) => [row.ingredient_id, row.item_id],
      ),
    );
    const stockIndex = indexStock(stock);

    const applied: CookLineResult[] = [];
    const flagged: CookLineResult[] = [];
    const changes: CookChange[] = [];
    const opened: OpenedPack[] = [];

    for (const line of lines) {
      /**
       * The substitute if one was picked, otherwise whatever the line names.
       *
       * Looked up by id among this kitchen's stock, so a number from somewhere
       * else resolves to nothing and the line is simply flagged - the same as
       * asking for something the pantry has never held.
       */
      const swapId = substitutions[line.id];
      const item = swapId
        ? stockById.get(swapId)
        : (resolveWithLinks(line, links, stockIndex, stockById).item ?? undefined);
      if (!item) {
        flagged.push({ item_name: line.item_name, issue: "not-in-pantry" });
        continue;
      }

      const scaled = scaleQuantity(
        line.quantity,
        recipe.base_servings,
        servings,
      );
      const converted = resolveAmount(
        scaled,
        line.unit,
        { size: line.pack_size, unit: line.pack_unit },
        item.dimension as Dimension,
      );

      if (!converted.ok) {
        flagged.push({
          item_name: line.item_name,
          issue:
            converted.reason === "dimension-mismatch"
              ? "dimension-mismatch"
              : "unknown-unit",
          detail:
            converted.reason === "dimension-mismatch"
              ? `${line.unit} can't convert to ${item.canonical_unit}`
              : `unknown unit "${line.unit}"`,
        });
        continue;
      }

      /**
       * What is actually on the shelf, not just what is in the open one.
       *
       * `quantity` has meant "the open container" since containers arrived, so
       * cooking used to cap a take at it: two sealed bottles and 100ml open
       * would give a recipe 100ml and report a shortfall, with a litre in the
       * cupboard. The total is sealed packs plus the open one.
       */
      const pack = item.pack_size !== null && item.pack_size > 0 ? item.pack_size : null;
      const onHand = (pack === null ? 0 : item.sealed_count * pack) + item.quantity;

      // Stock never goes negative - take what's there and flag the shortfall.
      const take = Math.min(converted.quantity, onHand);
      const left = onHand - take;

      // Split back into containers, the same closed form ADJUST_SQL uses:
      // finishing the open one opens the next.
      const sealedLeft = pack === null ? item.sealed_count : Math.floor(left / pack);
      const openLeft = pack === null ? left : Math.round((left - sealedLeft * pack) * 1e6) / 1e6;
      const brokeSeal = sealedLeft < item.sealed_count;

      await tx.execute({
        sql: `UPDATE items SET quantity = ?, sealed_count = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [openLeft, sealedLeft, item.id],
      });

      if (brokeSeal) {
        /**
         * A different packet is open now, so the old one's dates do not apply.
         *
         * expiry_date is cleared rather than carried forward: it is the date
         * printed on a packet that has been finished, and keeping it would nag
         * about something already eaten. The cook result says which items
         * these were, so you can put the new dates in while holding them.
         */
        opened.push({ item_id: item.id, item_name: item.name });
        await tx.execute({
          sql: `UPDATE items SET opened_at = CURRENT_TIMESTAMP, expiry_date = NULL
                WHERE id = ?`,
          args: [item.id],
        });
      } else if (take > 0) {
        // Taking some of something is opening it. Only stamped when there is no
        // date already: an open jar does not become fresher for being used
        // again, and re-stamping would keep pushing back a deadline that has
        // already started running.
        await tx.execute({
          sql: `UPDATE items SET opened_at = CURRENT_TIMESTAMP
                WHERE id = ? AND opened_at IS NULL`,
          args: [item.id],
        });
      }

      // Zero-take lines have nothing to give back, so they stay out of the log.
      if (take > 0) {
        changes.push({ item_id: item.id, delta: take, unit: item.canonical_unit });
      }

      const result: CookLineResult = {
        item_name: line.item_name,
        decremented: take,
        unit: item.canonical_unit,
        remaining: openLeft,
      };

      if (take < converted.quantity) {
        flagged.push({
          ...result,
          issue: "short",
          detail: `needed ${converted.quantity}${item.canonical_unit}, only ${onHand}${item.canonical_unit} in stock`,
        });
      } else {
        applied.push(result);
      }
    }

    await tx.execute({
      sql: "UPDATE recipes SET times_cooked = times_cooked + 1 WHERE id = ?",
      args: [recipeId],
    });

    // Written inside the same transaction as the decrements: a log that can be
    // committed separately from the change it describes is worse than none.
    const event = await tx.execute({
      sql: `INSERT INTO cook_events (kitchen_id, cooked_by, recipe_id, servings, changes)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        access.kitchen.id,
        access.user.id,
        recipeId,
        servings,
        JSON.stringify(changes),
      ],
    });

    await tx.commit();

    revalidatePath("/pantry");
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);

    return {
      ok: true,
      opened,
      applied,
      flagged,
      eventId: event.lastInsertRowid ? Number(event.lastInsertRowid) : undefined,
    };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cook failed",
      // The transaction rolled back, so nothing was opened after all.
      opened: [],
      applied: [],
      flagged: [],
    };
  }
}

/**
 * Your own rating, not the household's.
 *
 * A single shared number couldn't survive more than one person having an
 * opinion, so ratings moved to their own table keyed by who left them. The
 * average across everyone is what a listing shows.
 */
export async function rateRecipe(
  recipeId: number,
  rating: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Rating must be 1-5" };
  }

  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  // Only recipes you can see can be rated, so a number can't be attached to
  // somebody's private recipe by guessing its id.
  const visible = await getRecipe(recipeId, session.user.id);
  if (!visible) return { ok: false, error: "No such recipe" };

  await rate(recipeId, session.user.id, rating);

  revalidatePath("/recipes");
  revalidatePath("/discover");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export interface UndoLineResult {
  item_name: string;
  /** Amount put back, in the item's canonical unit. */
  restored: number;
  unit: string;
  quantity: number;
}

export interface UndoResult {
  ok: boolean;
  error?: string;
  restored: UndoLineResult[];
}

/**
 * Reverses a cook by adding its recorded deltas back to stock.
 *
 * Deltas rather than remembered absolutes: Claude Code writes to this database
 * too, so stock may have moved since the cook. Adding back what was taken
 * preserves an edit made in between, where restoring a snapshot would discard
 * it. A cook that was clamped short recorded what actually left stock, so this
 * gives back exactly that and no more.
 *
 * The guard update runs before the quantity changes and is conditional on
 * undone_at still being null, so a double-tap can't apply the deltas twice.
 */
export async function undoCook(eventId: number): Promise<UndoResult> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, error: "Invalid cook", restored: [] };
  }

  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error, restored: [] };

  const tx = await getDb().transaction("write");

  try {
    const eventResult = await tx.execute({
      sql: "SELECT * FROM cook_events WHERE id = ? AND kitchen_id = ?",
      args: [eventId, access.kitchen.id],
    });
    const event = eventResult.rows[0] as unknown as CookEvent | undefined;

    if (!event) {
      await tx.rollback();
      return { ok: false, error: "That cook is no longer on record", restored: [] };
    }

    const claimed = await tx.execute({
      sql: `UPDATE cook_events SET undone_at = CURRENT_TIMESTAMP
            WHERE id = ? AND kitchen_id = ? AND undone_at IS NULL`,
      args: [eventId, access.kitchen.id],
    });

    if (claimed.rowsAffected === 0) {
      await tx.rollback();
      return { ok: false, error: "Already undone", restored: [] };
    }

    const changes = JSON.parse(event.changes) as CookChange[];
    const restored: UndoLineResult[] = [];

    for (const change of changes) {
      // MAX(0, ...) is belt and braces - deltas are always positive going back
      // in - but it keeps a hand-edited log from writing a negative quantity.
      const updated = await tx.execute({
        sql: `UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND kitchen_id = ? RETURNING name, quantity, canonical_unit`,
        args: [change.delta, change.item_id, access.kitchen.id],
      });

      const row = updated.rows[0] as unknown as
        | { name: string; quantity: number; canonical_unit: string }
        | undefined;

      // The item may have been deleted since the cook. Nothing to restore it
      // to, and re-creating it would guess at fields the log doesn't hold.
      if (!row) continue;

      restored.push({
        item_name: row.name,
        restored: change.delta,
        unit: row.canonical_unit,
        quantity: row.quantity,
      });
    }

    await tx.execute({
      sql: "UPDATE recipes SET times_cooked = MAX(0, times_cooked - 1) WHERE id = ?",
      args: [event.recipe_id],
    });

    await tx.commit();

    revalidatePath("/pantry");
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${event.recipe_id}`);

    return { ok: true, restored };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Undo failed",
      restored: [],
    };
  }
}
