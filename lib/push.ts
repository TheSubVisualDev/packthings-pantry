import webpush from "web-push";
import { getDb, plainRows } from "./db";

/**
 * Notifications, for the one thing worth interrupting somebody about.
 *
 * Which is: it is Sunday evening and the week ahead has nothing in it. That is
 * the only notification this app sends, and it is off until somebody turns it
 * on - an app that starts pushing because you signed up has decided something
 * that was not its to decide.
 *
 * Web push rather than email. The pantry is already a standalone PWA with a
 * scope and a manifest, which is what makes this work on an iPhone at all -
 * iOS only delivers push to a site added to the home screen, and only since
 * 16.4. Android and desktop take it straight from the browser.
 */

export interface PushSubscriptionRow {
  endpoint: string;
  user_id: number;
  p256dh: string;
  auth: string;
  agent: string | null;
  failed_at: string | null;
}

/** Whether the keys are even configured. Every caller checks; none assumes. */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Set once, lazily.
 *
 * web-push holds the VAPID details in module state, and calling this at import
 * time would run it during the build - where the env vars are not necessarily
 * there and a throw takes the whole build with it.
 */
let configured = false;
function ready(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:pantry@packthings.fyi",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

/** Records a device. The endpoint is the identity, so this is an upsert. */
export async function subscribe(
  userId: number,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  agent: string | null,
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, agent)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (endpoint) DO UPDATE SET
            user_id   = excluded.user_id,
            p256dh    = excluded.p256dh,
            auth      = excluded.auth,
            agent     = excluded.agent,
            -- Re-subscribing is a device saying it is alive again, so the old
            -- failure is cleared rather than kept against it for ever.
            failed_at = NULL`,
    args: [
      subscription.endpoint,
      userId,
      subscription.keys.p256dh,
      subscription.keys.auth,
      agent ? agent.slice(0, 200) : null,
    ],
  });
}

export async function unsubscribe(endpoint: string): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
    args: [endpoint],
  });
}

export async function devicesFor(userId: number): Promise<PushSubscriptionRow[]> {
  const result = await getDb().execute({
    sql: "SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at",
    args: [userId],
  });
  return plainRows<PushSubscriptionRow>(result);
}

export interface Nudge {
  title: string;
  body: string;
  /** Where tapping it goes. */
  url: string;
}

/**
 * Sends one notification to every device a person has.
 *
 * A dead endpoint is retired rather than retried. A subscription can stop
 * working without telling anybody - the browser drops it, the push service
 * expires it - and the only way to find out is to send and be told 404 or 410.
 * Anything else (a timeout, a 500 from the push service) is left alone, because
 * a service having a bad afternoon is not a reason to unsubscribe somebody's
 * phone.
 */
export async function nudge(
  userId: number,
  message: Nudge,
): Promise<{ sent: number; retired: number }> {
  if (!ready()) return { sent: 0, retired: 0 };

  const devices = (await devicesFor(userId)).filter(
    (device) => device.failed_at === null,
  );

  let sent = 0;
  let retired = 0;

  for (const device of devices) {
    try {
      await webpush.sendNotification(
        {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        JSON.stringify(message),
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await getDb().execute({
          sql: "UPDATE push_subscriptions SET failed_at = CURRENT_TIMESTAMP WHERE endpoint = ?",
          args: [device.endpoint],
        });
        retired += 1;
      }
      // Anything else is this afternoon's problem, not this device's.
    }
  }

  return { sent, retired };
}

/* -------------------------------------------------------------------------
   When to send
   ------------------------------------------------------------------------- */

/**
 * The day and hour it is in London, whatever the server thinks.
 *
 * This deploys to Frankfurt, which is an hour ahead, so a reminder set for
 * 18:00 on a Sunday would arrive at 17:00 without this - and twice a year the
 * gap changes. Asked of Intl rather than computed, because the only thing that
 * reliably knows when British Summer Time starts is the timezone database.
 */
export function londonNow(at: Date = new Date()): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(at);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  // Sunday is 0, matching Date.getDay, so a stored day means the same thing
  // wherever it is read.
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: Math.max(0, days.indexOf(weekday)), hour: hour % 24 };
}

export interface DueReminder {
  user_id: number;
  handle: string;
}

/**
 * Who is due a nudge today.
 *
 * Matched on the day alone, and not on the hour, because Vercel's Hobby plan
 * allows a cron to run once a day and no more. The run is fixed at 17:00 UTC -
 * early evening either side of the clock change - and the hour somebody picked
 * is kept but not honoured.
 *
 * The column stays because the design is right and the limit is not: on a plan
 * with hourly crons this becomes one extra AND. The UI says "early evening"
 * rather than offering a time it cannot keep, which is the half of this that
 * matters - a picker whose value is ignored is worse than no picker.
 *
 * Only people with a live device. Sending to nobody is work, and counting it
 * as sent would hide the fact that their phone stopped listening.
 */
export async function dueToday(at: Date = new Date()): Promise<DueReminder[]> {
  const { day } = londonNow(at);

  const result = await getDb().execute({
    sql: `SELECT DISTINCT u.id AS user_id, u.handle
          FROM users u
          JOIN push_subscriptions p ON p.user_id = u.id AND p.failed_at IS NULL
          WHERE u.reminder_day = ?`,
    args: [day],
  });
  return plainRows<DueReminder>(result);
}

/** Someone's reminder setting, or null for off. */
export async function getReminder(
  userId: number,
): Promise<{ day: number; hour: number } | null> {
  const result = await getDb().execute({
    sql: "SELECT reminder_day, reminder_hour FROM users WHERE id = ?",
    args: [userId],
  });
  const row = result.rows[0] as unknown as
    | { reminder_day: number | null; reminder_hour: number | null }
    | undefined;

  if (!row || row.reminder_day === null || row.reminder_hour === null) return null;
  return { day: row.reminder_day, hour: row.reminder_hour };
}

/** Null turns it off. */
export async function setReminder(
  userId: number,
  when: { day: number; hour: number } | null,
): Promise<void> {
  await getDb().execute({
    sql: "UPDATE users SET reminder_day = ?, reminder_hour = ? WHERE id = ?",
    args: [when?.day ?? null, when?.hour ?? null, userId],
  });
}
