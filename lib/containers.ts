import { formatQuantity } from "./units";
import type { Item } from "./types";

/**
 * Stock as containers rather than a running total.
 *
 * A row is `sealed_count` unopened packs plus whatever is left in the open one,
 * which is what `quantity` means once `pack_size` is set. The total on hand is
 * `sealed_count * pack_size + quantity`.
 *
 * The point of modelling it this way is the bar: its maximum is one container's
 * capacity, so it reads "two thirds of a bottle" and stays still when you shop.
 * A bar whose maximum is the total moves every time you buy anything, which
 * makes it useless for the only question it is asked - is there enough left.
 */

/** What one container holds, when the item is packaged at all. */
export function packOf(item: Item): { size: number; unit: string } | null {
  if (item.pack_size === null || item.pack_size <= 0) return null;
  return { size: item.pack_size, unit: item.pack_unit ?? item.canonical_unit };
}

/** Everything on the shelf. Null when nobody has said how much there is. */
export function totalOnHand(item: Item): number | null {
  if (item.unspecified) return null;
  const pack = packOf(item);
  if (!pack) return item.quantity;
  return item.sealed_count * pack.size + item.quantity;
}

/** Whether there is anything at all, which is a different question from how much. */
export function inStock(item: Item): boolean {
  if (item.unspecified) return true;
  const total = totalOnHand(item);
  return total !== null && total > 0;
}

/**
 * How full the open container is, 0 to 1.
 *
 * Null when there is no container to be a fraction of - a loose amount has
 * nothing to fill.
 */
export function openFraction(item: Item): number | null {
  const pack = packOf(item);
  if (!pack || item.unspecified) return null;
  return Math.max(0, Math.min(1, item.quantity / pack.size));
}

/** The unit to print after a number. Counts read as bare numbers. */
function unitLabel(item: Item): string {
  return item.canonical_unit === "count" ? "" : item.canonical_unit;
}

/**
 * One line describing what is on the shelf.
 *
 * Deliberately says the same thing the bar shows rather than a total: "2 sealed
 * + 320ml open" is what you would say out loud, and "1320ml" is not.
 */
export function describeStock(item: Item): string {
  if (item.unspecified) return "some";

  const pack = packOf(item);
  if (!pack) {
    return `${formatQuantity(item.quantity)}${unitLabel(item)}`;
  }

  const open = `${formatQuantity(item.quantity)}${unitLabel(item)} open`;
  if (item.sealed_count === 0) {
    return item.quantity > 0 ? open : "none left";
  }
  const sealed = `${item.sealed_count} sealed`;
  return item.quantity > 0 ? `${sealed} + ${open}` : sealed;
}

/** How many whole containers are still to buy, against the target. */
export function shortfall(item: Item): number {
  if (item.restock_to === null || item.unspecified) return 0;
  // A part-used open container still counts as one you have: nobody buys a
  // replacement bottle because the one in the door is half empty.
  const have = item.sealed_count + (item.quantity > 0 ? 1 : 0);
  return Math.max(0, item.restock_to - have);
}

/**
 * Takes from, or adds to, an item's stock - cascading across containers.
 *
 * One statement rather than read-compute-write, because two people adjusting the
 * same jar at once must not lose one of the changes. It works on the total and
 * then splits it back into containers, which is the closed form of "when the
 * open one empties, open the next": 1320ml in 500ml bottles is 2 sealed and
 * 320 open, and taking 400 leaves 920, which is 1 sealed and 420 open.
 *
 * ROUND guards the split against floating point, so 1500 never arrives as
 * 1499.9999 and quietly becomes 2 sealed plus 499.9 rather than 3 sealed.
 *
 * opened_at is restamped only when a sealed container actually had to be opened
 * to satisfy the take - that is the moment the clock on "once open, use within"
 * genuinely restarts.
 *
 * Rows with unspecified set are excluded rather than adjusted: there is no
 * number there to add to.
 */
export const ADJUST_SQL = `
WITH target AS (
  SELECT
    id,
    pack_size,
    sealed_count AS was_sealed,
    ROUND(
      MAX(0, COALESCE(sealed_count, 0) * COALESCE(pack_size, 0) + quantity + ?),
      6
    ) AS total
  FROM items
  WHERE id = ? AND kitchen_id = ? AND unspecified = 0
),
split AS (
  SELECT
    id,
    was_sealed,
    CASE
      WHEN pack_size IS NULL OR pack_size <= 0 THEN was_sealed
      ELSE CAST(total / pack_size AS INTEGER)
    END AS new_sealed,
    CASE
      WHEN pack_size IS NULL OR pack_size <= 0 THEN total
      ELSE ROUND(total - CAST(total / pack_size AS INTEGER) * pack_size, 6)
    END AS new_open
  FROM target
)
UPDATE items
SET quantity = (SELECT new_open FROM split),
    sealed_count = (SELECT new_sealed FROM split),
    opened_at = CASE
      WHEN (SELECT new_sealed FROM split) < (SELECT was_sealed FROM split)
       AND (SELECT new_open FROM split) > 0
      THEN CURRENT_TIMESTAMP
      ELSE opened_at
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM split)
RETURNING quantity, sealed_count, pack_size
`;

/**
 * Adds or removes whole unopened containers.
 *
 * Its own operation rather than a large positive adjustment: buying a bottle
 * puts a sealed bottle on the shelf, it does not pour 500ml into the one that
 * is already open.
 */
export const PACK_SQL = `
UPDATE items
SET sealed_count = MAX(0, sealed_count + ?),
    updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND kitchen_id = ? AND pack_size IS NOT NULL AND pack_size > 0
RETURNING quantity, sealed_count, pack_size
`;

/**
 * The same split as ADJUST_SQL, in JavaScript.
 *
 * It exists so the optimistic number a stepper shows is the number the server
 * will agree with - including when a take crosses a container boundary, which
 * is exactly the case a naive "quantity + delta" gets visibly wrong.
 *
 * These two must stay in step. If you change one, change the other, and check
 * them against each other the way scripts/check-cascade.mjs does.
 */
export function applyDelta(
  item: Pick<Item, "quantity" | "sealed_count" | "pack_size" | "pack_unit" | "unspecified" | "canonical_unit">,
  delta: number,
): { quantity: number; sealedCount: number } {
  if (item.unspecified) {
    return { quantity: item.quantity, sealedCount: item.sealed_count };
  }

  const size = item.pack_size !== null && item.pack_size > 0 ? item.pack_size : null;
  const total = round6(
    Math.max(0, (size === null ? 0 : item.sealed_count * size) + item.quantity + delta),
  );

  if (size === null) return { quantity: total, sealedCount: item.sealed_count };

  const sealed = Math.floor(total / size);
  return { quantity: round6(total - sealed * size), sealedCount: sealed };
}

/** Matching the ROUND(..., 6) the SQL uses, for the same reason. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
