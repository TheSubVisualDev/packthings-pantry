import { NextResponse } from "next/server";
import { getDb, plainRows } from "@/lib/db";
import {
  dueToday,
  londonDate,
  londonNow,
  markNudged,
  nudge,
  pushConfigured,
} from "@/lib/push";
import { addDays, getPlanned, isoDate, weekStart } from "@/lib/plan";

export const dynamic = "force-dynamic";

/**
 * The weekly nudge, fired by a cron.
 *
 * Once a day at 17:00 UTC, which is early evening either side of the clock
 * change. It wanted to be hourly, so everybody could pick their own time -
 * Vercel's Hobby plan allows one cron run a day, so the day is what people
 * choose and the hour is the app's. See dueToday.
 *
 * It looks at the week before it sends, and says something true about it. "You
 * have not planned next week" and "four of next week's dinners are in, shall
 * we finish it" are different messages, and a notification that says the same
 * words every Sunday is a notification people turn off in a fortnight.
 */
export async function GET(request: Request) {
  /**
   * Only Vercel's scheduler, or somebody holding the secret.
   *
   * This route sends push notifications to real phones. Left open, it is a
   * button on the internet for making somebody's pocket buzz, and the fact
   * that it would only fire for people already due does not make that
   * acceptable - a loop over it is a denial of sleep.
   */
  const secret = process.env.CRON_SECRET;
  const offered = request.headers.get("authorization");
  if (!secret || offered !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not for you." }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ skipped: "no VAPID keys configured" });
  }

  /**
   * ?dry=1 answers the same question without waking anybody.
   *
   * Added because the obvious way to check this endpoint is alive is to call
   * it, and calling it sent real notifications to real phones - which I did,
   * three times, to somebody who had not asked to be told anything. A health
   * check that has side effects is not a health check.
   */
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const now = londonNow();
  const due = await dueToday();
  if (due.length === 0) {
    return NextResponse.json({ ...now, date: londonDate(), due: 0, sent: 0, dry });
  }

  if (dry) {
    return NextResponse.json({
      ...now,
      date: londonDate(),
      dry: true,
      due: due.length,
      would: due.map((person) => person.handle),
      sent: 0,
    });
  }

  /**
   * Which week the nudge is about.
   *
   * The one starting after today. A reminder to plan is a reminder about the
   * days ahead, and on a Sunday evening "this week" is four hours of it - so
   * the nudge points at the Monday coming, which is what somebody sitting down
   * on Sunday to plan actually means.
   */
  const today = isoDate(new Date());
  const nextWeek = weekStart(addDays(today, 1));

  let sent = 0;
  let retired = 0;
  const skipped: string[] = [];

  for (const person of due) {
    /**
     * Their kitchens, because a plan belongs to one and a person may have
     * several. The first one is the one the nudge talks about - the same rule
     * the rest of the app uses for a default kitchen.
     */
    const kitchens = plainRows<{ kitchen_id: number }>(
      await getDb().execute({
        sql: `SELECT kitchen_id FROM kitchen_members
              WHERE user_id = ? AND role IN ('owner', 'editor')
              ORDER BY kitchen_id LIMIT 1`,
        args: [person.user_id],
      }),
    );

    // No kitchen to plan in. Nudging somebody to fill a week they have nowhere
    // to put would be the app nagging about its own setup.
    if (kitchens.length === 0) {
      skipped.push(person.handle);
      continue;
    }

    const planned = await getPlanned(
      kitchens[0].kitchen_id,
      nextWeek,
      addDays(nextWeek, 6),
    );

    const filled = planned.length;
    const message =
      filled === 0
        ? {
            title: "What are you eating next week?",
            body: "Nothing planned yet. Fill the gaps and it will shop for it too.",
            url: `/plan?week=${nextWeek}`,
          }
        : {
            title: "Next week is half done",
            body: `${filled} ${filled === 1 ? "meal" : "meals"} in so far. Finish it off?`,
            url: `/plan?week=${nextWeek}`,
          };

    const result = await nudge(person.user_id, message);
    sent += result.sent;
    retired += result.retired;

    /**
     * Stamped when something actually went out.
     *
     * Not when it was merely attempted: a run where every device turned out to
     * be dead should be allowed to try again once the person re-subscribes,
     * rather than marking the week done on their behalf.
     */
    if (result.sent > 0) await markNudged(person.user_id);
  }

  return NextResponse.json({
    ...now,
    date: londonDate(),
    due: due.length,
    sent,
    retired,
    skipped,
  });
}
