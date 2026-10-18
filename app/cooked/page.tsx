import { displayTitle } from "@/lib/recipe-display";
import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { UndoCook } from "@/components/undo-cook";
import { getCookedLog } from "@/lib/queries";
import { shortDate } from "@/lib/dates";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cooked · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

/**
 * What this kitchen has cooked.
 *
 * It used to share the page with "not touched in a while" - stock nobody had
 * moved in a month, and what it was good for. That half read the shelves and
 * went with them in v2 (18 Oct 2026).
 */
export default async function CookedPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fcooked");
  if (!context.kitchen) redirect("/kitchens?need=cooked");

  const log = await getCookedLog(context.kitchen.id);

  return (
    <>
      <SiteHeader active="recipes" meta={`${log.length} cooks`} />

      <main className="mx-auto w-full max-w-[640px] px-5 py-7 pb-32 sm:px-9">
        <BackLink
          href="/recipes"
          label="Cookbook"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        />
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Cooked
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          Everything {context.kitchen.name} has made.
        </p>

        {log.length === 0 ? (
          /* Board 1p: an empty state offers the thing that fixes it. This one
             stated a fact and stopped, on the one page where the fix is a
             single tap away and the app already knows what to suggest. */
          <div className={`${CARD} text-center`}>
            <p className="text-sm font-semibold text-muted-foreground">
              Nothing cooked yet. Press &ldquo;Done&rdquo; on a recipe you
              made and it is written here.
            </p>
            <Link
              href="/plan"
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              Find something to cook
            </Link>
          </div>
        ) : (
          <ul className="stagger overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 border-b border-border pr-3 last:border-b-0"
              >
                <Link
                  href={`/recipes/${entry.recipe_id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-3.5 hover:bg-chip"
                >
                  <span className="min-w-0 font-bold break-words">
                    {displayTitle(entry.recipe_name)}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                    {shortDate(entry.cooked_at)}
                  </span>
                  <span className="w-full text-xs font-semibold text-muted-foreground">
                    for {entry.servings}
                    {entry.cooked_by_name ? ` · ${entry.cooked_by_name}` : ""}
                  </span>
                </Link>
                {/* Beside the row rather than inside the link, because a
                    button inside an anchor is a tap that means two things. */}
                {entry.undoable && (
                  <UndoCook id={entry.id} recipeName={entry.recipe_name} />
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
