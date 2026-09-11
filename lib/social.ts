import { getDb } from "./db";
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
