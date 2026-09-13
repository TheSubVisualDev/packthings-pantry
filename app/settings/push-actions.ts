"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  nudge,
  pushConfigured,
  setReminder,
  subscribe,
  unsubscribe,
} from "@/lib/push";

export interface PushResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** A subscription as the browser hands it over, checked before it is trusted. */
function readSubscription(input: unknown): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;

  const endpoint = typeof raw.endpoint === "string" ? raw.endpoint : null;
  // Only somewhere a push service could actually be. An endpoint is a URL this
  // server will make a request to on a schedule, which is exactly the kind of
  // field not to take on trust.
  if (!endpoint || !endpoint.startsWith("https://") || endpoint.length > 1000) {
    return null;
  }

  const keys = raw.keys as Record<string, unknown> | undefined;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh : null;
  const auth = typeof keys?.auth === "string" ? keys.auth : null;
  if (!p256dh || !auth) return null;

  return { endpoint, keys: { p256dh, auth } };
}

export async function startNudges(
  subscription: unknown,
  agent: string,
  when: { day: number; hour: number },
): Promise<PushResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  if (!pushConfigured()) {
    return {
      ok: false,
      error: "Notifications are not set up on this deployment (VAPID keys).",
    };
  }

  const parsed = readSubscription(subscription);
  if (!parsed) return { ok: false, error: "That subscription did not look right." };

  const day = Number(when.day);
  const hour = Number(when.hour);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return { ok: false, error: "That is not a day of the week." };
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { ok: false, error: "That is not an hour." };
  }

  await subscribe(session.user.id, parsed, agent);
  await setReminder(session.user.id, { day, hour });

  revalidatePath("/settings");
  return { ok: true, message: "You will get a nudge to plan the week." };
}

/** Turns it off everywhere, and forgets this device. */
export async function stopNudges(endpoint?: string): Promise<PushResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  if (endpoint) await unsubscribe(endpoint);
  await setReminder(session.user.id, null);

  revalidatePath("/settings");
  return { ok: true, message: "Nudges off." };
}

/** Moves the day or hour without re-subscribing the device. */
export async function moveNudge(when: {
  day: number;
  hour: number;
}): Promise<PushResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const day = Number(when.day);
  const hour = Number(when.hour);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return { ok: false, error: "That is not a day of the week." };
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { ok: false, error: "That is not an hour." };
  }

  await setReminder(session.user.id, { day, hour });
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Sends one now, so somebody can find out whether this works.
 *
 * Worth a button of its own. Push has four separate ways to be silently off -
 * permission denied, the worker not registered, an iPhone not added to the
 * home screen, keys missing on the server - and none of them announces itself.
 * Waiting until Sunday to discover which is not a reasonable ask.
 */
export async function testNudge(): Promise<PushResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const { sent, retired } = await nudge(session.user.id, {
    title: "Pantry",
    body: "This is what a Sunday nudge looks like.",
    url: "/plan",
  });

  if (sent === 0) {
    return {
      ok: false,
      error:
        retired > 0
          ? "This device had stopped listening — turn nudges off and on again."
          : "Nothing to send to. Turn nudges on first.",
    };
  }
  return {
    ok: true,
    message: `Sent to ${sent} ${sent === 1 ? "device" : "devices"}.`,
  };
}
