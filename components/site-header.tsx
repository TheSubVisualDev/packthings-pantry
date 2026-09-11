import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { PantryMark } from "@/components/pantry-mark";
import { getKitchensFor } from "@/lib/kitchens";
import { currentKitchen } from "@/lib/session";

const tabs = [
  { href: "/pantry", key: "stock", label: "Stock" },
  { href: "/recipes", key: "recipes", label: "Recipes" },
  { href: "/discover", key: "discover", label: "Discover" },
] as const;

/**
 * Header from artboards 2a/2b. The nav renders as a segmented control on
 * mobile (muted track, white active pill) and as standalone pills on desktop
 * (dark active pill), matching the two artboards.
 *
 * Everything that isn't navigation sits in one menu on the right. Three tabs, a
 * kitchen switcher, a settings link and a sign-out button did not fit on a
 * phone, and none of the last three is something you reach for often enough to
 * earn permanent space.
 */
export async function SiteHeader({
  active,
  meta,
}: {
  active: "stock" | "recipes" | "discover";
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
            <span className="hidden sm:inline">Pantry</span>
          </Link>

          <nav className="flex min-w-0 gap-0.5 rounded-full bg-[oklch(0.93_0.02_60)] p-1 text-[12.5px] font-bold sm:gap-1 sm:bg-transparent sm:p-0 sm:text-[15px] sm:font-semibold">
            {tabs.map((tab) => {
              const isActive = tab.key === active;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "rounded-full bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:bg-ink sm:px-4 sm:py-[7px] sm:text-background sm:shadow-none"
                      : "rounded-full px-2.5 py-1.5 text-muted-foreground sm:px-4 sm:py-[7px]"
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
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
