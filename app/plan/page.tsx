import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ShoppingBasket } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PrintButton } from "@/components/print-button";
import { WeekPlan, type Pickable } from "@/components/week-plan";
import { getCookbookRecipes, getRecipe } from "@/lib/queries";
import { perPortion, weekMacros } from "@/lib/recipe-nutrition";
import { WeekNutrition } from "@/components/week-nutrition";
import {
  addDays,
  getSlots,
  getWeek,
  isoDate,
  weekLabel,
  weekStart,
} from "@/lib/plan";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The week · Pantry",
};

/**
 * The week ahead.
 *
 * The pin this grew out of held one recipe - what you are shopping for right
 * now - and a tester asked for the whole week. It sat beside /tonight, which
 * answered "what do I cook in the next hour, given what is in". v2 stopped
 * tracking what is in (18 Oct 2026), Tonight went with it, and this became
 * one of the three tabs: "what are we eating, and what do I need to buy".
 *
 * Which week is in the URL, so a week is a link you can send to whoever else
 * is in the kitchen and the back button goes back a week.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fplan");
  // A plan is about a kitchen's week, so there is nothing to plan without one.
  if (!context.kitchen) redirect("/kitchens?need=plan");
  const { kitchen } = context;

  const { week } = await searchParams;

  /**
   * Today, as the server sees it.
   *
   * Which is Frankfurt, where this deploys. Close enough to London to be the
   * same day at every hour a person plans a week at, and the alternative -
   * reading the browser's clock and re-rendering - would make the first paint
   * of every week the wrong one.
   */
  const today = isoDate(new Date());

  // Normalised to a Monday whatever the query string says, so /plan?week=
  // pointing at a Thursday shows that Thursday's week rather than a week
  // running Thursday to Wednesday.
  const start = weekStart(
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today,
  );

  const slots = await getSlots(kitchen.id);
  const [days, recipes] = await Promise.all([
    getWeek(kitchen.id, start, slots.length),
    getCookbookRecipes(kitchen.id, context.user.id),
  ]);

  /**
   * What could go in a slot, most cooked first.
   *
   * It used to be readiest first - what the shelves could already supply - and
   * v2 does not know the shelves. What it does know is what this kitchen goes
   * back to, which is the order getCookbookRecipes already returns.
   */
  const options: Pickable[] = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    timesCooked: recipe.times_cooked,
  }));

  const planned = days.flatMap((day) => day.meals).filter(Boolean).length;
  const thisWeek = weekStart(today);

  /**
   * What the week adds up to, asked before the shopping rather than after the
   * eating - which is the only moment at which the answer can change anything.
   *
   * The recipes are fetched here rather than carried on the plan rows because
   * the figures need every ingredient of every one, and putting that on the
   * week query would load seven recipes in full to draw seven coloured bars.
   */
  const onThePlan = days
    .flatMap((day) => day.meals)
    .filter(
      (meal): meal is NonNullable<typeof meal> =>
        meal !== null && meal.recipe_id !== null,
    );

  const full = await Promise.all(
    onThePlan.map((meal) => getRecipe(meal.recipe_id!, context.user.id)),
  );

  const nutrition = weekMacros(
    full.flatMap((recipe, index) =>
      recipe
        ? [
            {
              ingredients: recipe.ingredients,
              baseServings: recipe.base_servings,
              servings: onThePlan[index].servings ?? recipe.base_servings,
              name: recipe.name,
            },
          ]
        : [],
    ),
  );

  return (
    <>
      <SiteHeader
        active="plan"
        meta={planned > 0 ? `${planned} planned` : undefined}
      />

      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9 xl:max-w-[1280px]">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            The week
          </h1>
          <div className="flex items-center gap-2">
            {/* The shopping list's front door. It lived under the shelf, and
                the shelf is gone; planning the week is what fills the list,
                so the way to it is here. */}
            <Link
              href="/list"
              className="flex min-h-9 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold print:hidden"
            >
              <ShoppingBasket className="h-3.5 w-3.5" strokeWidth={2.8} />
              Shopping list
            </Link>
            <PrintButton label="On paper" />
          </div>
        </div>

        {/* Which week, and the way to the ones either side. A week is a link,
            so this is three links rather than a control with state in it. */}
        <div className="mb-5 flex items-center gap-2 print:hidden">
          <Link
            href={`/plan?week=${addDays(start, -7)}`}
            aria-label="The week before"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={3} />
          </Link>
          <p className="flex-1 text-center text-sm font-bold">
            {weekLabel(start)}
            {start === thisWeek && (
              <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                this week
              </span>
            )}
          </p>
          <Link
            href={`/plan?week=${addDays(start, 7)}`}
            aria-label="The week after"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={3} />
          </Link>
        </div>

        {/* Paper says which week it is, because the arrows do not print. */}
        <p className="mb-3 hidden text-sm font-bold print:block">
          {kitchen.name} &middot; {weekLabel(start)}
        </p>

        {/* Above the days, not after them. Below, it sat under twenty-one
            empty rows, which is the one place nobody looking at an empty
            week was ever going to scroll to. */}
        {planned === 0 && (
          <p className="mb-4 rounded-[16px] bg-chip p-4 text-sm font-semibold text-muted-foreground print:hidden">
            {options.length === 0 ? (
              <>
                Nothing planned, and nothing in {kitchen.name}&apos;s cookbook
                to plan yet.{" "}
                <Link
                  href="/discover"
                  className="font-bold text-primary underline underline-offset-2"
                >
                  Find a recipe
                </Link>{" "}
                and add it to the cookbook, and it turns up here.
              </>
            ) : (
              <>
                Nothing planned yet. Tap a meal to fill it — what you cook
                most is at the top of the list.
              </>
            )}
          </p>
        )}

        <WeekPlan
          start={start}
          days={days}
          slots={slots}
          today={today}
          options={options}
          canEdit={kitchen.role !== "viewer"}
        />

        <WeekNutrition week={nutrition} each={perPortion(nutrition)} />
      </main>
    </>
  );
}
