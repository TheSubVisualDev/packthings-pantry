import { getDb, plainRows } from "./db";

/**
 * Shops: where things get bought.
 *
 * The same shape as tags - a set per item with one singled out - because the
 * same two facts are needed: several places sell a thing, and one of them is
 * where you usually get it. Deliberately NOT tags, though. A tag describes what
 * the ingredient is; a shop describes the errand. Folding them together would
 * put "Tesco" beside "sauce" in every picker and every group-by menu, which is
 * noise in both directions.
 *
 * The read side is what the shopping list leans on, and it leans on it twice:
 * grouping uses the preferred shop, while filtering uses every shop an item has
 * - standing in Tesco you want everything Tesco sells, not only the things you
 * usually buy there.
 */

export interface Shop {
  id: number;
  kitchen_id: number;
  name: string;
}

export interface ShopInUse extends Shop {
  item_count: number;
}

export const MAX_SHOP_LENGTH = 40;

/** Trimmed and collapsed, case kept. Uniqueness is case-insensitive by index. */
export function cleanShopName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_SHOP_LENGTH);
}

/** Every shop this kitchen buys from, busiest first. */
export async function getShops(kitchenId: number | null): Promise<ShopInUse[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT s.id, s.kitchen_id, s.name,
            (SELECT COUNT(*) FROM item_shops isx WHERE isx.shop_id = s.id) AS item_count
          FROM shops s
          WHERE s.kitchen_id = ?
          ORDER BY item_count DESC, s.name COLLATE NOCASE`,
    args: [kitchenId],
  });
  return plainRows<ShopInUse>(result);
}

/** One item's shops. */
export async function getItemShops(itemId: number): Promise<Shop[]> {
  const result = await getDb().execute({
    sql: `SELECT s.id, s.kitchen_id, s.name
          FROM item_shops isx
          JOIN shops s ON s.id = isx.shop_id
          WHERE isx.item_id = ?
          ORDER BY s.name COLLATE NOCASE`,
    args: [itemId],
  });
  return result.rows as unknown as Shop[];
}

/** Finds a shop by name in a kitchen, creating it if it is new. */
export async function ensureShop(
  kitchenId: number,
  rawName: string,
): Promise<Shop | null> {
  const name = cleanShopName(rawName);
  if (!name) return null;

  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO shops (kitchen_id, name) VALUES (?, ?)",
    args: [kitchenId, name],
  });

  const found = await db.execute({
    sql: "SELECT id, kitchen_id, name FROM shops WHERE kitchen_id = ? AND LOWER(name) = LOWER(?)",
    args: [kitchenId, name],
  });
  return (found.rows[0] as unknown as Shop) ?? null;
}

/**
 * Says an item can be bought somewhere. The first place becomes the usual one,
 * because an item with shops but no preferred would vanish from a grouped list.
 */
export async function shopItem(
  kitchenId: number,
  itemId: number,
  rawName: string,
): Promise<Shop | null> {
  const shop = await ensureShop(kitchenId, rawName);
  if (!shop) return null;

  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO item_shops (item_id, shop_id) VALUES (?, ?)",
    args: [itemId, shop.id],
  });
  await db.execute({
    sql: `UPDATE items SET preferred_shop_id = ?
          WHERE id = ? AND kitchen_id = ? AND preferred_shop_id IS NULL`,
    args: [shop.id, itemId, kitchenId],
  });
  return shop;
}

/** Stops an item being bought somewhere, falling back if it was the usual one. */
export async function unshopItem(
  kitchenId: number,
  itemId: number,
  shopId: number,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `DELETE FROM item_shops
          WHERE item_id = ? AND shop_id = ?
            AND EXISTS (SELECT 1 FROM items i WHERE i.id = ? AND i.kitchen_id = ?)`,
    args: [itemId, shopId, itemId, kitchenId],
  });
  await db.execute({
    sql: `UPDATE items
          SET preferred_shop_id = (
            SELECT isx.shop_id FROM item_shops isx
            JOIN shops s ON s.id = isx.shop_id
            WHERE isx.item_id = items.id
            ORDER BY s.name COLLATE NOCASE
            LIMIT 1
          )
          WHERE id = ? AND kitchen_id = ? AND preferred_shop_id = ?`,
    args: [itemId, kitchenId, shopId],
  });
}

/** Marks one of an item's shops as where you usually get it. */
export async function setPreferredShop(
  kitchenId: number,
  itemId: number,
  shopId: number,
): Promise<boolean> {
  const result = await getDb().execute({
    sql: `UPDATE items SET preferred_shop_id = ?
          WHERE id = ? AND kitchen_id = ?
            AND EXISTS (
              SELECT 1 FROM item_shops isx WHERE isx.item_id = ? AND isx.shop_id = ?
            )`,
    args: [shopId, itemId, kitchenId, itemId, shopId],
  });
  return result.rowsAffected > 0;
}
