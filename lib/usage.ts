import { after } from "next/server";
import { getDb, plainRows } from "./db";

/**
 * Counting what gets pressed.
 *
 * The whole point is to find out which parts of the app are actually used, so
 * that the work of making things frictionless is spent on the screens people
 * are standing in front of rather than the ones that were interesting to
 * build. Until this existed, every claim about what mattered was a guess.
 *
 * Two rules hold this down to something safe to leave running:
 *
 * It never throws and never blocks. A tracker that breaks the button it is
 * measuring is worse than no tracker, and an await on a Nuremberg round trip
 * in front of a cook is a tracker that makes the app slower to teach you it is
 * slow. `record` swallows everything and is not awaited by its callers.
 *
 * But not-awaited is not the same as fire-and-forget, and that distinction is
 * the whole reason `after` is here. A bare floating promise in a serverless
 * function races the response: once the response is sent the instance can be
 * frozen or torn down, and a write still in flight simply never lands. It
 * would mostly work, because Fluid Compute keeps instances warm - which is the
 * worst kind of bug, one that passes every test and loses an unknown fraction
 * of its writes in production. And it would fail as a zero, which is exactly
 * the reading check:usage exists to stop being wrong.
 *
 * It counts and nothing else. One row per action, no session id, no path
 * through the app, no funnel. "Which features get used" is answerable from
 * counts; anything that needs an ordered journey needs a different table and a
 * reason to want one.
 */

/**
 * The names that may be recorded.
 *
 * A closed list rather than a free string, because the counts are only
 * comparable if the names are stable, and the failure mode of a free string is
 * that 'cook' and 'cook.start' and 'cooked' are three rows in the report and
 * one thing in the kitchen. Adding a name here is the deliberate act of
 * deciding a new thing is worth counting.
 *
 * Coarse on purpose. A name per button gives two hundred counts of one and
 * answers nothing; these are features, which is the grain the question is
 * actually asked at.
 */
export const ACTIONS = [
  "cook.start",           // a recipe was actually cooked
  "stock.adjust",         // the stepper or the sheet moved a quantity
  "stock.pack",           // a sealed pack was opened
  "stock.swipe",          // the row gesture, either direction
  "item.add",             // something new put on a shelf
  "receipt.scan",         // a photo of a receipt was read
  "shopping.add",         // anything added to the list, from anywhere
  "shopping.tick",        // a line crossed off, in the shop
  "recipe.open",          // a recipe was looked at
  "recipe.like",          // the heart
  "recipe.save",          // pinned or added to a cookbook
  "recipe.paste",         // plain text turned into a recipe
  "recipe.create",        // written from scratch in the editor
  "plan.set",             // a meal put in a slot for a day
  "plan.shop",            // "shop for it" off the week planner
  "search.run",           // a search that returned something
  "report.file",          // somebody wrote in from /report
] as const;

export type UsageAction = (typeof ACTIONS)[number];

const KNOWN = new Set<string>(ACTIONS);

export function isUsageAction(value: unknown): value is UsageAction {
  return typeof value === "string" && KNOWN.has(value);
}

/**
 * Writes one event, and cannot fail in a way the caller has to care about.
 *
 * Deliberately returns void rather than a promise to await: every call site is
 * in front of something a person is waiting for, and the count is worth
 * exactly nothing compared to the action being counted. If the database is
 * unreachable the event is lost, which is the correct trade - the alternative
 * is a queue, and a queue is a second thing that can break.
 *
 * `page` is truncated because a route with a long query string is mostly
 * query string, and the route is the part being asked about.
 */
export function record(
  action: UsageAction,
  userId: number | null,
  page: string | null,
): void {
  defer(() =>
    getDb().execute({
      sql: "INSERT INTO usage_events (user_id, action, page) VALUES (?, ?, ?)",
      args: [userId, action, page ? page.slice(0, 200) : null],
    }),
  );
}

/**
 * Runs the write after the response, and never in front of the person.
 *
 * `after` is the framework's answer to the floating-promise problem: the work
 * is handed to the runtime, which keeps the function alive for it. It also
 * runs when the handler threw or called `redirect`, which matters - adding an
 * item ends in a redirect, and a redirect unwinds by throwing.
 *
 * Wrapped because `after` needs a request to be inside. Anything calling this
 * from a script has no request and would get an exception instead of a count,
 * so that case falls back to the floating promise it was before: best-effort,
 * and correct wherever the process is not about to be frozen.
 */
function defer(work: () => Promise<unknown>): void {
  const guarded = () => work().catch(() => {});
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

/** Several at once, for a beacon arriving with a page's worth of taps on it. */
export function recordMany(
  events: { action: UsageAction; page: string | null }[],
  userId: number | null,
): void {
  if (events.length === 0) return;

  // One statement rather than a batch of inserts: this runs on a serverless
  // function talking to Nuremberg, and ten round trips to count ten taps is
  // the tracker costing more than the thing it measures.
  const values = events.map(() => "(?, ?, ?)").join(", ");
  const args = events.flatMap((event) => [
    userId,
    event.action,
    event.page ? event.page.slice(0, 200) : null,
  ]);

  defer(() =>
    getDb().execute({
      sql: `INSERT INTO usage_events (user_id, action, page) VALUES ${values}`,
      args,
    }),
  );
}

export interface ActionCount {
  action: string;
  count: number;
  people: number;
  last_at: string | null;
}

/**
 * How often each action happened, over a window of whole days.
 *
 * The window is expressed to SQLite as a modifier on `now` rather than
 * computed here, because the rows carry CURRENT_TIMESTAMP - which sqld writes
 * in UTC - and a date built in Node would be built in the server's zone. The
 * two are the same right up until they are not, and this is the class of bug
 * `daysUntil` in lib/dates.ts exists as a monument to.
 *
 * `people` alongside `count` because they answer different questions: an
 * action with 400 uses and one user is one person's habit, and an action with
 * 40 uses across 12 people is a feature.
 */
export async function usageByAction(days: number): Promise<ActionCount[]> {
  const result = await getDb().execute({
    sql: `SELECT action,
                 COUNT(*)                  AS count,
                 COUNT(DISTINCT user_id)   AS people,
                 MAX(created_at)           AS last_at
            FROM usage_events
           WHERE created_at >= datetime('now', ?)
        GROUP BY action
        ORDER BY count DESC`,
    args: [`-${Math.max(1, Math.floor(days))} days`],
  });
  return plainRows(result) as unknown as ActionCount[];
}

export interface PageCount {
  page: string;
  count: number;
}

/** Where the taps happen, which is not the same question as what they do. */
export async function usageByPage(days: number): Promise<PageCount[]> {
  const result = await getDb().execute({
    sql: `SELECT COALESCE(page, '(unknown)') AS page, COUNT(*) AS count
            FROM usage_events
           WHERE created_at >= datetime('now', ?)
        GROUP BY page
        ORDER BY count DESC`,
    args: [`-${Math.max(1, Math.floor(days))} days`],
  });
  return plainRows(result) as unknown as PageCount[];
}

/**
 * The names that have never once been recorded in the window.
 *
 * This is the half of the report worth reading. A list of what is popular
 * mostly confirms what you already believed; a list of what nobody has touched
 * in a month is the thing that changes a decision.
 */
export async function unusedActions(days: number): Promise<string[]> {
  const seen = new Set((await usageByAction(days)).map((row) => row.action));
  return ACTIONS.filter((action) => !seen.has(action));
}
