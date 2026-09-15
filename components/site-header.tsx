import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { PantryMark } from "@/components/pantry-mark";
import { Segmented } from "@/components/ui/segmented";
import { getKitchensFor } from "@/lib/kitchens";
import { currentKitchen } from "@/lib/session";
import { isAdmin } from "@/lib/reports";
import { unreadCount } from "@/lib/notifications";
import { Bell } from "lucide-react";

/**
 * Three, matching the tab bar: the shelf moved under Tonight, so Stock is no
 * longer somewhere you go. /pantry still holds the list and the groupings and
 * is reached from the shelf.
 */
const tabs = [
  // First because it is the question the app is for. Discover is browsing;
  // this is the answer.
  { href: "/tonight", key: "tonight", label: "Tonight" },
  { href: "/recipes", key: "recipes", label: "Cookbook" },
  { href: "/discover", key: "discover", label: "Discover" },
] as const;

/**
 * Header from artboards 2a/2b. The nav renders as a segmented control on
 * mobile (muted track, white active pill) and as standalone pills on desktop
 * (dark active pill), matching the two artboards.
 *
 * Everything that isn't navigation sits in one menu on the right.
 *
 * **The sections are not here on a phone.** They moved to a bar along the
 * bottom, where a thumb is - see components/bottom-nav.tsx. What is left up
 * here on a phone is identity and context: which kitchen you are in, and how
 * much is in it. A desktop keeps the tabs, because a pointer has no reach
 * problem and a wide screen has room to spare at the top.
 */
export async function SiteHeader({
  active,
  meta,
}: {
  /** "none" for the pages that are not one of the four sections. */
  active: "stock" | "tonight" | "recipes" | "discover" | "none";
  meta?: string;
}) {
  // Reached through the Basic-auth back door there is no account and so no
  // kitchen; the header still has to render.
  const context = await currentKitchen();
  const [kitchens, admin, unread] = context.ok
    ? await Promise.all([
        getKitchensFor(context.user.id),
        isAdmin(context.user.id),
        unreadCount(context.user.id),
      ])
    : [[], false, 0];

  return (
    /*
      The header owns the status bar in an installed app.

      With viewport-fit=cover the web view runs edge to edge, so without this
      padding the clock sits on top of the kitchen name - and with the padding
      on the page instead, the strip behind the clock is page-coloured and the
      app looks like it starts an inch down the screen. Zero in a browser,
      where the inset is zero.
    */
    <header
      // Named so the page can slide underneath it without it sliding too - see
      // the view-transition rules in globals.css.
      data-site-header
      /*
        relative z-50 because of data-site-header, not in spite of it.

        The view-transition-name that keeps this still during a page slide also
        makes it a stacking context - so the account dropdown's own z-50 became
        relative to the header rather than to the page, and the header itself
        had no z-index at all. Everything rendered after it drew on top: cards,
        sticky bars, the tab bar. The menu was not behind them by one layer, it
        was in a different conversation about layers.
      */
      className="relative z-50 border-b border-border bg-surface-raised pt-[env(safe-area-inset-top)] print:hidden"
    >
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-9 sm:py-5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-7">
          {/* The logo is Home, and Home is /tonight now - what to cook is
              the question this app answers first; the shelves are a place
              you go to on purpose, from the tab bar. */}
          <Link
            href="/tonight"
            className="flex shrink-0 items-center gap-2 text-[22px] font-extrabold tracking-[-0.02em]"
          >
            <PantryMark className="h-[26px] w-[23px] text-primary" />
            {/* The wordmark is the first thing to go when space is tight - the
                mark alone still says where you are. */}
            <span className="hidden lg:inline">Pantry</span>
          </Link>

          <nav className="hidden min-w-0 sm:block">
            <Segmented
              label="Sections"
              active={active}
              // Sections, not filters: these go somewhere, so they slide.
              options={tabs.map((tab) => ({
                key: tab.key,
                label: tab.label,
                href: tab.href,
              }))}
            />
          </nav>

          {/* The phone gets the count instead, which the tabs were crowding
              out - it was desktop-only before, which is backwards: knowing
              there are 29 items matters most on the screen that can only show
              eight of them. */}
          {meta && (
            <span className="truncate text-sm font-semibold text-muted-foreground sm:hidden">
              {meta}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {meta && (
            <div className="hidden text-sm font-semibold text-muted-foreground lg:block">
              {meta}
            </div>
          )}
          {/*
            The only bell in the app, and it stays that way.

            Five phases were spent deliberately not having one - a thing with
            unread items in it is a thing to keep up with, and keeping up with
            something does not help anybody decide what to have for dinner. It
            is here for one kind of news: somebody cooked a recipe you wrote.
            That is the single thing in this app done for other people, and the
            only one you could never find out about otherwise.

            Hidden entirely at zero rather than shown empty. A bell with
            nothing behind it is an invitation to check it, which is the habit
            this app has spent five phases not building.
          */}
          {unread > 0 && (
            <Link
              href="/notifications"
              aria-label={`${unread} new ${unread === 1 ? "thing" : "things"}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-chip text-foreground"
            >
              <Bell className="h-4 w-4" strokeWidth={2.6} />
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-primary-foreground tabular-nums">
                {unread > 9 ? "9+" : unread}
              </span>
            </Link>
          )}
          <AccountMenu
            current={context.ok ? context.kitchen : null}
            kitchens={kitchens}
            handle={context.ok ? context.user.handle : null}
            isAdmin={admin}
          />
        </div>
      </div>
    </header>
  );
}
