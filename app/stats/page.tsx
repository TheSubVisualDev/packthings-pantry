import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { RankedBars } from "@/components/ranked-bars";
import { currentKitchen } from "@/lib/session";
import { shortDate } from "@/lib/dates";
import {
  getCookTotals,
  getCookedRecipes,
  getCuisines,
  getPastItsDate,
  getSpend,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your kitchen · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";
const LABEL = "text-xs font-bold uppercase tracking-[0.1em] text-label";

/**
 * What this kitchen has actually done - phase 5's P5.
 *
 * Everything on this page is read from rows the app has been writing since
 * phase 1 and never showing back. Two rules from the roadmap, both kept:
 * every number leads to the thing it counts, and nothing appears that needs
 * more data than this kitchen has. A page of zeroes in month one is worse
 * than a page that arrives in month three, so the sections that have nothing
 * to say are simply not here.
 */
export default async function StatsPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fstats");
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const [totals, cooked, cuisines, pastIts, spend] = await Promise.all([
    getCookTotals(kitchen.id),
    getCookedRecipes(kitchen.id),
    getCuisines(kitchen.id),
    getPastItsDate(kitchen.id),
    getSpend(kitchen.id),
  ]);

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
          {kitchen.name}
        </h1>
        <p className="mt-1 mb-6 text-sm font-semibold text-muted-foreground">
          {totals.cooks > 0
            ? `Since ${shortDate(totals.firstAt)}, read off what you have cooked and bought.`
            : "It fills in as you cook."}
        </p>

        {totals.cooks === 0 ? (
          <div className={`${CARD} text-center`}>
            <p className="text-sm font-semibold text-muted-foreground">
              Nothing to count yet. Cooking a recipe writes what came off the
              shelves, and this page is made of that.
            </p>
            <Link
              href="/tonight"
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              Find something to cook
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* A KPI row rather than a chart: four single values with no
                shape to compare. The link under each is the rule about
                clicking through, applied to the headline. */}
            <section className={CARD}>
              <h2 className={LABEL}>How much cooking</h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Figure value={totals.cooks} label="cooks" href="/cooked" />
                <Figure value={totals.nights} label="evenings" href="/cooked" />
                <Figure value={totals.recipes} label="recipes" href="/recipes" />
                <Figure
                  value={totals.onceOnly}
                  label="made once"
                  href="/recipes"
                  quiet
                />
              </div>
            </section>

            {cooked.length > 0 && (
              <section className={CARD}>
                <h2 className={LABEL}>What you actually cook</h2>
                <div className="mt-3">
                  <RankedBars
                    rows={cooked.map((recipe) => ({
                      key: String(recipe.recipe_id),
                      label: recipe.name,
                      value: recipe.times,
                      href: `/recipes/${recipe.recipe_id}`,
                      meta: `last ${shortDate(recipe.last_at)}`,
                    }))}
                    unit="cooks"
                  />
                </div>
              </section>
            )}

            {cuisines.length > 0 && (
              <section className={CARD}>
                <h2 className={LABEL}>What kind of food</h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Counted by cooks rather than by recipes: nine Thai recipes you
                  never make say less than one Korean stew every fortnight.
                </p>
                <div className="mt-3">
                  <RankedBars
                    rows={cuisines.map((slice) => ({
                      key: slice.tag,
                      label: slice.tag,
                      value: slice.times,
                      href: `/recipes?tag=${encodeURIComponent(slice.tag)}`,
                    }))}
                    unit="cooks"
                  />
                </div>
              </section>
            )}

            {pastIts.length > 0 && (
              <section className={CARD}>
                <h2 className={LABEL}>Went past its date</h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Still on the shelf with the date gone. Either it is about to be
                  thrown out, or the number needs correcting - both worth a look.
                </p>
                <ul className="mt-3 divide-y divide-border">
                  {pastIts.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/pantry/item/${item.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 hover:text-primary"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">
                          {item.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs font-bold text-destructive">
                          {item.daysOver}d over
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {spend && (
              <section className={CARD}>
                <h2 className={LABEL}>What the receipts came to</h2>
                <p className="mt-3 text-[30px] font-extrabold tracking-[-0.02em]">
                  £{(spend.pence / 100).toFixed(2)}
                </p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  {spend.lines} {spend.lines === 1 ? "line" : "lines"} read off
                  receipts since {shortDate(spend.since)}. Only what has been
                  scanned - nothing here is typed in.
                </p>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}

/** One headline number, and the screen that can prove it. */
function Figure({
  value,
  label,
  href,
  quiet = false,
}: {
  value: number;
  label: string;
  href: string;
  quiet?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <span
        className={`block text-[30px] leading-none font-extrabold tracking-[-0.02em] tabular-nums ${
          quiet ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </span>
      <span className="mt-1 block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
    </Link>
  );
}
