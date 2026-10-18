import { getDb, plainRows } from "./db";

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
  /** How many this kitchen usually cooks for, from onboarding. */
  default_servings: number | null;
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

/**
 * Makes a kitchen.
 *
 * It used to come with the usual places to put things already in it - Fridge,
 * Freezer, Cupboard - which were where stock lived. v2 keeps no stock (18 Oct
 * 2026), so a kitchen is its people, its cookbook, its plan and its list.
 *
 * The first kitchen ever created also adopts every orphaned row of cooking
 * history that existed before kitchens did. Only the first, and only rows with
 * no kitchen: otherwise the second person to sign up would quietly inherit
 * someone else's.
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

    if (isFirstEver) {
      await tx.execute({
        sql: "UPDATE cook_events SET kitchen_id = ? WHERE kitchen_id IS NULL",
        args: [kitchen.id],
      });

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
 * without ever joining a household. A kitchen is something you make or get
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
  cookbook: number;
  cooks: number;
  shopping: number;
  members: number;
}

/**
 * What a kitchen currently holds.
 *
 * Used to make the delete confirmation concrete. "This removes 34 recipes from
 * the cookbook and 12 cooks" is a sentence someone can weigh; "are you sure?"
 * is not. It counted stock and scanned barcodes until v2 stopped keeping any.
 */
export async function getContents(kitchenId: number): Promise<KitchenContents> {
  const result = await getDb().execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM cookbook WHERE kitchen_id = ?) AS cookbook,
            (SELECT COUNT(*) FROM cook_events WHERE kitchen_id = ?) AS cooks,
            (SELECT COUNT(*) FROM shopping_list WHERE kitchen_id = ?) AS shopping,
            (SELECT COUNT(*) FROM kitchen_members WHERE kitchen_id = ?) AS members`,
    args: [kitchenId, kitchenId, kitchenId, kitchenId],
  });
  // Plain object: the counts are handed to the delete confirmation, which is a
  // client component, and a libSQL Row is not serialisable. See plainRows.
  return plainRows<KitchenContents>(result)[0];
}

/**
 * Deletes a kitchen and everything in it.
 *
 * The cookbook, cooking history, the plan, the shopping list and everyone's
 * membership all cascade away with it (and any stock rows left from before
 * v2). Recipes do not: they belong to whoever wrote them, not to a kitchen,
 * so they survive intact.
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
