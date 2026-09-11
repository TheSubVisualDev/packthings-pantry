import { getDb } from "./db";

export interface Tag {
  id: number;
  kitchen_id: number;
  name: string;
}

export interface TagInUse extends Tag {
  /** How many items carry it, so an unused tag is visibly unused. */
  item_count: number;
}

/** How long a tag name may be. Long enough for "White wheat flours". */
export const MAX_TAG_LENGTH = 40;

/**
 * Normalises a typed tag name.
 *
 * Collapsed whitespace and trimmed, but NOT lowercased: the case someone typed
 * is the case it should read as. Uniqueness is enforced case-insensitively by
 * an expression index, so "Baking" and "baking" still cannot both exist.
 */
export function cleanTagName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

/** Every tag in a kitchen, most used first - which is also the pick order. */
export async function getTags(kitchenId: number | null): Promise<TagInUse[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT t.id, t.kitchen_id, t.name,
            (SELECT COUNT(*) FROM item_tags it WHERE it.tag_id = t.id) AS item_count
          FROM tags t
          WHERE t.kitchen_id = ?
          ORDER BY item_count DESC, t.name COLLATE NOCASE`,
    args: [kitchenId],
  });
  return result.rows as unknown as TagInUse[];
}

/**
 * Every item's tags, as one query rather than one per item.
 *
 * A page showing fifty items would otherwise issue fifty queries, and each one
 * is a round trip to Nuremberg. Returned as a Map so callers index straight in.
 */
export async function getTagsByItem(
  kitchenId: number | null,
): Promise<Map<number, Tag[]>> {
  const byItem = new Map<number, Tag[]>();
  if (kitchenId === null) return byItem;

  const result = await getDb().execute({
    sql: `SELECT it.item_id, t.id, t.kitchen_id, t.name
          FROM item_tags it
          JOIN tags t ON t.id = it.tag_id
          JOIN items i ON i.id = it.item_id
          WHERE i.kitchen_id = ?
          ORDER BY t.name COLLATE NOCASE`,
    args: [kitchenId],
  });

  for (const row of result.rows as unknown as (Tag & { item_id: number })[]) {
    const existing = byItem.get(row.item_id);
    const tag = { id: row.id, kitchen_id: row.kitchen_id, name: row.name };
    if (existing) existing.push(tag);
    else byItem.set(row.item_id, [tag]);
  }
  return byItem;
}

/** One item's tags. */
export async function getItemTags(itemId: number): Promise<Tag[]> {
  const result = await getDb().execute({
    sql: `SELECT t.id, t.kitchen_id, t.name
          FROM item_tags it
          JOIN tags t ON t.id = it.tag_id
          WHERE it.item_id = ?
          ORDER BY t.name COLLATE NOCASE`,
    args: [itemId],
  });
  return result.rows as unknown as Tag[];
}

/**
 * Finds a tag by name in a kitchen, creating it if it is not there.
 *
 * INSERT OR IGNORE then SELECT rather than SELECT then INSERT: the unique index
 * is what decides, so two people filing the same new tag at once end up with
 * one tag rather than an error.
 */
export async function ensureTag(
  kitchenId: number,
  rawName: string,
): Promise<Tag | null> {
  const name = cleanTagName(rawName);
  if (!name) return null;

  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO tags (kitchen_id, name) VALUES (?, ?)",
    args: [kitchenId, name],
  });

  const found = await db.execute({
    sql: "SELECT id, kitchen_id, name FROM tags WHERE kitchen_id = ? AND LOWER(name) = LOWER(?)",
    args: [kitchenId, name],
  });
  return (found.rows[0] as unknown as Tag) ?? null;
}

/**
 * Puts a tag on an item, and files the item under it if it is not filed yet.
 *
 * The first tag an item gets becomes its primary, because an item with tags but
 * no primary would vanish from a grouped list - filed under nothing.
 */
export async function tagItem(
  kitchenId: number,
  itemId: number,
  rawName: string,
): Promise<Tag | null> {
  const tag = await ensureTag(kitchenId, rawName);
  if (!tag) return null;

  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
    args: [itemId, tag.id],
  });
  await db.execute({
    // The kitchen is in the WHERE clause, so an item id from elsewhere matches
    // nothing - the rule the rest of the stock queries follow.
    sql: `UPDATE items SET primary_tag_id = ?
          WHERE id = ? AND kitchen_id = ? AND primary_tag_id IS NULL`,
    args: [tag.id, itemId, kitchenId],
  });
  return tag;
}

/**
 * Takes a tag off an item.
 *
 * If it was the one the item was filed under, another of its tags takes over
 * rather than the item dropping out of every grouped view. The tag itself
 * survives even when nothing carries it any more: an empty tag is still a word
 * this kitchen uses, and dropping it would lose that the moment you untag the
 * last jar.
 */
export async function untagItem(
  kitchenId: number,
  itemId: number,
  tagId: number,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `DELETE FROM item_tags
          WHERE item_id = ? AND tag_id = ?
            AND EXISTS (SELECT 1 FROM items i WHERE i.id = ? AND i.kitchen_id = ?)`,
    args: [itemId, tagId, itemId, kitchenId],
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
          WHERE id = ? AND kitchen_id = ? AND primary_tag_id = ?`,
    args: [itemId, kitchenId, tagId],
  });
}

/** Files an item under one of the tags it already carries. */
export async function setPrimaryTag(
  kitchenId: number,
  itemId: number,
  tagId: number,
): Promise<boolean> {
  const result = await getDb().execute({
    sql: `UPDATE items SET primary_tag_id = ?
          WHERE id = ? AND kitchen_id = ?
            AND EXISTS (
              SELECT 1 FROM item_tags it WHERE it.item_id = ? AND it.tag_id = ?
            )`,
    args: [tagId, itemId, kitchenId, itemId, tagId],
  });
  return result.rowsAffected > 0;
}

/**
 * Removes a tag from the kitchen entirely.
 *
 * item_tags cascades, and any item left filed under nothing falls back to
 * another of its tags by the same rule as untagItem.
 */
export async function deleteTag(kitchenId: number, tagId: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM tags WHERE id = ? AND kitchen_id = ?",
    args: [tagId, kitchenId],
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
          WHERE kitchen_id = ? AND primary_tag_id IS NULL`,
    args: [kitchenId],
  });
}

/** Renames a tag, keeping every item that carries it. */
export async function renameTag(
  kitchenId: number,
  tagId: number,
  rawName: string,
): Promise<{ ok: boolean; error?: string }> {
  const name = cleanTagName(rawName);
  if (!name) return { ok: false, error: "Give it a name." };

  try {
    const result = await getDb().execute({
      sql: "UPDATE tags SET name = ? WHERE id = ? AND kitchen_id = ?",
      args: [name, tagId, kitchenId],
    });
    if (result.rowsAffected === 0) return { ok: false, error: "No such tag." };
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      return { ok: false, error: `This kitchen already has a tag called ${name}.` };
    }
    throw error;
  }
}
