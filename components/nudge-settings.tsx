"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { BellOff, BellRing, Send } from "lucide-react";
import {
  moveNudge,
  startNudges,
  stopNudges,
  testNudge,
  type PushResult,
} from "@/app/settings/push-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The hour is the app's, not yours.
 *
 * It was a picker. Vercel's Hobby plan runs a cron once a day and no more, so
 * the day is what somebody chooses and the time is fixed at early evening - and
 * a picker whose value is quietly ignored is worse than no picker at all. The
 * column is still there, so this becomes a select again the day the cron can
 * run hourly.
 */
const FIXED_HOUR = 18;


/** Nothing to subscribe to: none of this changes while the page is open. */
function subscribeToNothing(): () => void {
  return () => {};
}

interface Capability {
  /** The APIs are present at all. */
  supported: boolean;
  /**
   * Only meaningful on iOS, where push is delivered to a site added to the
   * home screen and to nothing else. A Safari tab can be granted permission
   * and will simply never receive anything, which is the most confusing of the
   * four ways this can be silently off.
   */
  installed: boolean;
  denied: boolean;
}

/**
 * Computed once and cached.
 *
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * object on every read is an infinite render loop.
 */
let cached: Capability | null = null;

function readCapability(): Capability {
  if (cached) return cached;

  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  /**
   * iOS, including the iPads that will not admit to it.
   *
   * iPadOS 13 onwards reports itself as "Macintosh" in the user agent, so the
   * obvious test misses every iPad - and an iPad is exactly a device where
   * this matters, because Safari there needs the same add-to-home-screen step
   * an iPhone does. A Mac has no touch points; an iPad has five.
   */
  const iOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag, which is the only reliable one on iOS.
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  cached = {
    supported,
    installed: !iOS || standalone,
    denied: supported && Notification.permission === "denied",
  };
  return cached;
}

/**
 * Turning the weekly nudge on, and saying when.
 *
 * This is the only notification the app sends, and it is off until somebody
 * turns it on - an app that starts pushing because you signed up has decided
 * something that was not its to decide.
 *
 * The four separate ways push can be silently off are the whole design problem
 * here: permission refused, no service worker, an iPhone not added to the home
 * screen, and keys missing on the server. None announces itself, and a switch
 * that flips to "on" while nothing will ever arrive is worse than no switch.
 * So every state is named, and there is a Send one now button so nobody has to
 * wait until Sunday to find out which one they are in.
 */
export function NudgeSettings({
  configured,
  current,
}: {
  /** Whether the server has VAPID keys at all. */
  configured: boolean;
  current: { day: number; hour: number } | null;
}) {
  const [when, setWhen] = useState(current ?? { day: 0, hour: FIXED_HOUR });
  const [on, setOn] = useState(current !== null);
  const [result, setResult] = useState<PushResult | null>(null);
  const [pending, startWorking] = useTransition();

  /**
   * What this browser can actually do.
   *
   * Read through useSyncExternalStore rather than set in an effect: these are
   * facts about the environment, not state this component owns, and the server
   * genuinely cannot know them - so the server snapshot is null and the first
   * client render has the real answer. Setting them in an effect would render
   * twice to learn something that was true before the first render.
   */
  const capability = useSyncExternalStore(
    subscribeToNothing,
    readCapability,
    () => null,
  );

  /**
   * Whether the browser has been told no.
   *
   * Separate from the capability because it is the one that changes while the
   * page is open - asking for permission and being refused happens in a click
   * handler, which is exactly where setting state is right.
   */
  const [refused, setRefused] = useState(false);
  const supported = capability?.supported ?? null;
  const installed = capability?.installed ?? true;
  const denied = refused || (capability?.denied ?? false);

  async function turnOn() {
    setResult(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setRefused(permission === "denied");
        setResult({
          ok: false,
          error:
            permission === "denied"
              ? "Notifications are blocked for this site in your browser settings."
              : "Not allowed, so nothing will be sent.",
        });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // The only option any browser accepts. A push you cannot see is not a
        // thing this app has any business sending.
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_KEY,
      });

      startWorking(async () => {
        const done = await startNudges(
          subscription.toJSON(),
          navigator.userAgent,
          when,
        );
        setResult(done);
        if (done.ok) setOn(true);
      });
    } catch (error) {
      setResult({
        ok: false,
        error:
          error instanceof Error
            ? `Could not subscribe: ${error.message}`
            : "Could not subscribe.",
      });
    }
  }

  function turnOff() {
    setResult(null);
    startWorking(async () => {
      let endpoint: string | undefined;
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          endpoint = subscription.endpoint;
          // Told to the browser as well as to us. A subscription left live on
          // the device is one the push service keeps honouring.
          await subscription.unsubscribe();
        }
      } catch {
        // The server row is what matters; a browser that will not tell us is
        // not a reason to leave the reminder switched on.
      }

      const done = await stopNudges(endpoint);
      setResult(done);
      if (done.ok) setOn(false);
    });
  }

  function move(next: { day: number; hour: number }) {
    setWhen(next);
    if (!on) return;
    startWorking(async () => setResult(await moveNudge(next)));
  }

  if (!configured) {
    return (
      <p className="text-sm font-semibold text-muted-foreground">
        Notifications are not set up on this deployment.
      </p>
    );
  }

  if (supported === false) {
    return (
      <p className="text-sm font-semibold text-muted-foreground">
        This browser cannot do notifications.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">
        One notification, on the day you choose, asking whether next week has
        anything in it. Nothing else is ever sent.
      </p>

      {!installed && (
        /* The confusing one. On iOS a Safari tab can be granted permission and
           will still never receive anything; only a site added to the home
           screen gets push. Said before the switch rather than after it fails. */
        <p className="mt-3 rounded-[12px] bg-chip p-3 text-xs font-semibold text-muted-foreground">
          On an iPhone this only works once the pantry is added to your home
          screen — Share, then Add to Home Screen. Turning it on in a Safari tab
          will look like it worked and nothing will arrive.
        </p>
      )}

      {denied && (
        <p className="mt-3 rounded-[12px] bg-chip p-3 text-xs font-semibold text-muted-foreground">
          Notifications are blocked for this site. That has to be undone in the
          browser&apos;s own settings — this switch cannot ask again.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="nudge-day">
          Which day
        </label>
        <select
          id="nudge-day"
          value={when.day}
          onChange={(event) => move({ ...when, day: Number(event.target.value) })}
          className="h-11 rounded-[12px] border border-border bg-page px-3 font-semibold outline-none focus:border-primary"
        >
          {DAYS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </select>

        <span className="text-sm font-semibold text-muted-foreground">
          early evening
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={on ? turnOff : turnOn}
          disabled={pending || denied}
          className={`flex h-11 items-center gap-2 rounded-[12px] px-4 text-sm font-extrabold disabled:opacity-40 ${
            on
              ? "bg-chip text-muted-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {on ? (
            <BellOff className="h-4 w-4" strokeWidth={2.8} />
          ) : (
            <BellRing className="h-4 w-4" strokeWidth={2.8} />
          )}
          {pending ? "…" : on ? "Turn nudges off" : "Nudge me"}
        </button>

        {on && (
          <button
            type="button"
            onClick={() => startWorking(async () => setResult(await testNudge()))}
            disabled={pending}
            className="flex h-11 items-center gap-2 rounded-[12px] bg-card px-4 text-sm font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.05)] disabled:opacity-40"
          >
            <Send className="h-4 w-4" strokeWidth={2.8} />
            Send one now
          </button>
        )}
      </div>

      {on && (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          {DAYS[when.day]}s, early evening, UK time.
        </p>
      )}

      {result?.message && (
        <p className="mt-2 text-xs font-bold text-primary">{result.message}</p>
      )}
      {result && !result.ok && result.error && (
        <p role="alert" className="mt-2 text-xs font-bold text-destructive">
          {result.error}
        </p>
      )}
    </div>
  );
}
