import { getDb, plainRows } from "./db";
import type { PublicUser } from "./users";

/**
 * Who can see whose recipes, and who follows whom.
 *
 * "Friends" means a mutual follow. Any other definition surprises somebody:
 * letting everyone who follows you read your private-ish recipes means
 * strangers opt themselves in, and letting everyone you follow read them means
 * you can't share with someone without also reading their output. Both sides
 * saying yes is the only rule nobody has to be told twice.
 */

export type Visibility = "private" | "friends" | "public";

export const VISIBILITIES: Visibility[] = ["private", "friends", "public"];

export function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as string[]).includes(value);
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Only me",
  friends: "Friends",
  public: "Everyone here",
};

export const VISIBILITY_BLURB: Record<Visibility, string> = {
  private: "Nobody else can see this.",
  friends: "People you follow who follow you back.",
  public: "Anyone with an account can find it.",
};

/**
 * The SQL that decides whether a viewer may read a recipe.
 *
 * Written once and pasted into every recipe query rather than filtered in JS
 * afterwards, because a visibility rule applied in the application layer is one
 * that some future query will forget. Every `?` is the viewer's id - see
 * viewerArgs below, which is the only place that count is written down.
 */
export const VISIBLE_TO_VIEWER = `(
  (
    r.author_id = ?
    OR r.visibility = 'public'
    OR (
      r.visibility = 'friends'
      AND EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id = r.author_id AND f1.followee_id = ?)
      AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = ? AND f2.followee_id = r.author_id)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = r.author_id AND b.blocked_id = ?)
       OR (b.blocker_id = ? AND b.blocked_id = r.author_id)
  )
)`;

/**
 * The five bindings VISIBLE_TO_VIEWER expects, in order.
 *
 * Kept as a function beside the SQL so the two can't drift: adding a clause
 * means adding a binding here, in the same file, in the same edit.
 */
export function viewerArgs(viewerId: number): number[] {
  return [viewerId, viewerId, viewerId, viewerId, viewerId];
}

export async function isBlockedEitherWay(a: number, b: number): Promise<boolean> {
  const result = await getDb().execute({
    sql: `SELECT 1 FROM blocks
          WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
          LIMIT 1`,
    args: [a, b, b, a],
  });
  return result.rows.length > 0;
}

/**
 * Blocking drops the follow in both directions.
 *
 * Leaving a stale follow behind would mean unblocking silently restores a
 * relationship the person had already walked away from.
 */
export async function block(blockerId: number, blockedId: number): Promise<void> {
  if (blockerId === blockedId) return;

  const tx = await getDb().transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      args: [blockerId, blockedId],
    });
    await tx.execute({
      sql: `DELETE FROM follows
            WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)`,
      args: [blockerId, blockedId, blockedId, blockerId],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function unblock(blockerId: number, blockedId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?",
    args: [blockerId, blockedId],
  });
}

export async function follow(followerId: number, followeeId: number): Promise<void> {
  if (followerId === followeeId) return;

  await getDb().execute({
    sql: `INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)
          ON CONFLICT DO NOTHING`,
    args: [followerId, followeeId],
  });
}

export async function unfollow(followerId: number, followeeId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
    args: [followerId, followeeId],
  });
}

export interface FollowState {
  youFollow: boolean;
  followsYou: boolean;
  followers: number;
  following: number;
  youBlocked: boolean;
}

export async function followState(
  viewerId: number,
  subjectId: number,
): Promise<FollowState> {
  const result = await getDb().execute({
    sql: `SELECT
            EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS you_follow,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS follows_you,
            (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following,
            EXISTS (SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?) AS you_blocked`,
    args: [viewerId, subjectId, subjectId, viewerId, subjectId, subjectId, viewerId, subjectId],
  });

  const row = result.rows[0] as unknown as {
    you_follow: number;
    follows_you: number;
    followers: number;
    following: number;
    you_blocked: number;
  };

  return {
    youFollow: row.you_follow === 1,
    followsYou: row.follows_you === 1,
    followers: row.followers,
    following: row.following,
    youBlocked: row.you_blocked === 1,
  };
}

/**
 * People to look at.
 *
 * Everyone, ordered by how much they've put in - on a pantry with five accounts
 * a ranked "suggested for you" would be theatre, and a plain list of who else
 * is here is more honest and more useful.
 */
export async function browsePeople(viewerId: number): Promise<
  (PublicUser & { recipe_count: number; you_follow: number })[]
> {
  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle, u.display_name, u.avatar_url, u.created_at,
            (SELECT COUNT(*) FROM recipes r
              WHERE r.author_id = u.id AND r.visibility = 'public') AS recipe_count,
            EXISTS (SELECT 1 FROM follows f
              WHERE f.follower_id = ? AND f.followee_id = u.id) AS you_follow
          FROM users u
          WHERE u.id <> ?
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = u.id AND b.blocked_id = ?)
                 OR (b.blocker_id = ? AND b.blocked_id = u.id)
            )
          ORDER BY recipe_count DESC, u.handle`,
    args: [viewerId, viewerId, viewerId, viewerId],
  });

  return result.rows as unknown as (PublicUser & {
    recipe_count: number;
    you_follow: number;
  })[];
}

export interface Ancestor {
  id: number;
  name: string;
  handle: string | null;
  display_name: string | null;
  /** 1 is the recipe this was taken from, 2 is where that came from. */
  depth: number;
}

/**
 * Where a recipe came from, all the way back.
 *
 * Walks forked_from_id upwards rather than showing one hop, because a recipe
 * three people have adapted has three people to thank, and stopping at the
 * nearest one quietly takes the credit away from whoever actually wrote it.
 *
 * **Deliberately skips the visibility rule**, like getRecipeAuthorHandle does:
 * an attribution is a credit, not access. "Adapted from @sam" has to keep
 * working after Sam makes the original private, or taking your own copy private
 * would erase the person you got it from. Only the name and the author travel -
 * never the ingredients, never the method.
 *
 * The depth limit is not for cycles, which forking cannot create, but for the
 * database being wrong: a recursive query with no floor is a hang waiting for a
 * bad row.
 */
export async function getLineage(recipeId: number, limit = 8): Promise<Ancestor[]> {
  const result = await getDb().execute({
    sql: `WITH RECURSIVE chain(id, depth) AS (
            SELECT forked_from_id, 1 FROM recipes
              WHERE id = ? AND forked_from_id IS NOT NULL
            UNION ALL
            SELECT r.forked_from_id, chain.depth + 1
              FROM recipes r JOIN chain ON r.id = chain.id
              WHERE r.forked_from_id IS NOT NULL AND chain.depth < ?
          )
          SELECT r.id, r.name, u.handle, u.display_name, chain.depth
          FROM chain
          JOIN recipes r ON r.id = chain.id
          LEFT JOIN users u ON u.id = r.author_id
          ORDER BY chain.depth`,
    args: [recipeId, limit],
  });
  return result.rows as unknown as Ancestor[];
}

export interface Remix {
  id: number;
  name: string;
  handle: string | null;
  display_name: string | null;
  /** Whether it is the viewer's own, so their variations read differently. */
  yours: number;
}

/**
 * Recipes taken from this one.
 *
 * Unlike the lineage above, this DOES apply the visibility rule. A credit
 * pointing backwards is something the original author earned; a list pointing
 * forwards would expose what other people have written, and a private remix is
 * private for a reason - somebody's half-finished attempt is not the original
 * author's to show off.
 */
export async function getRemixes(
  recipeId: number,
  viewerId: number,
  limit = 12,
): Promise<Remix[]> {
  const result = await getDb().execute({
    sql: `SELECT r.id, r.name, u.handle, u.display_name,
                 (r.author_id = ?) AS yours
          FROM recipes r
          LEFT JOIN users u ON u.id = r.author_id
          WHERE r.forked_from_id = ?
            AND ${VISIBLE_TO_VIEWER}
          ORDER BY yours DESC, r.id DESC
          LIMIT ?`,
    args: [viewerId, recipeId, ...viewerArgs(viewerId), limit],
  });
  return result.rows as unknown as Remix[];
}

export interface CookedByOther {
  recipe_id: number;
  name: string;
  photo_url: string | null;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  cooked_at: string;
  /** How many times they have made it, which is the whole recommendation. */
  times: number;
}

/**
 * What other people actually cooked this week - board `1n`.
 *
 * The strongest signal in the whole app and nothing read it. A like is "that
 * looks nice"; adopting is "this is a thing my kitchen makes"; cooking it on a
 * Tuesday, and then again, is somebody voting with their own dinner.
 *
 * Only recipes the viewer is already allowed to see, and only other people's
 * cooks - your own dinners are not a discovery. The event itself says nothing
 * more than "this visible recipe was made", which is the same fact its
 * `times_cooked` already publishes.
 */
export async function getCookedByOthers(
  viewerId: number,
  limit = 8,
): Promise<CookedByOther[]> {
  const result = await getDb().execute({
    sql: `SELECT r.id AS recipe_id, r.name, r.photo_url,
                 u.handle, u.display_name, u.avatar_url,
                 MAX(c.cooked_at) AS cooked_at,
                 COUNT(*) AS times
          FROM cook_events c
          JOIN recipes r ON r.id = c.recipe_id
          JOIN users u ON u.id = c.cooked_by
          WHERE c.undone_at IS NULL
            AND c.cooked_by <> ?
            AND c.cooked_at >= datetime('now', '-14 days')
            AND ${VISIBLE_TO_VIEWER}
          GROUP BY r.id, u.id
          ORDER BY cooked_at DESC
          LIMIT ?`,
    args: [viewerId, ...viewerArgs(viewerId), limit],
  });
  return plainRows<CookedByOther>(result);
}

export interface Trusted {
  id: number;
  name: string;
  photo_url: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  base_servings: number;
  author_handle: string | null;
  author_name: string | null;
  avg_rating: number | null;
  rating_count: number;
  /** Times anybody has cooked it, anywhere. */
  times_cooked: number;
  /** People who have saved it. */
  saves: number;
}

/**
 * Recipes with something behind them.
 *
 * Ranked on being cooked and kept rather than on being liked: a like costs a
 * tap, and cooking something twice costs an evening. The numbers are shown
 * rather than turned into a score, because "cooked 34 times, saved by 12" is
 * checkable and "94% match" is a magic trick.
 */
export async function getTrusted(viewerId: number, limit = 6): Promise<Trusted[]> {
  const result = await getDb().execute({
    sql: `SELECT r.id, r.name, r.photo_url, r.prep_minutes, r.cook_minutes,
                 r.base_servings, r.times_cooked,
                 u.handle AS author_handle, u.display_name AS author_name,
                 (SELECT ROUND(AVG(rating), 1) FROM recipe_ratings WHERE recipe_id = r.id) AS avg_rating,
                 (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) AS rating_count,
                 (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) AS saves
          FROM recipes r
          LEFT JOIN users u ON u.id = r.author_id
          WHERE r.author_id <> ?
            AND ${VISIBLE_TO_VIEWER}
          ORDER BY (r.times_cooked * 2
                    + (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id)) DESC,
                   r.id DESC
          LIMIT ?`,
    args: [viewerId, ...viewerArgs(viewerId), limit],
  });
  return plainRows<Trusted>(result);
}

export interface SimilarCook {
  id: number;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  /** Recipes you have both saved. The reason to follow them. */
  shared_saves: number;
  recipe_count: number;
  you_follow: number;
}

/**
 * People worth following, said in terms of why.
 *
 * "Cooks like you" rather than a follower count: how many people follow
 * somebody is a fact about them, and what you have in common is a fact about
 * the two of you, which is the only one that answers "should I follow this
 * person". Blocks apply in both directions, as everywhere.
 */
export async function getSimilarCooks(
  viewerId: number,
  limit = 6,
): Promise<SimilarCook[]> {
  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle, u.display_name, u.avatar_url,
            (SELECT COUNT(*) FROM recipe_likes mine
               JOIN recipe_likes theirs ON theirs.recipe_id = mine.recipe_id
              WHERE mine.user_id = ? AND theirs.user_id = u.id) AS shared_saves,
            (SELECT COUNT(*) FROM recipes r
              WHERE r.author_id = u.id AND r.visibility = 'public') AS recipe_count,
            EXISTS (SELECT 1 FROM follows f
              WHERE f.follower_id = ? AND f.followee_id = u.id) AS you_follow
          FROM users u
          WHERE u.id <> ?
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = u.id AND b.blocked_id = ?)
                 OR (b.blocker_id = ? AND b.blocked_id = u.id)
            )
          ORDER BY you_follow, shared_saves DESC, recipe_count DESC, u.handle
          LIMIT ?`,
    args: [viewerId, viewerId, viewerId, viewerId, viewerId, limit],
  });
  return plainRows<SimilarCook>(result);
}
