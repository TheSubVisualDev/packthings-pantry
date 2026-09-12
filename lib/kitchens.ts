import { getDb, plainRows } from "./db";
import { DEFAULT_LOCATIONS } from "./locations";

/**
 * Kitchens, who belongs to them, and what they're allowed to do.
 *
 * Every read of stock is scoped to one kitchen and every write checks a role,
 * so "can this person see this" is answered in one place rather than at each
 * call site where it would eventually be forgotten.
 */

export type Role = "owner" | "editor" | "viewer";

/** Ranked, so a check can ask for "editor or better" without a list. */
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export function atLeast(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed];
}

export interface Kitchen {
  id: number;
  name: string;
  owner_id: number;
  created_at: string | null;
}

export interface KitchenMembership extends Kitchen {
  role: Role;
  /** Whose it is, for telling two kitchens called "Home" apart. */
  owner_handle: string;
}

export interface Member {
  user_id: number;
  handle: string;
  display_name: string;
  role: Role;
  joined_at: string | null;
}

/** Every kitchen a person can open, their own first. */
export async function getKitchensFor(userId: number): Promise<KitchenMembership[]> {
  const result = await getDb().execute({
    sql: `SELECT k.*, m.role, u.handle AS owner_handle
          FROM kitchen_members m
          JOIN kitchens k ON k.id = m.kitchen_id
          JOIN users u ON u.id = k.owner_id
          WHERE m.user_id = ?
          ORDER BY (k.owner_id = ?) DESC, k.name`,
    args: [userId, userId],
  });
  return plainRows<KitchenMembership>(result);
}

/**
 * One kitchen, but only if this person is in it.
 *
 * Membership is part of the query rather than a check afterwards, so there is
 * no path where the row is fetched and the permission is forgotten.
 */
export async function getKitchenFor(
  userId: number,
  kitchenId: number,
): Promise<KitchenMembership | null> {
  const result = await getDb().execute({
    sql: `SELECT k.*, m.role, u.handle AS owner_handle
          FROM kitchen_members m
          JOIN kitchens k ON k.id = m.kitchen_id
          JOIN users u ON u.id = k.owner_id
          WHERE m.user_id = ? AND k.id = ?`,
    args: [userId, kitchenId],
  });
  return (result.rows[0] as unknown as KitchenMembership) ?? null;
}

export async function getMembers(kitchenId: number): Promise<Member[]> {
  const result = await getDb().execute({
    sql: `SELECT m.user_id, m.role, m.joined_at, u.handle, u.display_name
          FROM kitchen_members m JOIN users u ON u.id = m.user_id
          WHERE m.kitchen_id = ?
          ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.handle`,
    args: [kitchenId],
  });
  // Plain objects: the members list reaches a client component. See plainRows.
  return plainRows<Member>(result);
}

export async function getLocations(kitchenId: number): Promise<string[]> {
  const result = await getDb().execute({
    sql: "SELECT name FROM kitchen_locations WHERE kitchen_id = ? ORDER BY position, id",
    args: [kitchenId],
  });
  return (result.rows as unknown as { name: string }[]).map((row) => row.name);
}

/**
 * Makes a kitchen, with the usual places to put things already in it.
 *
 * The first kitchen ever created also adopts every orphaned row - the stock,
 * scanned products and cooking history that existed before kitchens did. Only
 * the first, and only rows with no kitchen: otherwise the second person to
 * sign up would quietly inherit someone else's shopping.
 */
export async function createKitchen(
  ownerId: number,
  name: string,
): Promise<Kitchen> {
  const tx = await getDb().transaction("write");

  try {
    const existing = await tx.execute("SELECT COUNT(*) AS n FROM kitchens");
    const isFirstEver = (existing.rows[0] as unknown as { n: number }).n === 0;

    const created = await tx.execute({
      sql: "INSERT INTO kitchens (name, owner_id) VALUES (?, ?) RETURNING *",
      args: [name.trim() || "Home", ownerId],
    });
    const kitchen = created.rows[0] as unknown as Kitchen;

    await tx.execute({
      sql: "INSERT INTO kitchen_members (kitchen_id, user_id, role) VALUES (?, ?, 'owner')",
      args: [kitchen.id, ownerId],
    });

    for (const [index, place] of DEFAULT_LOCATIONS.entries()) {
      await tx.execute({
        sql: "INSERT INTO kitchen_locations (kitchen_id, name, position) VALUES (?, ?, ?)",
        args: [kitchen.id, place, index],
      });
    }

    if (isFirstEver) {
      for (const table of ["items", "products", "cook_events"]) {
        await tx.execute({
          sql: `UPDATE ${table} SET kitchen_id = ? WHERE kitchen_id IS NULL`,
          args: [kitchen.id],
        });
      }

      // Recipes aren't kitchen-scoped, but they were written by someone and
      // the rows predating authorship have nobody. Same condition, same
      // moment: the first person through the door wrote what was already here.
      await tx.execute({
        sql: "UPDATE recipes SET author_id = ? WHERE author_id IS NULL",
        args: [ownerId],
      });
    }

    await tx.commit();
    return kitchen;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * The kitchen someone lands in, or null.
 *
 * Deliberately does not conjure one. An account is a person on the network
 * first: they can follow people, write recipes and read everyone else's
 * without ever tracking a tin of beans. A kitchen is something you make or get
 * added to, and an empty "Home" nobody asked for is just a thing to explain.
 */
export async function currentKitchenFor(
  userId: number,
): Promise<KitchenMembership | null> {
  const mine = await getKitchensFor(userId);
  return mine[0] ?? null;
}

/**
 * Makes someone their first kitchen and hands it back.
 *
 * Only called from places where a person has actually asked for one - claiming
 * the pantry at first run, or pressing the button on /kitchens.
 */
export async function makeFirstKitchen(
  userId: number,
  name = "Home",
): Promise<KitchenMembership> {
  await createKitchen(userId, name);

  // Read it back rather than assembling the membership by hand, so the row
  // carries the owner handle the switcher needs.
  const created = await getKitchensFor(userId);
  return created[0];
}

export async function renameKitchen(kitchenId: number, name: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE kitchens SET name = ? WHERE id = ?",
    args: [name.trim() || "Home", kitchenId],
  });
}

export async function setLocations(kitchenId: number, names: string[]): Promise<void> {
  const cleaned = names.map((name) => name.trim()).filter(Boolean).slice(0, 20);

  const tx = await getDb().transaction("write");
  try {
    // Rewritten rather than diffed: it's a short ordered list, and the order is
    // the point. Items keep their location as free text, so a renamed place
    // leaves those rows reading the old name rather than losing it.
    await tx.execute({
      sql: "DELETE FROM kitchen_locations WHERE kitchen_id = ?",
      args: [kitchenId],
    });
    for (const [index, name] of cleaned.entries()) {
      await tx.execute({
        sql: "INSERT INTO kitchen_locations (kitchen_id, name, position) VALUES (?, ?, ?)",
        args: [kitchenId, name, index],
      });
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function addMember(
  kitchenId: number,
  userId: number,
  role: Role,
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO kitchen_members (kitchen_id, user_id, role) VALUES (?, ?, ?)
          ON CONFLICT(kitchen_id, user_id) DO UPDATE SET role = excluded.role`,
    args: [kitchenId, userId, role],
  });
}

/** Owners are never removed or demoted here - a kitchen with nobody in charge
 * has no route back. Changing who owns it is a separate, deliberate act. */
export async function removeMember(kitchenId: number, userId: number): Promise<void> {
  await getDb().execute({
    sql: `DELETE FROM kitchen_members
          WHERE kitchen_id = ? AND user_id = ? AND role <> 'owner'`,
    args: [kitchenId, userId],
  });
}

export interface KitchenContents {
  items: number;
  products: number;
  cooks: number;
  shopping: number;
  members: number;
}

/**
 * What a kitchen currently holds.
 *
 * Used to make the delete confirmation concrete. "This removes 34 items and 12
 * cooks" is a sentence someone can weigh; "are you sure?" is not.
 */
export async function getContents(kitchenId: number): Promise<KitchenContents> {
  const result = await getDb().execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM items WHERE kitchen_id = ?) AS items,
            (SELECT COUNT(*) FROM products WHERE kitchen_id = ?) AS products,
            (SELECT COUNT(*) FROM cook_events WHERE kitchen_id = ?) AS cooks,
            (SELECT COUNT(*) FROM shopping_list WHERE kitchen_id = ?) AS shopping,
            (SELECT COUNT(*) FROM kitchen_members WHERE kitchen_id = ?) AS members`,
    args: [kitchenId, kitchenId, kitchenId, kitchenId, kitchenId],
  });
  return result.rows[0] as unknown as KitchenContents;
}

/**
 * Deletes a kitchen and everything in it.
 *
 * Stock, scanned barcodes, cooking history, the shopping list and everyone's
 * membership all cascade away with it. Recipes do not: they belong to whoever
 * wrote them, not to a set of shelves, so they survive intact and simply stop
 * being matched against anything.
 *
 * The owner is in the WHERE clause, so this can only ever be your own.
 */
export async function deleteKitchen(
  kitchenId: number,
  ownerId: number,
): Promise<boolean> {
  const result = await getDb().execute({
    sql: "DELETE FROM kitchens WHERE id = ? AND owner_id = ?",
    args: [kitchenId, ownerId],
  });
  return result.rowsAffected > 0;
}
