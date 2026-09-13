import { NextResponse } from "next/server";
import { getDb, plainRows } from "@/lib/db";
import { dueThisHour, londonNow, nudge, pushConfigured } from "@/lib/push";
import { addDays, getPlanned, isoDate, weekStart } from "@/lib/plan";

export const dynamic = "force-dynamic";

/**
 * The weekly nudge, fired by a cron.
 *
 * Hourly, because everybody picks their own hour and the alternative is one
 * fixed time that suits whoever wrote it. Each run asks who is due in the next
 * sixty minutes of London time and sends to their devices.
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

  const now = londonNow();
  const due = await dueThisHour();
  if (due.length === 0) {
    return NextResponse.json({ ...now, due: 0, sent: 0 });
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
  }

  return NextResponse.json({ ...now, due: due.length, sent, retired, skipped });
}
