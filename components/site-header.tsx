import Link from "next/link";
import { logout } from "@/app/login/actions";

const tabs = [
  { href: "/pantry", key: "stock", label: "Stock" },
  { href: "/recipes", key: "recipes", label: "Recipes" },
] as const;

/**
 * Header from artboards 2a/2b. The nav renders as a segmented control on
 * mobile (muted track, white active pill) and as standalone pills on desktop
 * (dark active pill), matching the two artboards.
 */
export function SiteHeader({
  active,
  meta,
}: {
  active: "stock" | "recipes";
  meta?: string;
}) {
  return (
    <header className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-5 py-4 sm:px-9 sm:py-5">
        <div className="flex items-center gap-4 sm:gap-7">
          <Link
            href="/pantry"
            className="text-[22px] font-extrabold tracking-[-0.02em]"
          >
            Pantry
          </Link>
          <nav className="flex gap-1.5 rounded-full bg-[oklch(0.93_0.02_60)] p-1 text-[13px] font-bold sm:gap-1 sm:bg-transparent sm:p-0 sm:text-[15px] sm:font-semibold">
            {tabs.map((tab) => {
              const isActive = tab.key === active;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "rounded-full bg-white px-3.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:bg-ink sm:px-4 sm:py-[7px] sm:text-background sm:shadow-none"
                      : "rounded-full px-3.5 py-1.5 text-muted-foreground sm:px-4 sm:py-[7px]"
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {meta && (
            <div className="hidden text-sm font-semibold text-muted-foreground sm:block">
              {meta}
            </div>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="text-[13px] font-semibold text-muted-foreground hover:text-foreground sm:text-sm"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
