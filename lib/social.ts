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
 * that some future query will forget. `?` is the viewer's id, three times.
 */
export const VISIBLE_TO_VIEWER = `(
  r.author_id = ?
  OR r.visibility = 'public'
  OR (
    r.visibility = 'friends'
    AND EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id = r.author_id AND f1.followee_id = ?)
    AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = ? AND f2.followee_id = r.author_id)
  )
)`;

/** The three bindings VISIBLE_TO_VIEWER expects, in order. */
export function viewerArgs(viewerId: number): number[] {
  return [viewerId, viewerId, viewerId];
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
            (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following`,
    args: [viewerId, subjectId, subjectId, viewerId, subjectId, subjectId],
  });

  const row = result.rows[0] as unknown as {
    you_follow: number;
    follows_you: number;
    followers: number;
    following: number;
  };

  return {
    youFollow: row.you_follow === 1,
    followsYou: row.follows_you === 1,
    followers: row.followers,
    following: row.following,
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
          ORDER BY recipe_count DESC, u.handle`,
    args: [viewerId, viewerId],
  });

  return result.rows as unknown as (PublicUser & {
    recipe_count: number;
    you_follow: number;
  })[];
}
