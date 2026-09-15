"use client";

import { useEffect } from "react";

/**
 * Counts taps, from one place, the way NavTransitions animates links.
 *
 * The alternative was an onClick on every button that wanted counting, and
 * that decays: the handler gets dropped in a refactor, the button keeps
 * working, and the count silently goes to zero - which reads in the report as
 * "nobody uses this" and is the worst possible failure for a thing whose only
 * job is to inform decisions. A `data-track` attribute travels with the markup
 * instead, and one listener on the document reads it.
 *
 * Marking a button up is one attribute:
 *
 *     <button data-track="shopping.add">Add to list</button>
 *
 * The name must be in ACTIONS in lib/usage.ts or the server drops it. That is
 * deliberate - see the note there about why a free string makes the counts
 * incomparable - but it does mean a typo here is silent, which is what
 * `npm run check:usage` exists to catch.
 *
 * Renders nothing.
 */

/**
 * Taps waiting to be sent.
 *
 * Module scope rather than a ref, because the flush below can be triggered by
 * a page hide that is also unmounting this component, and a ref is gone by
 * then. There is exactly one tracker in the tree, so one buffer is right.
 */
let pending: { action: string; page: string }[] = [];

/**
 * Why this is not a fetch per tap.
 *
 * A tap is usually the last thing that happens on a page - press the button,
 * the page navigates - and a fetch still in flight when a document goes away
 * is cancelled by the browser. Beacons are the exception: the browser owns
 * them and delivers them after the page is gone. So taps accumulate and go out
 * on the way out, which is also one request instead of twelve.
 */
function flush() {
  if (pending.length === 0) return;
  const body = JSON.stringify({ events: pending });
  pending = [];

  try {
    if (navigator.sendBeacon) {
      // A Blob rather than the string, so the request carries a JSON
      // content-type. sendBeacon with a bare string sends text/plain, and
      // request.json() on the route is then reading a body whose type says it
      // is not JSON - which works today and is exactly the kind of thing that
      // stops working behind a proxy.
      navigator.sendBeacon(
        "/api/usage",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A count is not worth an error in the console of somebody cooking.
  }
}

/**
 * A ceiling on the buffer.
 *
 * A page nobody navigates away from - the shopping list, in a shop, being
 * ticked for twenty minutes - would otherwise hold every tap until it was
 * closed, and lose the lot if the phone killed the tab. Fifty is also what the
 * route accepts in one body.
 */
const MAX_PENDING = 50;

/**
 * For the things that are not clicks.
 *
 * A swipe is a drag that commits, and a search is a form submitting - neither
 * fires a click on anything carrying an attribute, so those call this. Same
 * buffer and same flush as the delegated listener, so there is still one
 * definition of how a tap gets off the device.
 *
 * Safe on the server and safe before hydration: it checks for a document
 * rather than assuming one, because a component that calls this may render in
 * both places.
 */
export function track(action: string, page?: string) {
  if (typeof document === "undefined") return;
  pending.push({ action, page: page ?? location.pathname });
  if (pending.length >= MAX_PENDING) flush();
}

export function UsageTracker() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.(
        "[data-track]",
      );
      if (!target) return;

      const action = (target as HTMLElement).dataset.track;
      if (!action) return;

      pending.push({ action, page: location.pathname });
      if (pending.length >= MAX_PENDING) flush();
    }

    /**
     * Bubble, and never preventDefault.
     *
     * This handler must be incapable of affecting the click it is watching.
     * NavTransitions learned that the capture phase runs before every
     * component handler and can take a click that meant something else; there
     * is no version of counting a tap that is worth that, so this one listens
     * last and only reads.
     */
    document.addEventListener("click", onClick);

    /**
     * `visibilitychange` to hidden, not `unload` or `beforeunload`.
     *
     * Those two do not fire reliably on iOS - a tab backgrounded from the app
     * switcher, or killed for memory, skips them - and iOS is what this app is
     * used on. Hidden is the last event a page is guaranteed to get, and it
     * also covers the case that matters here: the phone going in a pocket
     * mid-shop, which is not a navigation at all.
     */
    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return null;
}
