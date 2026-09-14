"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";

/**
 * A link between sections that slides instead of cutting.
 *
 * React has a `<ViewTransition>` component that does this declaratively, and
 * the Next guide is written around it - but it only exists in the React canary
 * the App Router runs internally, not in the React an app imports. Wiring it up
 * against react 19.2.8 type-checks as absent, renders as nothing, and fires
 * zero transitions, which is exactly what happened on the first attempt.
 *
 * So this drives the browser API directly. `document.startViewTransition`
 * snapshots the page, runs the navigation, snapshots it again and animates
 * between the two - which is the same machinery React would have used, minus
 * the part that needs a canary in production on somebody's live app.
 *
 * Direction is written onto <html> first, because CSS is what animates and CSS
 * needs to know which way before the snapshot is taken.
 */

/** The bar, left to right. Direction is just which way along it you moved. */
export const SECTION_ORDER = ["/pantry", "/tonight", "/recipes", "/discover"];

function indexOf(path: string): number {
  return SECTION_ORDER.findIndex((section) => path.startsWith(section));
}

export function useSlideNav() {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * The half of the transition that is still waiting for the page to arrive.
   *
   * startViewTransition takes the "before" picture, runs the callback, and
   * takes the "after" picture when whatever the callback returned settles.
   * router.push returns undefined, so it settled immediately and the "after"
   * picture was of the page that had not changed yet - the browser animated
   * one frame to itself, and the real navigation then happened outside the
   * transition entirely. That is the flash, the settle, and the second flash,
   * in that order.
   *
   * So the callback returns a promise that is resolved by the effect below,
   * when the route has actually changed.
   */
  const arrived = useRef<(() => void) | null>(null);

  useEffect(() => {
    arrived.current?.();
    arrived.current = null;
  }, [pathname]);

  return (href: string, from: string) => {
    const going = indexOf(href);
    const leaving = indexOf(from);

    /**
     * Which way the content should move.
     *
     * Along the bar when both ends are sections; a plain rise when either is
     * not, because "deeper in" has no left or right and pretending otherwise
     * makes the app lurch sideways at random.
     */
    const direction =
      going === -1 || leaving === -1 || going === leaving
        ? "none"
        : going > leaving
          ? "forward"
          : "back";

    const navigate = () => router.push(href);

    // No support, or somebody has asked for less motion: just go. A navigation
    // that fails to animate is a navigation; one that fails to happen is a bug.
    if (
      typeof document === "undefined" ||
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      navigate();
      return;
    }

    document.documentElement.dataset.navDir = direction;

    const transition = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          arrived.current = resolve;
          navigate();

          /**
           * A page that never arrives must not freeze the one you can see.
           *
           * Everything is held still while the callback is pending - that is
           * how the API works - so a slow route with no ceiling on it is a
           * frozen app. Past this the transition finishes with whatever has
           * rendered, which is the ordinary un-animated navigation and no
           * worse than not having tried.
           */
          setTimeout(() => {
            if (!arrived.current) return;
            arrived.current = null;
            resolve();
          }, 600);
        }),
    );

    // Cleared once it has finished, or the next navigation inherits a
    // direction it did not ask for.
    transition.finished.finally(() => {
      delete document.documentElement.dataset.navDir;
    });
  };
}

/**
 * Link, but it slides. Everything else about it is Link's job - prefetching,
 * the href, the keyboard behaviour - so nothing here reimplements any of it.
 */
export function SlideLink({
  href,
  from,
  onClick,
  ...rest
}: ComponentProps<typeof Link> & { href: string; from: string }) {
  const slide = useSlideNav();

  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        // Everything that means "not a plain left click on this tab": a new
        // tab, a download, a modifier held. Left to the browser, which does
        // them better than any handler.
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        slide(href, from);
      }}
      {...rest}
    />
  );
}
