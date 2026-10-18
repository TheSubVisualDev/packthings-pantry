import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Page, PageTitle } from "@/components/ui/page";
import { NewMealForm } from "@/components/meal-forms";
import { getMeals } from "@/lib/receipt-db";
import { MEAL_KINDS, MEAL_KIND_LABEL } from "@/lib/receipts";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meals · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

/**
 * The household's meals, as pseudorecipes.
 *
 * Grouped by kind because that is how the household talks about them - "a
 * batch cook this weekend" - and within a kind, most-tagged first, which is
 * the order getMeals already gives: the meal with the most behind it is the
 * one most worth opening.
 */
export default async function MealsPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fmeals");
  if (!context.kitchen) redirect("/kitchens");
  const { kitchen } = context;
  const canEdit = kitchen.role !== "viewer";

  const meals = await getMeals(kitchen.id);
  const groups = MEAL_KINDS.map((kind) => ({
    kind,
    meals: meals.filter((meal) => meal.kind === kind),
  })).filter((group) => group.meals.length > 0);

  return (
    <>
      <SiteHeader active="receipts" meta={meals.length > 0 ? `${meals.length} meals` : undefined} />
      <Page width="read">
        <PageTitle
          title="Meals"
          subtitle="A pseudorecipe is a moodboard of what goes into a dish, built from what gets bought for it."
        />

        <div className="space-y-3">
          {meals.length === 0 && (
            <p className="rounded-[16px] bg-chip p-4 text-sm font-semibold text-muted-foreground">
              No meals yet. Add one below, or tag a line on a{" "}
              <Link href="/receipts" className="font-bold text-primary underline underline-offset-2">
                receipt
              </Link>{" "}
              with a meal and it starts here.
            </p>
          )}

          {groups.map((group) => (
            <section key={group.kind} className={CARD}>
              <h2 className={LABEL}>{MEAL_KIND_LABEL[group.kind]}</h2>
              <ul className="mt-2 divide-y divide-border">
                {group.meals.map((meal) => (
                  <li key={meal.id}>
                    <Link
                      href={`/meals/${meal.id}`}
                      className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2 py-2.5 transition-colors hover:bg-chip"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-extrabold">{meal.name}</span>
                        {meal.recipe_name && (
                          <span className="block truncate text-xs font-semibold text-muted-foreground">
                            Recipe: {meal.recipe_name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                        {meal.lines === 0
                          ? "Nothing tagged"
                          : `${meal.lines} ${meal.lines === 1 ? "line" : "lines"}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {canEdit && (
            <section className={CARD}>
              <h2 className={LABEL}>Add a meal</h2>
              <div className="mt-3">
                <NewMealForm />
              </div>
            </section>
          )}
        </div>
      </Page>
    </>
  );
}
