import Link from "next/link";
import { CalendarDays, List } from "lucide-react";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { NearlyCard, SuggestionRow, TonightCard } from "@/components/tonight-card";
import { getTonightFacts } from "@/lib/queries";
import { getRecipeTags, getTagsByRecipe } from "@/lib/recipe-tags";
import { nearlyThere, rankTonight } from "@/lib/tonight";
import { RecipeFilters } from "@/components/recipe-filters";
import { currentKitchen } from "@/lib/session";
import { getPlanned, isoDate, getSlots } from "@/lib/plan";
import { getTrip } from "@/lib/trip";
import { ShelfView } from "@/components/shelf-view";
import { TripStrip } from "@/components/trip-strip";
import { getItems } from "@/lib/queries";
import { getLocations } from "@/lib/kitchens";
import { inStock } from "@/lib/containers";
import { hasBeenWelcomed } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function TonightPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; within?: string; servings?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  /**
   * The same fork /pantry used to own alone.
   *
   * This page is the front door now (phase 6), so a brand new account lands
   * here first - and without this it skipped straight past /welcome to
   * /kitchens?need=stock, because that page never had to think about being
   * the first thing anybody saw. Ported rather than shared, since the two
   * pages are owned separately.
   */
  if (!context.kitchen) {
    redirect(
      (await hasBeenWelcomed(context.user.id)) ? "/kitchens?need=stock" : "/welcome",
    );
  }
  const { kitchen } = context;

  const { tag, within, servings } = await searchParams;
  const wantedTag = tag?.trim() || null;
  const wantedWithin =
    Number.isFinite(Number(within)) && Number(within) > 0 ? Number(within) : null;
  const forServings =
    Number.isFinite(Number(servings)) && Number(servings) > 0 ? Number(servings) : 2;

  const today = isoDate(new Date());

  const [facts, myTags, plannedToday, slots, items, places, trip] = await Promise.all([
    getTonightFacts(kitchen.id, context.user.id),
    getRecipeTags(context.user.id),
    /**
     * What you already decided about tonight, on some calmer evening.
     *
     * This page and the planner were answering the same question and only one
     * of them was listening. Plan a curry for Thursday on Sunday, open the app
     * on Thursday, and it would suggest something else entirely and never
     * mention the curry - two screens, one evening, two answers. That is the
     * shape of bug AGENTS.md keeps a running total of, arrived at from a
     * different direction: not two copies of a rule, but one screen ignoring
     * the other's answer.
     *
     * A decision you already made beats a ranking every time, so it goes
     * first and the ranked list becomes the alternatives.
     */
    getPlanned(kitchen.id, today, today),
    getSlots(kitchen.id),
    /**
     * The shelf, now that this is where it lives.
     *
     * Stock stopped being a tab: what is in the kitchen is part of deciding
     * what to cook rather than a separate errand, so it is under the answer
     * instead of beside it. Loaded in the same Promise.all as everything else
     * - this page already talks to Nuremberg five times and a sixth in
     * parallel costs nothing, where a sixth in series would be another round
     * trip before anybody sees a word.
     */
    getItems(kitchen.id),
    getLocations(kitchen.id),
    /** What this kitchen is shopping for, if anything. Same reasoning: a
        seventh trip in parallel costs nothing and answers a question this
        screen is asked in a shop. */
    getTrip(kitchen.id),
  ]);

  /**
   * The same filter /pantry uses: things that are there, plus things you keep
   * on hand that have run out. A shelf that silently drops what you have run
   * out of is a shelf that cannot tell you to buy more.
   */
  const onShelf = items.filter(
    (item) => inStock(item) || item.restock_target !== null,
  );

  const tagsByRecipe = await getTagsByRecipe(facts.map((each) => each.id));

  /**
   * Filters narrow what is considered, they do not re-rank it.
   *
   * "Something Asian" is a constraint on the answer rather than another signal
   * to weigh - if you have said Asian, a brilliantly-scoring shepherd's pie is
   * not a better answer, it is the wrong answer.
   */
  const considered = facts.filter((recipe) => {
    if (wantedTag) {
      const carried = (tagsByRecipe.get(recipe.id) ?? []).map((each) =>
        each.name.toLowerCase(),
      );
      if (!carried.includes(wantedTag.toLowerCase())) return false;
    }
    if (wantedWithin !== null) {
      // Untimed is unknown, not quick. Asking for fifteen minutes must not
      // return everything nobody has bothered to time.
      if (recipe.minutes === null || recipe.minutes > wantedWithin) return false;
    }
    return true;
  });

  const ranked = rankTonight(considered);

  // The suggestion for something already planned, so the card that says "you
  // planned this" is the same card with the same cook button - rather than a
  // second, lesser version of it that cannot do anything.
  const byId = new Map(ranked.map((suggestion) => [suggestion.id, suggestion]));

  const filtered = wantedTag !== null || wantedWithin !== null;

  /**
   * Tonight's plan, only when nothing is filtered.
   *
   * Setting a filter is asking a different question - "something Asian, under
   * half an hour" is not "what did I decide on Sunday" - and answering the old
   * one anyway would put a shepherd's pie at the top of a search for Asian
   * food. So the filters hide it rather than fight it.
   *
   * Every slot for today, not just dinner: a kitchen with Breakfast, Lunch and
   * Dinner set up planned all three, and showing one of them would be picking
   * a meal on somebody's behalf.
   */
  const plannedForToday = filtered
    ? []
    : plannedToday
        .filter((meal) => meal.recipe_id !== null || meal.note)
        .sort((a, b) => a.slot - b.slot);

  /**
   * The alternatives, with tonight's plan taken out of them.
   *
   * Without this the planned curry is the card at the top AND the top of the
   * list underneath it, which reads as the app not knowing it has already
   * answered - the same complaint as before, one screen down.
   */
  const plannedIds = new Set(
    plannedForToday
      .map((meal) => meal.recipe_id)
      .filter((id): id is number => id !== null),
  );
  const [best, ...rest] = ranked.filter(
    (suggestion) => !plannedIds.has(suggestion.id),
  );

  /**
   * Only offered once something can actually be cooked.
   *
   * A kitchen with nothing makeable wants a shopping list, not a card saying
   * it is nearly there - and the shortfall on the main card already covers
   * that case.
   */
  const nearly = best
    ? nearlyThere(considered, [best.id, ...plannedIds])
    : null;

  // Built once and placed twice: the phone folds it away, the desktop does not,
  // and the list itself should not know which.
  const otherIdeas = rest.map((suggestion) => (
    <SuggestionRow key={suggestion.id} suggestion={suggestion} />
  ));

  return (
    <>
      <SiteHeader active="tonight" meta={`${ranked.length} to choose from`} />

      <div className="mx-auto w-full max-w-[720px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            What to cook
          </h1>
          {/* The Stock pill has gone: the shelf is on this page now, so a tap
              back to it would be a tap to somewhere you already are. What is
              left is the other half of the question. */}
          <div className="flex shrink-0 items-center gap-2">

            {/* The two halves of the same question. This page answers "what
                tonight, given what is in"; the planner answers "what this
                week, and what do I need to buy for it". */}
            <Link
              href="/plan"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.8} />
              The week
            </Link>
          </div>
        </div>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">
          Ranked on what expires soonest, what you have, and what you had recently.
        </p>

        {/*
          The trip, where the trip strip was always meant to be.

          Its own file says it belongs in "the same slot the Tonight suggestion
          uses, because they are answers to the same question" - and it was
          rendered on /pantry and /pantry/list and never here, which is the
          front door and the screen somebody opens in a shop. A trip you cannot
          see from the first screen is a trip you have to go looking for.

          Above the suggestions rather than instead of them: a trip is a
          decision already taken, and the ranked ideas underneath stay useful
          for the night it falls through.
        */}
        {trip && (
          <div className="mb-4 print:hidden">
            <TripStrip trip={trip} />
          </div>
        )}

        <RecipeFilters
          tags={myTags.map((each) => each.name)}
          activeTag={wantedTag}
          activeWithin={wantedWithin}
          term=""
          basePath="/tonight"
        />

        {plannedForToday.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-label">
              You planned this
            </h2>
            <div className="space-y-3">
              {plannedForToday.map((meal) => {
                const suggestion = meal.recipe_id ? byId.get(meal.recipe_id) : undefined;

                // The full card when the recipe is one this kitchen can cook -
                // same buttons, same shortfall, nothing lesser about it.
                if (suggestion) {
                  return (
                    <TonightCard
                      key={meal.id}
                      suggestion={suggestion}
                      servings={meal.servings ?? forServings}
                    />
                  );
                }

                /**
                 * A note, or a recipe the ranker did not have.
                 *
                 * "Leftovers" and "Out" are real answers about an evening and
                 * there is nothing to cook for them. A planned recipe that is
                 * missing from the ranking has usually left the cookbook since
                 * it was planned - still worth saying, because the alternative
                 * is the plan silently disappearing.
                 */
                return (
                  <div
                    key={meal.id}
                    className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-label">
                      {slots[meal.slot] ?? "Tonight"}
                    </p>
                    <p className="mt-1 text-[17px] font-extrabold">
                      {meal.note || meal.recipe_name}
                    </p>
                    {meal.recipe_id && (
                      <Link
                        href={`/recipes/${meal.recipe_id}`}
                        className="mt-3 inline-flex min-h-11 items-center rounded-[14px] bg-chip px-4 text-sm font-extrabold hover:bg-border"
                      >
                        Open it
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              From the week planner.{" "}
              <Link href="/plan" className="font-bold text-primary underline underline-offset-2">
                Change it
              </Link>
            </p>
          </section>
        )}

        {plannedForToday.length > 0 && best && (
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-label">
            Or something else
          </h2>
        )}

        {/* With a plan up and nothing left to rank, say nothing. "Nothing in
            your cookbook yet" under a card showing tonight's dinner is a lie,
            and it is exactly what happens when the only recipe you have is the
            one you planned. */}
        {!best && plannedForToday.length > 0 ? null : !best ? (
          <div className="rise rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              {filtered
                ? "Nothing in your cookbook matches that."
                : "Nothing in your cookbook yet, so there is nothing to suggest."}
            </p>
            <Link
              href={filtered ? "/tonight" : "/recipes"}
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              {filtered ? "Drop the filters" : "Go to your cookbook"}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <TonightCard suggestion={best} servings={forServings} />
            {nearly && <NearlyCard suggestion={nearly} servings={forServings} />}

            {/*
              Folded on a phone, open on a desktop.

              The screen is the scarce thing on a handset and one suggestion is
              the point, so the alternatives fold away. On a monitor they sat
              behind a tap with an empty half-window underneath - hiding
              something to save room that was not short.

              Written as two wrappers around one list rather than by forcing
              the details open, because a closed <details> hides its contents
              whatever is done to the summary, and CSS cannot set an attribute.
            */}
            {rest.length > 0 && (
              <>
                <details className="group lg:hidden">
                  <summary className="cursor-pointer list-none rounded-[14px] bg-chip px-4 py-3 text-center text-sm font-bold hover:bg-border">
                    Other ideas ({rest.length})
                  </summary>
                  <div className="mt-3 space-y-2">{otherIdeas}</div>
                </details>
                <div className="hidden lg:block">
                  <span className="text-xs font-bold tracking-[0.08em] text-label uppercase">
                    Other ideas
                  </span>
                  <div className="mt-2 space-y-2">{otherIdeas}</div>
                </div>
              </>
            )}
          </div>
        )}

        {/*
          The shelf, under the answer.

          This is the fold: Stock stopped being a tab because what is in the
          kitchen is part of deciding what to cook, not an errand of its own.
          It comes AFTER the suggestion because the suggestion is what this
          page is for - somebody hungry at six gets an answer without
          scrolling, and somebody wondering whether there is any milk scrolls
          once.

          The list, the groupings and the bulk actions stay on /pantry, which
          is a page you go to on purpose now rather than a place in the tab
          bar.
        */}
        {onShelf.length > 0 && (
          // An id so "← The shelf" can land here rather than on the recipe
          // card above it. scroll-mt clears the header it would otherwise
          // tuck under.
          <section id="shelf" className="mt-9 scroll-mt-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[19px] font-extrabold tracking-[-0.01em]">
                On the shelf
              </h2>
              <Link
                href="/pantry"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground"
              >
                <List className="h-3.5 w-3.5" strokeWidth={2.8} />
                As a list
              </Link>
            </div>
            <ShelfView
              items={onShelf}
              places={places}
              canEdit={kitchen.role !== "viewer"}
            />
          </section>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
