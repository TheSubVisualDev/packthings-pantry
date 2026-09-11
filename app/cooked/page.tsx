import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getCookedLog, getNeglected } from "@/lib/queries";
import { shortDate } from "@/lib/dates";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cooked · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

/**
 * What this kitchen has cooked, and what it has been ignoring.
 *
 * The two halves are the same question from opposite ends - what gets used, and
 * what does not - so they share a page rather than hiding from each other in
 * separate corners of the app.
 */
export default async function CookedPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fcooked");
  if (!context.kitchen) redirect("/kitchens?need=stock");

  const [log, neglected] = await Promise.all([
    getCookedLog(context.kitchen.id),
    getNeglected(context.kitchen.id, context.user.id),
  ]);

  return (
    <>
      <SiteHeader active="recipes" meta={`${log.length} cooks`} />

      <main className="mx-auto w-full max-w-[640px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/recipes"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Recipes
        </Link>
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Cooked
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          Everything {context.kitchen.name} has made.
        </p>

        {neglected.length > 0 && (
          <section className={`${CARD} mb-5`}>
            <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
              Not touched in a while
            </h2>
            <ul className="mt-3 space-y-3">
              {neglected.map((item) => (
                <li
                  key={item.id}
                  className="border-t border-border pt-3 first:border-0 first:pt-0"
                >
                  <Link
                    href={`/pantry/item/${item.id}`}
                    className="flex items-baseline justify-between gap-3 text-sm font-bold hover:underline"
                  >
                    <span className="min-w-0 break-words">{item.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                      {item.idle_days}d
                    </span>
                  </Link>
                  {item.recipes.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {item.recipes.map((recipe) => (
                        <li key={recipe.id}>
                          <Link
                            href={`/recipes/${recipe.id}`}
                            className="flex items-baseline justify-between gap-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                          >
                            <span className="min-w-0 break-words">→ {recipe.name}</span>
                            <span className="shrink-0 tabular-nums">
                              {recipe.have}/{recipe.total}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {log.length === 0 ? (
          <p className={`${CARD} text-sm font-semibold text-muted-foreground`}>
            Nothing cooked yet. Open a recipe and press Cook, and it lands here.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="border-b border-border last:border-b-0"
              >
                <Link
                  href={`/recipes/${entry.recipe_id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-3.5 hover:bg-chip"
                >
                  <span className="min-w-0 font-bold break-words">
                    {entry.recipe_name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                    {shortDate(entry.cooked_at)}
                  </span>
                  <span className="w-full text-xs font-semibold text-muted-foreground">
                    for {entry.servings}
                    {entry.cooked_by_name ? ` · ${entry.cooked_by_name}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
