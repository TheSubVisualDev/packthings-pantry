"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Every internal link in the app, animated, from one place.
 *
 * This started as a wrapper component that links had to opt into, which meant
 * the four nav tabs slid and the other two hundred links in the app cut - and
 * "some navigations are animated" is worse than none, because the ones that
 * are not read as broken rather than as plain.
 *
 * So it listens once, in the capture phase, and decides for itself. Anything
 * it does not recognise falls through to the browser untouched, which is the
 * important half: a link that fails to animate is a link, and a link that
 * fails to navigate is a bug.
 *
 * React has a `<ViewTransition>` component for this and it is not usable here
 * - it ships in the canary the App Router runs internally, not in the React an
 * app imports, so it type-checks as absent and fires nothing. This drives
 * document.startViewTransition directly, which is the same machinery without
 * putting a canary React into production.
 */

/** The tab bar, left to right. Moving along it is a sideways move. */
const SECTIONS = ["/pantry", "/tonight", "/recipes", "/discover"];

const sectionOf = (path: string) =>
  SECTIONS.findIndex((section) => path.startsWith(section));

const depthOf = (path: string) => path.split("/").filter(Boolean).length;

/**
 * Which way this navigation moves.
 *
 * Along the bar is sideways. Anything else is depth: an item or a recipe is a
 * thing you open ON TOP of the list you found it in, and going back puts it
 * down again. Those are different gestures and reading them as one is why
 * every navigation used to feel identical.
 */
export function directionBetween(from: string, to: string): string {
  const leaving = sectionOf(from);
  const going = sectionOf(to);

  if (leaving !== -1 && going !== -1 && leaving !== going) {
    return going > leaving ? "forward" : "back";
  }

  const deeper = depthOf(to) - depthOf(from);
  if (deeper > 0) return "in";
  if (deeper < 0) return "out";
  return "none";
}

export function NavTransitions() {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * The transition still waiting for the page to arrive.
   *
   * startViewTransition takes the before picture, runs the callback, and takes
   * the after picture when whatever it returned settles. router.push returns
   * undefined, so without this it settled immediately and photographed a page
   * that had not changed - one frame animated to itself, and the real
   * navigation happening outside the transition afterwards.
   */
  const arrived = useRef<(() => void) | null>(null);

  useEffect(() => {
    arrived.current?.();
    arrived.current = null;
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Everything that means "not a plain left click": a new tab, a
      // middle click, a modifier held. The browser does those better.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const link = (event.target as HTMLElement | null)?.closest?.("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      // Not ours to take: new windows, downloads, anything off-site, and the
      // mailto/tel schemes that are not navigation at all.
      if (
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.dataset.noSlide !== undefined ||
        !href.startsWith("/")
      ) {
        return;
      }

      const to = new URL(href, location.href);
      if (to.origin !== location.origin) return;
      // Same page, different anchor: that is a scroll, not a navigation.
      if (to.pathname === location.pathname && to.hash) return;

      /**
       * A filter is not a navigation.
       *
       * Same path, different query string: the group-by, a shop filter, a
       * search. Nothing is being gone to, so there is nothing to animate at
       * the page level - and a view transition here is actively harmful,
       * because it freezes the DOM while it swaps and the pill that IS
       * worth watching gets replaced by a snapshot instead of moving.
       *
       * Left to the ordinary navigation, which lets Motion animate the pill
       * from wherever it currently is - and unlike a view transition, that
       * can be interrupted halfway and redirected.
       */
      if (to.pathname === location.pathname) return;

      if (
        !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return; // Let the Link do what it always did.
      }

      event.preventDefault();

      const target = to.pathname + to.search;
      document.documentElement.dataset.navDir = directionBetween(
        location.pathname,
        to.pathname,
      );

      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            arrived.current = resolve;
            router.push(target);

            /**
             * A page that never arrives must not freeze the one you can see.
             *
             * Everything is held still while the callback is pending - that is
             * how the API works - so a slow route with no ceiling is a frozen
             * app. Past this it finishes with whatever has rendered, which is
             * an ordinary un-animated navigation and no worse than not having
             * tried.
             */
            setTimeout(() => {
              if (!arrived.current) return;
              arrived.current = null;
              resolve();
            }, 600);
          }),
      );

      transition.finished.finally(() => {
        delete document.documentElement.dataset.navDir;
      });
    }

    // Capture, so this runs before any component's own handler and a link that
    // wants to do something else can still preventDefault and be left alone.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
