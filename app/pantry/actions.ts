"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isKnownLocation } from "@/lib/locations";
import { getLocations } from "@/lib/kitchens";
import { requireKitchenRole } from "@/lib/session";
import { isBarcode } from "@/lib/off";
import { CANONICAL_FOR, dimensionOf, toCanonical } from "@/lib/units";
import { ADJUST_SQL, PACK_SQL } from "@/lib/containers";
import { cleanTagName, ensureTag, setPrimaryTag, tagItem, untagItem } from "@/lib/tags";
import { cleanShopName, setPreferredShop, shopItem, unshopItem } from "@/lib/shops";
import {
  copyMacrosToItem,
  estimateMissing,
  estimateOne,
  macrosForBarcode,
  reEstimate,
} from "@/lib/nutrition";

export interface AddItemState {
  error?: string;
}

/**
 * Creates a stock item, converting the typed quantity into the dimension's
 * canonical unit on the way in.
 *
 * Dimension isn't asked for: it follows from the unit, so there's no way to
 * submit "kg" against a volume item. Stock is stored canonically so cook-time
 * decrements never have to guess what a row's numbers mean.
 */
export async function addItem(
  _previous: AddItemState,
  formData: FormData,
): Promise<AddItemState> {
  // Adding stock is a change to a kitchen, so a viewer can't do it however
  // they reached the form.
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { error: access.error };

  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim().toLowerCase();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const expiry = String(formData.get("expiry_date") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();
  // Comma separated, because the field is one text box rather than a widget -
  // the add form is the one place speed matters more than ceremony.
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map(cleanTagName)
    .filter(Boolean);
  const shops = String(formData.get("shops") ?? "")
    .split(",")
    .map(cleanShopName)
    .filter(Boolean);

  // A scan knows what one pack holds, so an item can arrive already knowing
  // it comes in 500ml bottles rather than being taught later.
  const packRaw = String(formData.get("pack_size") ?? "").trim();
  const packSize = packRaw ? Number(packRaw) : null;
  const sealedRaw = String(formData.get("sealed_count") ?? "").trim();
  const sealed = sealedRaw ? Number(sealedRaw) : 0;

  // Everything the item page can set, so adding something and then editing it
  // are the same conversation rather than two different ones.
  const shelfRaw = String(formData.get("shelf_life_days") ?? "").trim();
  const shelfLife = shelfRaw ? Number(shelfRaw) : null;
  const targetRaw = String(formData.get("restock_target") ?? "").trim();
  const restockTarget = targetRaw ? Number(targetRaw) : null;
  const unspecified = formData.get("unspecified") === "on" ? 1 : 0;
  const alreadyOpen = formData.get("opened") === "on";

  if (!name) return { error: "Give it a name." };
  if (name.length > 80) return { error: "That name is too long." };

  if (packSize !== null && (!Number.isFinite(packSize) || packSize <= 0)) {
    return { error: "A pack has to hold more than nothing." };
  }
  if (!Number.isInteger(sealed) || sealed < 0) {
    return { error: "Sealed packs has to be a whole number, zero or more." };
  }

  if (shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife <= 0)) {
    return { error: "Shelf life should be a whole number of days." };
  }
  if (restockTarget !== null && (!Number.isFinite(restockTarget) || restockTarget < 0)) {
    return { error: "Keep at least has to be a number, zero or more." };
  }

  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Quantity has to be a number, zero or more." };
  }

  const dimension = dimensionOf(unit);
  if (!dimension) return { error: `"${unit}" isn't a unit I know.` };

  const converted = toCanonical(quantity, unit, dimension);
  if (!converted.ok) return { error: "That quantity couldn't be converted." };

  // The pack size is typed in the same unit as the quantity beside it, so it
  // converts the same way - and a pack that will not convert is a bad pack,
  // not a silent null.
  const convertedPack = packSize === null ? null : toCanonical(packSize, unit, dimension);
  if (convertedPack && !convertedPack.ok) {
    return { error: "That pack size couldn't be converted." };
  }

  const convertedTarget =
    restockTarget === null ? null : toCanonical(restockTarget, unit, dimension);
  if (convertedTarget && !convertedTarget.ok) {
    return { error: "That keep-at-least amount couldn't be converted." };
  }

  // An empty date input posts "", which would otherwise be stored as a date.
  const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null;

  let itemId: number;

  const places = await getLocations(access.kitchen.id);

  try {
    const inserted = await getDb().execute({
      sql: `INSERT INTO items (kitchen_id, name, quantity, canonical_unit, dimension, location, expiry_date, pack_size, pack_unit, sealed_count,
              shelf_life_days, restock_target, unspecified, opened_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    -- Stamped now when the thing arrives already open, which is
                    -- what "it's already open" on the form means.
                    CASE WHEN ? THEN CURRENT_TIMESTAMP END) RETURNING id`,
      args: [
        access.kitchen.id,
        name,
        converted.quantity,
        CANONICAL_FOR[dimension],
        dimension,
        isKnownLocation(location, places) ? location : null,
        expiryDate,
        // Stored in the canonical unit, like every other quantity here, so
        // nothing downstream has to ask what the number means.
        convertedPack && convertedPack.ok ? convertedPack.quantity : null,
        packSize === null ? null : CANONICAL_FOR[dimension],
        packSize === null ? 0 : sealed,
        shelfLife,
        convertedTarget && convertedTarget.ok ? convertedTarget.quantity : null,
        unspecified,
        alreadyOpen ? 1 : 0,
      ],
    });
    itemId = (inserted.rows[0] as unknown as { id: number }).id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // items.name is UNIQUE - adding more of something you have is an adjust.
    if (message.includes("UNIQUE")) {
      return { error: `"${name}" is already in stock. Use Quick adjust instead.` };
    }
    return { error: message || "Couldn't add that item." };
  }

  // After the insert, because a tag needs an item id to hang off. The first
  // one becomes what the item is filed under, which tagItem handles.
  for (const tag of tags) {
    await tagItem(access.kitchen.id, itemId, tag);
  }

  // Same rule as tags: the first one becomes the usual place, which shopItem
  // handles, so an item is never left in a shop group it does not belong to.
  for (const shop of shops) {
    await shopItem(access.kitchen.id, itemId, shop);
  }

  // Arrived from a scan: remember which item that barcode turned out to mean,
  // so the next scan of it recognises the product instead of asking again.
  if (isBarcode(barcode)) {
    await getDb().execute({
      sql: `INSERT INTO products (barcode, kitchen_id, item_id, name, pack_size, pack_unit, seen_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(barcode) DO UPDATE SET
              item_id = excluded.item_id,
              pack_size = excluded.pack_size,
              pack_unit = excluded.pack_unit,
              seen_at = CURRENT_TIMESTAMP`,
      args: [barcode, access.kitchen.id, itemId, name, converted.quantity, CANONICAL_FOR[dimension]],
    });

    // Same cache as the link flow: asked once per barcode, then never again.
    const macros = await macrosForBarcode(barcode);
    await copyMacrosToItem(access.kitchen.id, itemId, macros);
  }

  /**
   * A standard figure, if the name is one we know and nothing better arrived.
   *
   * After the barcode block, so a scan always wins - estimateOne refuses to
   * touch a row that already has a source. Means the common case needs no
   * button: something typed in as "Brown onions" has figures by the time you
   * look at it.
   */
  await estimateOne(access.kitchen.id, itemId, name);

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  redirect("/pantry");
}

export interface AdjustResult {
  ok: boolean;
  error?: string;
  /** What is left in the open container - or the loose amount. */
  quantity?: number;
  /** Unopened containers still on the shelf. */
  sealedCount?: number;
  /** What one container holds, so the caller can redraw the bar. */
  packSize?: number | null;
}

/**
 * Moves one item's stock by a delta in its canonical unit.
 *
 * The arithmetic happens in SQL rather than read-then-write: Claude Code is a
 * second writer on this database, so a quantity read into JS and written back
 * would discard anything that landed in between. Clamped at zero, since
 * negative stock isn't a thing.
 */
export async function adjustItem(
  itemId: number,
  delta: number,
): Promise<AdjustResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "Nothing to change" };
  }

  const result = await getDb().execute({
    // The kitchen is in the WHERE clause, not checked afterwards: an item id
    // from another kitchen simply matches nothing.
    sql: ADJUST_SQL,
    args: [delta, itemId, access.kitchen.id],
  });

  const row = result.rows[0] as unknown as
    | { quantity: number; sealed_count: number; pack_size: number | null }
    | undefined;
  // No row means the id belongs to another kitchen, the item is gone, or its
  // quantity is marked unspecified - and none of those is something to add to.
  if (!row) {
    return { ok: false, error: "That item can't be adjusted." };
  }

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  return {
    ok: true,
    quantity: row.quantity,
    sealedCount: row.sealed_count,
    packSize: row.pack_size,
  };
}

export interface ItemResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Edits one item.
 *
 * The kitchen is in the WHERE clause rather than checked beforehand, so an id
 * from another kitchen matches nothing - the same rule the rest of the stock
 * queries follow.
 */
export async function updateItem(
  _previous: ItemResult,
  formData: FormData,
): Promise<ItemResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const itemId = Number(formData.get("item_id"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give it a name." };

  const quantity = Number(String(formData.get("quantity") ?? "").trim());
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: "Quantity has to be a number, zero or more." };
  }

  const shelfRaw = String(formData.get("shelf_life_days") ?? "").trim();
  const shelfLife = shelfRaw ? Number(shelfRaw) : null;
  if (shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife <= 0)) {
    return { ok: false, error: "Shelf life should be a whole number of days." };
  }

  const expiry = String(formData.get("expiry_date") ?? "").trim();
  const places = await getLocations(access.kitchen.id);
  const location = String(formData.get("location") ?? "").trim();

  // The unit and dimension aren't editable: changing them would reinterpret a
  // number already on the shelf, and "800" meaning grams one minute and
  // millilitres the next is how stock counts quietly go wrong. Delete and
  // re-add is the honest way to change what something is measured in.
  try {
    await getDb().execute({
      // category is deliberately absent: tags replaced it, and leaving the old
      // string where it is keeps the only way back if that turns out to be wrong.
      sql: `UPDATE items SET name = ?, quantity = ?, location = ?,
              expiry_date = ?, shelf_life_days = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND kitchen_id = ?`,
      args: [
        name,
        quantity,
        isKnownLocation(location, places) ? location : null,
        /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
        shelfLife,
        itemId,
        access.kitchen.id,
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      return { ok: false, error: `"${name}" is already in this kitchen.` };
    }
    return { ok: false, error: message || "Couldn't save that." };
  }

  // "Onion" becoming "Red onion" should keep its guess; becoming "Olive oil"
  // very much should not, and stale figures would sit there looking certain.
  await reEstimate(access.kitchen.id, itemId, name);

  revalidatePath("/pantry");
  revalidatePath(`/pantry/item/${itemId}`);
  return { ok: true, message: "Saved." };
}

/**
 * Records that something has been opened.
 *
 * Only stamps a date that isn't there: opening an already-open jar doesn't
 * make it fresher, and re-stamping would quietly extend a deadline that has
 * already started running.
 */
export async function setOpened(itemId: number, opened: boolean): Promise<ItemResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  await getDb().execute({
    sql: opened
      ? `UPDATE items SET opened_at = CURRENT_TIMESTAMP
         WHERE id = ? AND kitchen_id = ? AND opened_at IS NULL`
      : `UPDATE items SET opened_at = NULL WHERE id = ? AND kitchen_id = ?`,
    args: [itemId, access.kitchen.id],
  });

  revalidatePath("/pantry");
  revalidatePath(`/pantry/item/${itemId}`);
  return { ok: true };
}

export async function deleteItem(itemId: number): Promise<ItemResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  // recipe_ingredients.item_id is ON DELETE SET NULL, so recipes keep their
  // line and simply stop being linked to stock - the name is the portable half.
  await getDb().execute({
    sql: "DELETE FROM items WHERE id = ? AND kitchen_id = ?",
    args: [itemId, access.kitchen.id],
  });

  revalidatePath("/pantry");
  redirect("/pantry");
}

export interface TagResult {
  ok: boolean;
  error?: string;
  /** The tag as stored, so the caller can show the name it actually got. */
  tag?: { id: number; name: string };
}

/**
 * Puts a tag on an item, creating the tag in this kitchen if it is new.
 *
 * Free text rather than a fixed list, for the same reason categories were: you
 * cannot file the first jar of something new if the vocabulary needs a code
 * change first.
 */
export async function addTag(itemId: number, name: string): Promise<TagResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }

  const clean = cleanTagName(name);
  if (!clean) return { ok: false, error: "Give the tag a name." };

  const tag = await tagItem(access.kitchen.id, itemId, clean);
  if (!tag) return { ok: false, error: "Couldn't save that tag." };

  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/pantry");
  revalidatePath("/kitchens");
  return { ok: true, tag: { id: tag.id, name: tag.name } };
}

/** Takes a tag off one item. The tag itself stays in the kitchen. */
export async function removeTag(itemId: number, tagId: number): Promise<TagResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || !Number.isInteger(tagId)) {
    return { ok: false, error: "Unknown tag" };
  }

  await untagItem(access.kitchen.id, itemId, tagId);

  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/pantry");
  revalidatePath("/kitchens");
  return { ok: true };
}

/** Files an item under one of the tags it already carries. */
export async function fileUnder(itemId: number, tagId: number): Promise<TagResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || !Number.isInteger(tagId)) {
    return { ok: false, error: "Unknown tag" };
  }

  const changed = await setPrimaryTag(access.kitchen.id, itemId, tagId);
  if (!changed) return { ok: false, error: "That tag isn't on this item." };

  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/pantry");
  return { ok: true };
}

/**
 * Puts whole unopened containers on the shelf, or takes them off.
 *
 * Its own action rather than a large positive adjustment, because those are
 * different events: buying a bottle adds a sealed bottle, it does not pour
 * 500ml into the one already open.
 */
export async function adjustPacks(
  itemId: number,
  packs: number,
): Promise<AdjustResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }
  if (!Number.isInteger(packs) || packs === 0) {
    return { ok: false, error: "Nothing to change" };
  }

  const result = await getDb().execute({
    sql: PACK_SQL,
    args: [packs, itemId, access.kitchen.id],
  });

  const row = result.rows[0] as unknown as
    | { quantity: number; sealed_count: number; pack_size: number | null }
    | undefined;
  // PACK_SQL requires a pack size: an item measured loosely has no containers
  // to count, so there is nothing this could mean.
  if (!row) {
    return { ok: false, error: "Give this a pack size first." };
  }

  revalidatePath("/pantry");
  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/recipes");
  return {
    ok: true,
    quantity: row.quantity,
    sealedCount: row.sealed_count,
    packSize: row.pack_size,
  };
}

/**
 * Sets how an item is packaged: what one container holds, how many unopened
 * ones there are, how many to keep, and whether the amount is known at all.
 *
 * Clearing the pack size turns the item back into a loose amount, so the
 * sealed count goes with it rather than lingering as a number counting nothing.
 */
export async function setPackaging(
  _previous: ItemResult,
  formData: FormData,
): Promise<ItemResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const itemId = Number(formData.get("item_id"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }

  const unspecified = formData.get("unspecified") === "on" ? 1 : 0;

  const sizeRaw = String(formData.get("pack_size") ?? "").trim();
  const packSize = sizeRaw ? Number(sizeRaw) : null;
  if (packSize !== null && (!Number.isFinite(packSize) || packSize <= 0)) {
    return { ok: false, error: "A pack has to hold more than nothing." };
  }

  const sealedRaw = String(formData.get("sealed_count") ?? "").trim();
  const sealed = sealedRaw ? Number(sealedRaw) : 0;
  if (!Number.isInteger(sealed) || sealed < 0) {
    return { ok: false, error: "Sealed packs has to be a whole number, zero or more." };
  }

  const targetRaw = String(formData.get("restock_target") ?? "").trim();
  const restockTarget = targetRaw ? Number(targetRaw) : null;
  if (restockTarget !== null && (!Number.isFinite(restockTarget) || restockTarget < 0)) {
    return { ok: false, error: "Keep at least has to be a number, zero or more." };
  }


  await getDb().execute({
    sql: `UPDATE items
          SET pack_size = ?,
              pack_unit = CASE WHEN ? IS NULL THEN NULL ELSE canonical_unit END,
              sealed_count = CASE WHEN ? IS NULL THEN 0 ELSE ? END,
              -- shop is absent on purpose: a stock row can be bought in
              -- several places now, which lives in item_shops instead.
              -- restock_to and restock_min are left alone on purpose: they
              -- are the old packs/amount pair, frozen as the way back.
              restock_target = ?,
              unspecified = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND kitchen_id = ?`,
    args: [
      packSize,
      packSize,
      packSize,
      sealed,
      restockTarget,
      unspecified,
      itemId,
      access.kitchen.id,
    ],
  });

  revalidatePath("/pantry");
  revalidatePath(`/pantry/item/${itemId}`);
  return { ok: true, message: "Saved." };
}

export interface BulkResult {
  ok: boolean;
  error?: string;
  /** How many rows actually changed, which is what the toast should say. */
  changed?: number;
}

/**
 * The ids a bulk action is allowed to touch.
 *
 * Every bulk statement below filters on kitchen_id as well as the id list, so a
 * borrowed id from another kitchen matches nothing rather than being checked
 * and rejected. This just keeps the list sane before it gets that far.
 */
function cleanIds(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
}

/** Moves everything selected to one place in the kitchen. */
export async function bulkLocation(
  ids: number[],
  location: string,
): Promise<BulkResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const wanted = cleanIds(ids);
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };

  const places = await getLocations(access.kitchen.id);
  const place = location.trim();
  // An empty string means "nowhere in particular", which is a real answer.
  if (place && !isKnownLocation(place, places)) {
    return { ok: false, error: "That isn't one of this kitchen's places." };
  }

  const result = await getDb().execute({
    sql: `UPDATE items SET location = ?, updated_at = CURRENT_TIMESTAMP
          WHERE kitchen_id = ? AND id IN (${wanted.map(() => "?").join(", ")})`,
    args: [place || null, access.kitchen.id, ...wanted],
  });

  revalidatePath("/pantry");
  return { ok: true, changed: result.rowsAffected };
}

/**
 * Marks everything selected as opened, or back to sealed.
 *
 * Opening only stamps rows that are not already open, so putting six things
 * away and tapping "opened" does not reset the clock on the jar that has been
 * open since Tuesday.
 */
export async function bulkOpened(
  ids: number[],
  opened: boolean,
): Promise<BulkResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const wanted = cleanIds(ids);
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };

  const placeholders = wanted.map(() => "?").join(", ");
  const result = await getDb().execute({
    sql: opened
      ? `UPDATE items SET opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE kitchen_id = ? AND opened_at IS NULL AND id IN (${placeholders})`
      : `UPDATE items SET opened_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE kitchen_id = ? AND id IN (${placeholders})`,
    args: [access.kitchen.id, ...wanted],
  });

  revalidatePath("/pantry");
  return { ok: true, changed: result.rowsAffected };
}

/**
 * Puts one tag on everything selected.
 *
 * The tag is created once and linked many times, rather than going through
 * tagItem per row - that would be three round trips to Nuremberg per item, and
 * the whole point of selecting twelve things is not doing something twelve
 * times.
 */
export async function bulkTag(ids: number[], name: string): Promise<BulkResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const wanted = cleanIds(ids);
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };

  const tag = await ensureTag(access.kitchen.id, name);
  if (!tag) return { ok: false, error: "Give the tag a name." };

  const placeholders = wanted.map(() => "?").join(", ");
  const db = getDb();

  const linked = await db.execute({
    sql: `INSERT OR IGNORE INTO item_tags (item_id, tag_id)
          SELECT i.id, ? FROM items i
          WHERE i.kitchen_id = ? AND i.id IN (${placeholders})`,
    args: [tag.id, access.kitchen.id, ...wanted],
  });

  // Anything not filed anywhere gets filed here, matching what a single tag
  // does. Anything already filed keeps its own answer.
  await db.execute({
    sql: `UPDATE items SET primary_tag_id = ?
          WHERE kitchen_id = ? AND primary_tag_id IS NULL AND id IN (${placeholders})`,
    args: [tag.id, access.kitchen.id, ...wanted],
  });

  revalidatePath("/pantry");
  revalidatePath("/kitchens");
  return { ok: true, changed: linked.rowsAffected };
}

/**
 * Takes one tag off everything selected.
 *
 * Filing falls back to whatever else the item carries, the same rule a single
 * untag follows - an item should never drop out of the grouped view because of
 * a tidy-up.
 */
export async function bulkUntag(ids: number[], tagId: number): Promise<BulkResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const wanted = cleanIds(ids);
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };
  if (!Number.isInteger(tagId)) return { ok: false, error: "Unknown tag." };

  const placeholders = wanted.map(() => "?").join(", ");
  const db = getDb();

  const removed = await db.execute({
    sql: `DELETE FROM item_tags
          WHERE tag_id = ?
            AND item_id IN (
              SELECT i.id FROM items i
              WHERE i.kitchen_id = ? AND i.id IN (${placeholders})
            )`,
    args: [tagId, access.kitchen.id, ...wanted],
  });

  await db.execute({
    sql: `UPDATE items
          SET primary_tag_id = (
            SELECT it.tag_id FROM item_tags it
            JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = items.id
            ORDER BY t.name COLLATE NOCASE
            LIMIT 1
          )
          WHERE kitchen_id = ? AND primary_tag_id = ? AND id IN (${placeholders})`,
    args: [access.kitchen.id, tagId, ...wanted],
  });

  revalidatePath("/pantry");
  revalidatePath("/kitchens");
  return { ok: true, changed: removed.rowsAffected };
}

/**
 * Deletes everything selected.
 *
 * Recipes that call for these keep their lines and simply stop being linked to
 * stock, which is the same thing deleting one item does - the recipe's own
 * wording was never the pantry's to take away.
 */
export async function bulkDelete(ids: number[]): Promise<BulkResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const wanted = cleanIds(ids);
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };

  const result = await getDb().execute({
    sql: `DELETE FROM items
          WHERE kitchen_id = ? AND id IN (${wanted.map(() => "?").join(", ")})`,
    args: [access.kitchen.id, ...wanted],
  });

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  return { ok: true, changed: result.rowsAffected };
}

export interface ShopResult {
  ok: boolean;
  error?: string;
  shop?: { id: number; name: string };
}

/** Says this item can be bought somewhere, creating the shop if it is new. */
export async function addShop(itemId: number, name: string): Promise<ShopResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }

  const clean = cleanShopName(name);
  if (!clean) return { ok: false, error: "Give the shop a name." };

  const shop = await shopItem(access.kitchen.id, itemId, clean);
  if (!shop) return { ok: false, error: "Couldn't save that shop." };

  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/pantry/list");
  return { ok: true, shop: { id: shop.id, name: shop.name } };
}

/** Stops this item being bought somewhere. The shop itself stays. */
export async function removeShop(itemId: number, shopId: number): Promise<ShopResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || !Number.isInteger(shopId)) {
    return { ok: false, error: "Unknown shop" };
  }

  await unshopItem(access.kitchen.id, itemId, shopId);

  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/pantry/list");
  return { ok: true };
}

/** Marks one of an item's shops as where you usually get it. */
export async function preferShop(itemId: number, shopId: number): Promise<ShopResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || !Number.isInteger(shopId)) {
    return { ok: false, error: "Unknown shop" };
  }

  const changed = await setPreferredShop(access.kitchen.id, itemId, shopId);
  if (!changed) return { ok: false, error: "You don't buy this there." };

  revalidatePath(`/pantry/item/${itemId}`);
  revalidatePath("/pantry/list");
  return { ok: true };
}

/**
 * Records the date printed on a packet.
 *
 * Its own action because the moment it is wanted is not the moment you are
 * editing an item: a pack gets opened while you are cooking, and that is when
 * the date is in your hand. An empty string clears it, which is a real answer -
 * plenty of things have no date on them at all.
 */
export async function setExpiry(
  itemId: number,
  date: string,
): Promise<ItemResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }

  const clean = date.trim();
  if (clean && !/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return { ok: false, error: "That isn't a date." };
  }

  await getDb().execute({
    sql: `UPDATE items SET expiry_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND kitchen_id = ?`,
    args: [clean || null, itemId, access.kitchen.id],
  });

  revalidatePath("/pantry");
  revalidatePath(`/pantry/item/${itemId}`);
  return { ok: true, message: "Saved." };
}

export interface EstimateResult {
  ok: boolean;
  error?: string;
  /** What was filled in, and what each was taken to be. */
  filled?: { name: string; basis: string }[];
}

/**
 * Fills in standard figures for stock that has none.
 *
 * A button rather than something that happens quietly on a timer, because it is
 * a judgement: these are what carrots are usually like, not what yours are. A
 * person should choose to accept that, and should see the list of what was
 * assumed afterwards.
 *
 * Safe to run again whenever the table of generics grows - it only touches rows
 * that still have nothing.
 */
export async function estimateNutrition(): Promise<EstimateResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const filled = await estimateMissing(access.kitchen.id);

  revalidatePath("/pantry");
  return { ok: true, filled: filled.map(({ name, basis }) => ({ name, basis })) };
}

/**
 * Types nutrition in by hand.
 *
 * The door out of guessing. A standard figure for "cheese" is nothing like a
 * particular cheese, and the person holding the block can read the back of it -
 * so what they enter outranks both the table and any future scan, and is marked
 * 'manual' so nothing quietly replaces it.
 *
 * Clearing every field removes the figures and the source with them, which puts
 * the item back where it started: unknown, and open to being estimated again.
 */
export async function setNutrition(
  _previous: ItemResult,
  formData: FormData,
): Promise<ItemResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const itemId = Number(formData.get("item_id"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }

  const read = (field: string): number | null | "bad" => {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return "bad";
    return value;
  };

  const fields = ["kcal_100", "protein_100", "carbs_100", "fat_100", "fibre_100", "salt_100"];
  const values = fields.map(read);
  if (values.includes("bad")) {
    return { ok: false, error: "Those should be numbers, zero or more." };
  }

  const given = values as (number | null)[];
  const anything = given.some((value) => value !== null);

  await getDb().execute({
    sql: `UPDATE items
          SET kcal_100 = ?, protein_100 = ?, carbs_100 = ?, fat_100 = ?,
              fibre_100 = ?, salt_100 = ?, nutrition_source = ?
          WHERE id = ? AND kitchen_id = ?`,
    args: [...given, anything ? "manual" : null, itemId, access.kitchen.id],
  });

  revalidatePath("/pantry");
  revalidatePath(`/pantry/item/${itemId}`);
  return { ok: true, message: anything ? "Saved." : "Cleared." };
}
