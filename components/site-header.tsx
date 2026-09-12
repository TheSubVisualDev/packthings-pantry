import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { PantryMark } from "@/components/pantry-mark";
import { Segmented } from "@/components/ui/segmented";
import { getKitchensFor } from "@/lib/kitchens";
import { currentKitchen } from "@/lib/session";

const tabs = [
  { href: "/pantry", key: "stock", label: "Stock" },
  // First after Stock because it is the question the app is for. Discover is
  // browsing; this is the answer.
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
  active: "stock" | "tonight" | "recipes" | "discover";
  meta?: string;
}) {
  // Reached through the Basic-auth back door there is no account and so no
  // kitchen; the header still has to render.
  const context = await currentKitchen();
  const kitchens = context.ok ? await getKitchensFor(context.user.id) : [];

  return (
    <header className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-9 sm:py-5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-7">
          <Link
            href="/pantry"
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
          <AccountMenu
            current={context.ok ? context.kitchen : null}
            kitchens={kitchens}
            handle={context.ok ? context.user.handle : null}
          />
        </div>
      </div>
    </header>
  );
}
