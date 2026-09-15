import { after } from "next/server";
import { getDb, plainRows } from "./db";
import { nudge } from "./push";

/**
 * Telling somebody their recipe got cooked.
 *
 * The one notification this app has, and the bar for a second one is the
 * argument that got this one in: it has to be somebody else's action, about
 * something you made, that you would otherwise never find out about. Sharing a
 * recipe is the only thing in here done for other people, and until now it was
 * the only thing that gave nothing back - eleven recipes written and no way to
 * know any of them had ever been cooked.
 *
 * Everything here is written so that the notification can be wrong without the
 * cook being wrong. `record` never throws and is never awaited by the cook
 * action: a push service having a bad afternoon must not roll back somebody's
 * dinner coming off the shelf.
 *
 * It goes through `after` rather than being left as a floating promise,
 * though, and the difference is the feature working at all. A promise nobody
 * holds races the response in a serverless function - once the response is
 * sent the instance can be frozen, and the insert and the push never happen.
 * Warm instances mean it would usually work, which is worse than never
 * working: the failure is silent, intermittent, and looks exactly like nobody
 * having cooked anything.
 */

export interface Notification {
  id: number;
  kind: string;
  recipe_id: number | null;
  recipe_name: string | null;
  recipe_photo: string | null;
  actor_handle: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  servings: number | null;
  read_at: string | null;
  created_at: string;
  /**
   * When the cooking happened, which is not when this row was written.
   *
   * Usually the same evening, so it looks like a distinction without a
   * difference - until something is written after the fact, and then every
   * notification claims the dinner was today. The news is about the cook, so
   * the cook's date is the one to show.
   */
  cooked_at: string | null;
}

/**
 * Who, if anybody, should hear about this cook.
 *
 * Four reasons to say nobody, and they are all "this is not news":
 *
 * - The recipe has no author, or the author is the person who cooked it.
 *   Telling somebody what they just did is the definition of noise.
 * - Either of them has blocked the other. A block is a request not to appear
 *   in somebody's life, and a notification is appearing in somebody's life.
 * - They have already been told about this cook. The cook action can be
 *   retried, and being told twice about one dinner is a bug that looks like
 *   enthusiasm.
 */
async function audienceFor(
  cookEventId: number,
  recipeId: number,
  cookId: number,
): Promise<number | null> {
  const result = await getDb().execute({
    sql: `SELECT r.author_id
            FROM recipes r
           WHERE r.id = ?
             AND r.author_id IS NOT NULL
             AND r.author_id <> ?
             AND NOT EXISTS (
                   SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = r.author_id AND b.blocked_id = ?)
                       OR (b.blocker_id = ? AND b.blocked_id = r.author_id))
             AND NOT EXISTS (
                   SELECT 1 FROM notifications n
                    WHERE n.cook_event_id = ?)`,
    args: [recipeId, cookId, cookId, cookId, cookEventId],
  });

  const row = result.rows[0] as unknown as { author_id: number } | undefined;
  return row?.author_id ?? null;
}

/**
 * Records the notification and, if they have a phone registered, sends it.
 *
 * Deliberately returns void rather than a promise the caller waits on. This
 * runs immediately after a cook has been committed, and a cook is a person
 * standing in a kitchen having just pressed a button - the row on their shelf
 * has already moved, and nothing about telling somebody else is worth a
 * moment of that person's time or a chance of failing in front of them.
 */
export function record(input: {
  cookEventId: number;
  recipeId: number;
  cookId: number;
  recipeName: string;
  cookHandle: string;
}): void {
  const work = async () => {
    const authorId = await audienceFor(
      input.cookEventId,
      input.recipeId,
      input.cookId,
    );
    if (authorId === null) return;

    await getDb().execute({
      sql: `INSERT INTO notifications (user_id, kind, actor_id, recipe_id, cook_event_id)
            VALUES (?, 'cook', ?, ?, ?)`,
      args: [authorId, input.cookId, input.recipeId, input.cookEventId],
    });

    /**
     * The push, which is the half that only makes sense now.
     *
     * A cook is interesting on the evening it happens; the in-app list is
     * what catches it if the phone is off or nothing is subscribed. So the
     * list is written first and unconditionally, and this is the extra.
     */
    await nudge(authorId, {
      title: `@${input.cookHandle} cooked your recipe`,
      body: input.recipeName,
      url: `/recipes/${input.recipeId}`,
    });
  };

  // Swallowed either way. The dinner happened; the telling is best-effort.
  const guarded = () => work().catch(() => {});

  // `after` wants a request around it. A script has none, and for those the
  // floating promise is correct - nothing is about to freeze the process.
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

/** Undo takes the news with it - see the note on the table. */
export async function forgetCook(cookEventId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM notifications WHERE cook_event_id = ?",
    args: [cookEventId],
  });
}

/** The badge. One number, and it is the only thing most pages ask for. */
export async function unreadCount(userId: number): Promise<number> {
  const result = await getDb().execute({
    sql: "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
    args: [userId],
  });
  return Number((result.rows[0] as unknown as { n: number }).n);
}

/**
 * Newest first, which is the opposite of how the reports queue is read.
 *
 * A report is work to get through, so the oldest matters most; this is news,
 * and news that has been sitting for a fortnight is not news. Capped rather
 * than paged - nobody scrolls back through who cooked what in March.
 */
export async function listFor(
  userId: number,
  limit = 50,
): Promise<Notification[]> {
  const result = await getDb().execute({
    sql: `SELECT n.id, n.kind, n.recipe_id, n.read_at, n.created_at,
                 r.name AS recipe_name, r.photo_url AS recipe_photo,
                 u.handle AS actor_handle,
                 u.display_name AS actor_name,
                 u.avatar_url AS actor_avatar,
                 c.servings, c.cooked_at
            FROM notifications n
            LEFT JOIN recipes r ON r.id = n.recipe_id
            LEFT JOIN users u ON u.id = n.actor_id
            LEFT JOIN cook_events c ON c.id = n.cook_event_id
           WHERE n.user_id = ?
        ORDER BY n.created_at DESC, n.id DESC
           LIMIT ?`,
    args: [userId, limit],
  });
  return plainRows<Notification>(result);
}

/**
 * Marks everything read, on opening the page.
 *
 * Per-item read state would be a second thing to maintain for no gain: there
 * is nothing to do with one of these except read it, so arriving at the list
 * IS reading them. The timestamp is kept rather than a boolean so the page can
 * still draw a line under what was already seen last time.
 */
export async function markAllRead(userId: number): Promise<void> {
  await getDb().execute({
    sql: "UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL",
    args: [userId],
  });
}
