import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PrintButton } from "@/components/print-button";
import { WeekPlan, type Pickable } from "@/components/week-plan";
import { getRecipesWithMatches } from "@/lib/queries";
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
 * now - and a tester asked for the whole week. It is a separate page rather
 * than a mode on /tonight because they answer different questions: tonight is
 * "what do I cook in the next hour, given what is in", and this is "what are
 * we eating, and what do I need to buy for it".
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
  if (!context.kitchen) redirect("/kitchens?need=stock");
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
    getRecipesWithMatches(kitchen.id, context.user.id),
  ]);

  /**
   * What could go in a slot, readiest first.
   *
   * The whole reason to plan a week in this app rather than on paper is that
   * it knows what is on the shelves, so the thing you can cook tonight without
   * shopping is the thing at the top of the list.
   */
  const options: Pickable[] = recipes
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      have: recipe.have,
      total: recipe.total,
    }))
    .sort(
      (a, b) =>
        b.total - b.have === 0 && a.total - a.have === 0
          ? a.name.localeCompare(b.name)
          : a.total - a.have - (b.total - b.have) ||
            a.name.localeCompare(b.name),
    );

  const planned = days.flatMap((day) => day.meals).filter(Boolean).length;
  const thisWeek = weekStart(today);

  return (
    <>
      <SiteHeader
        active="tonight"
        meta={planned > 0 ? `${planned} planned` : undefined}
      />

      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/tonight"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground print:hidden"
        >
          &larr; Tonight
        </Link>

        <div className="mt-2 mb-1 flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            The week
          </h1>
          <PrintButton label="On paper" />
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

        <WeekPlan
          start={start}
          days={days}
          slots={slots}
          today={today}
          options={options}
          canEdit={kitchen.role !== "viewer"}
        />

        {planned === 0 && (
          <p className="mt-5 rounded-[16px] bg-chip p-4 text-sm font-semibold text-muted-foreground print:hidden">
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
                Nothing planned yet. Tap a day to put something in it — the list
                puts what you already have at the top, so a week can be planned
                around the shelves rather than against them.
              </>
            )}
          </p>
        )}
      </main>
    </>
  );
}
