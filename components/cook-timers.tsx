"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlarmClock, Bell, X } from "lucide-react";
import { clock } from "@/lib/step-timers";

/**
 * Timers for a cook, several at once, which is the normal case rather than the
 * edge one - something is in the oven while something else reduces.
 *
 * **An end timestamp, never a counting number.** A phone locks, a tab goes to
 * the background, a page gets reloaded, and a decrementing counter is wrong
 * after all three. An absolute deadline survives every one of them: the only
 * thing stored is when the timer is due, and what to display is worked out
 * from the clock on each tick.
 *
 * localStorage rather than the database, for the same reason. A timer is about
 * this phone in this kitchen for the next twenty minutes; a deadline that
 * followed you to another device would be somebody else's toast.
 */

export interface CookTimer {
  id: string;
  label: string;
  /** Epoch milliseconds. The only thing stored. */
  endsAt: number;
}

const STORAGE_KEY = "pantry.timers.v1";

/** Rung timers linger this long before clearing themselves out of the way. */
const KEEP_RUNG_FOR_MS = 10 * 60 * 1000;

/**
 * localStorage as an external store, which is what it is.
 *
 * Read through useSyncExternalStore rather than copied into state by an
 * effect: it renders on the server too, where there is no localStorage and no
 * agreement about what the markup should say, and this is the shape React
 * provides for exactly that. The snapshot is the raw string so its identity is
 * stable between renders - parsing it every time would hand back a new array
 * each render and loop forever.
 *
 * The `storage` event comes free with it, so two tabs open on the same recipe
 * agree about what is running.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    // Private browsing, or storage switched off. Timers are a convenience and
    // none of that is worth an error.
    return "[]";
  }
}

/** The server has no timers, and must not guess at any. */
const EMPTY = "[]";

function parse(raw: string, now: number): CookTimer[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return (parsed as CookTimer[]).filter(
      (timer) =>
        typeof timer?.id === "string" &&
        typeof timer?.label === "string" &&
        typeof timer?.endsAt === "number" &&
        // One that went off while the app was closed has done its job and has
        // nothing left to say. Anything recent enough is still news.
        timer.endsAt > now - KEEP_RUNG_FOR_MS,
    );
  } catch {
    return [];
  }
}

function write(timers: CookTimer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch {
    // See readRaw. A timer that cannot be persisted still runs for this page.
  }
  notify();
}

export function useCookTimers() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => EMPTY);

  /**
   * The clock, moved on by an interval.
   *
   * Starts at zero so the first render is the same on the server and the
   * client, and is set from the real clock on the first frame. Every countdown
   * is derived from this rather than from Date.now() during render, which
   * would make rendering impure and the displayed time depend on when React
   * happened to run.
   */
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    // The first one on the next frame rather than inline, so the effect body
    // stays free of synchronous state updates.
    const frame = requestAnimationFrame(tick);
    const interval = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, []);

  // `now` is zero on the first render, which makes the staleness cutoff
  // permissive rather than wrong: everything stored shows for one frame and
  // the tray is hidden until the clock is real, so nothing is seen either way.
  const timers = useMemo(() => parse(raw, now), [raw, now]);

  /**
   * Which timers have already rung.
   *
   * A ref rather than state: it is a ledger of side effects, not something the
   * screen is derived from, and keeping it in state would re-render the page
   * every time an alarm went off for no visible reason. Keyed by id so a
   * reload cannot ring an alarm the kitchen already heard.
   */
  const rung = useRef(new Set<string>());

  useEffect(() => {
    for (const timer of timers) {
      if (timer.endsAt > Date.now() || rung.current.has(timer.id)) continue;
      rung.current.add(timer.id);

      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Timer done", { body: timer.label, tag: timer.id });
        }
      } catch {
        // Notifications are the nice-to-have half. The tray is the half that
        // has to work, and it does not depend on permission being given.
      }
    }
  }, [timers]);

  const start = useCallback(
    (label: string, seconds: number) => {
      // Permission is asked for when somebody starts a timer, which is the
      // only moment the request makes any sense to them.
      try {
        if ("Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } catch {
        // Some browsers throw on the synchronous form. Not worth caring about.
      }

      write([
        ...parse(readRaw(), Date.now()),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          endsAt: Date.now() + seconds * 1000,
        },
      ]);
    },
    [],
  );

  const stop = useCallback((id: string) => {
    write(parse(readRaw(), Date.now()).filter((timer) => timer.id !== id));
  }, []);

  return { timers, now, start, stop };
}

/**
 * The running timers, pinned where they can be seen without scrolling.
 *
 * A timer you have to go looking for is one that has already failed: the
 * method is long enough that the step which started it is usually off screen
 * by the time it matters.
 */
export function TimerTray({
  timers,
  now,
  onStop,
}: {
  timers: CookTimer[];
  /** The ticking clock, passed in so rendering stays pure. */
  now: number;
  onStop: (id: string) => void;
}) {
  // Hidden until the clock has been read, so no countdown is ever painted
  // from a placeholder - and so the server, which has neither, renders the
  // same nothing.
  if (timers.length === 0 || now === 0) return null;

  return (
    <div className="sticky top-0 z-30 -mx-5 mb-3 space-y-1.5 bg-surface px-5 py-2 sm:-mx-8 sm:px-8">
      {timers.map((timer) => {
        const left = Math.round((timer.endsAt - now) / 1000);
        const done = left <= 0;

        return (
          <div
            key={timer.id}
            className={`flex items-center gap-3 rounded-[14px] px-4 py-2.5 ${
              done
                ? "bg-primary text-primary-foreground"
                : "bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            }`}
          >
            {done ? (
              // Deliberately unmissable, because the notification may never
              // have been allowed and then this is the only thing that fires.
              <Bell className="h-4 w-4 shrink-0 animate-pulse" strokeWidth={3} />
            ) : (
              <AlarmClock className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
            )}

            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {timer.label}
            </span>

            <span className="shrink-0 text-sm font-extrabold tabular-nums">
              {done ? "done" : clock(left)}
            </span>

            <button
              type="button"
              onClick={() => onStop(timer.id)}
              aria-label={`Clear timer for ${timer.label}`}
              className="shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
