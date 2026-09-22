"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

/**
 * A back link that goes back.
 *
 * Every page used to name one fixed place: the item page's "← The shelf" went
 * to /tonight whichever list you opened the item from. Tap Dark soy sauce
 * halfway down /pantry, press back, and you were on a different screen at the
 * top of it, with your place gone - the one thing a back link exists to keep.
 *
 * So when this page was reached by a link inside the app, it is a real
 * history step, named for where it returns to. Arrive any other way - a fresh
 * tab, a reload, a shared link, or the browser's own back button, after which
 * nobody can say what is behind you - and it is the fixed link it always was,
 * so the label and the destination never disagree.
 */
export function BackLink({
  href,
  label,
  className,
  icon,
}: {
  /** Where to go when there is no in-app step to go back to. */
  href: string;
  /** What that fixed place is called: "The shelf", "Cookbook". */
  label: string;
  className?: string;
  /** An icon-only back button, like the recipe photo's. Labelled for readers. */
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  const here = usePathname();
  const from = useSyncExternalStore(subscribe, () => cameFrom, () => null);

  const fromPath = from?.split("?")[0] ?? null;
  const goesBack = from !== null && fromPath !== here;
  const name = goesBack ? (nameFor(fromPath!) ?? "Back") : label;

  return (
    <Link
      href={goesBack ? from : href}
      aria-label={icon ? `Back to ${name.toLowerCase()}` : undefined}
      onClick={(event) => {
        if (!goesBack) return;
        // A real step back restores the scroll position and whatever the list
        // was filtered to. A push to the same URL would do neither.
        event.preventDefault();
        router.back();
      }}
      className={className}
    >
      {icon ?? `← ${name}`}
    </Link>
  );
}

/**
 * Where the last in-app link was pressed from, set by NavTransitions.
 *
 * Module state rather than sessionStorage on purpose: it dies with the page,
 * which is exactly when it stops being true.
 */
let cameFrom: string | null = null;
let headedTo: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(from: string | null) {
  cameFrom = from;
  listeners.forEach((listener) => listener());
}

/** A link inside the app was pressed, from one page towards another. */
export function noteDeparture(from: string, to: string) {
  headedTo = to;
  set(from);
}

/** The browser moved through history on its own, so nothing is known. */
export function forgetDeparture() {
  headedTo = null;
  set(null);
}

/**
 * The page changed. Only the arrival the last click asked for keeps its
 * "came from": a save that redirects, or a link the server bounced
 * somewhere else, leaves a history entry nobody chose, and going back to it
 * under the old label would be the lie this component exists to stop.
 */
export function noteArrival(path: string) {
  const expected = headedTo;
  headedTo = null;
  if (expected !== path && cameFrom !== null) set(null);
}

/** What each place is called, matching the tab bar where there is a tab. */
export function nameFor(path: string): string | null {
  if (path === "/tonight" || path === "/") return "Tonight";
  if (path === "/pantry") return "The shelf";
  if (path === "/pantry/list") return "Shopping";
  if (path === "/pantry/expiring") return "Expiring soon";
  if (path === "/pantry/adjust") return "Quick adjust";
  if (path === "/pantry/receipt") return "The receipt";
  if (path === "/recipes") return "Cookbook";
  if (/^\/recipes\/\d+$/.test(path)) return "The recipe";
  if (path === "/plan") return "The week";
  if (path === "/discover") return "Discover";
  if (path === "/cooked") return "Cooked";
  if (path === "/people") return "People";
  if (path === "/stats") return "Stats";
  if (path === "/notifications") return "News";
  if (path === "/kitchens") return "Your kitchen";
  if (path === "/settings") return "Settings";
  return null;
}
