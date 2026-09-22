import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { BackLink } from "@/components/back-link";
import { RecipeMenu } from "@/components/recipe-menu";
import { RecipeLike } from "@/components/recipe-like";
import { PrintButton } from "@/components/print-button";
import { RecipeVisibility } from "@/components/recipe-visibility";
import { RemixButton } from "@/components/remix-button";
import { CookbookButton } from "@/components/cookbook-button";
import { PlanItButton } from "@/components/plan-it-button";
import { addDays, getSlots, isoDate, shortDay } from "@/lib/plan";
import { getLinks, isInCookbook, resolveWithLinks } from "@/lib/cookbook";
import { RecipeTags } from "@/components/recipe-tags";
import { derivedTags, getTagsByRecipe, suggestTags } from "@/lib/recipe-tags";
import { Lineage } from "@/components/lineage";
import { CookHistory } from "@/components/cook-history";
import { RecipeNutrition } from "@/components/recipe-nutrition";
import { RecipeSocial } from "@/components/recipe-social";
import { CookPanel, type CookLine } from "@/components/cook-panel";
import type { CookStep } from "@/components/recipe-method";
import {
  getComments,
  getItems,
  getRecipe,
  getRecipeAuthorHandle,
  getRecipeSocial,
  getCookedLog,
} from "@/lib/queries";
import { getLineage, getRemixes } from "@/lib/social";
import { indexStock } from "@/lib/pantry-match";
import { rankSubstitutes } from "@/lib/substitutes";
import { getTags, getTagsByItem } from "@/lib/tags";
import { recipeMacros } from "@/lib/recipe-nutrition";
import { recipeTint } from "@/lib/tint";
import { currentKitchen } from "@/lib/session";
import { myRating } from "@/lib/recipe-store";
import { getUser } from "@/lib/users";
import { displayTitle } from "@/lib/recipe-display";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId)) notFound();

  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Readable without a kitchen - the cook panel is what needs one.
  const kitchen = context.kitchen;

  const [recipe, items, inCookbook] = await Promise.all([
    getRecipe(recipeId, context.user.id),
    getItems(kitchen?.id ?? null),
    isInCookbook(kitchen?.id ?? null, recipeId),
  ]);
  if (!recipe) notFound();

  const isAuthor = recipe.author_id === context.user.id;

  // Everything the page still needs, in one round trip rather than two.
  // libSQL over HTTP opens a request per query, so awaits in sequence cost
  // sequential trips to Nuremberg; none of these five depends on another.
  const [
    author,
    forkedFrom,
    yourRating,
    social,
    comments,
    ancestors,
    remixes,
    history,
    tagsByItem,
    kitchenTags,
    recipeTagsByRecipe,
    links,
    slots,
  ] =
    await Promise.all([
    recipe.author_id ? getUser(recipe.author_id) : null,
    // Looked up without a visibility check on purpose: the credit has to
    // survive the original being made private.
    recipe.forked_from_id ? getRecipeAuthorHandle(recipe.forked_from_id) : null,
    myRating(recipe.id, context.user.id),
    getRecipeSocial(recipe.id, context.user.id),
    getComments(recipe.id, context.user.id),
    getLineage(recipe.id),
    getRemixes(recipe.id, context.user.id),
    getCookedLog(kitchen?.id ?? null, 20, recipe.id),
    getTagsByItem(kitchen?.id ?? null),
    getTags(kitchen?.id ?? null),
    getTagsByRecipe([recipeId]),
    getLinks(kitchen?.id ?? null, recipeId),
    // The kitchen's own meal names, for planning this onto a day from here.
    kitchen ? getSlots(kitchen.id) : Promise.resolve([]),
  ]);

  /**
   * The week ahead, labelled here rather than in the browser.
   *
   * Dates in the planner are days, not instants - `fromIso` pins to noon
   * because midnight UTC is the previous evening in London on the morning the
   * clocks go forward - so the days are built with the same helpers the
   * planner uses rather than a second set in a client component.
   */
  const startOfPlanning = isoDate(new Date());
  const nextSevenDays = Array.from({ length: 7 }, (_, ahead) => {
    const date = addDays(startOfPlanning, ahead);
    return { date, ...shortDay(date), today: ahead === 0 };
  });

  const forkedAuthor =
    forkedFrom && forkedFrom.id !== recipe.author_id ? forkedFrom : null;

  const tagCounts = new Map(kitchenTags.map((tag) => [tag.id, tag.item_count]));

  const itemsByName = new Map(
    items.map((item) => [item.name.toLowerCase(), item]),
  );

  /**
   * What one portion comes to.
   *
   * Computed at base servings and left there: scaling a recipe multiplies the
   * total and the portions equally, so a portion is the same whatever you cook
   * for. No need to follow the stepper.
   */
  const nutrition = recipeMacros(
    recipe.ingredients,
    itemsByName,
    recipe.base_servings,
    recipe.base_servings,
  );

  // Pass raw stock alongside each line so the panel can re-resolve status as
  // the serving count changes, using the same pure helpers as the server.
  /**
   * The same answer the cook button will give, from the same function.
   *
   * This page used to decide it alone: trust `recipe_ingredients.item_id` if
   * set, otherwise an exact lowercase name match. The cook action reads
   * `cookbook_links` and falls through to the real resolver, which refuses a
   * low-confidence guess - so the two disagreed, and the page won the argument
   * it had no business being in. A stale item_id let it print "Low" beside
   * Sweet Peppers and Brown Onions, and then cooking said they "could not be
   * worked out from the recipe" and deducted nothing, in small print under the
   * celebration screen.
   *
   * pantry-match.ts says in its own header that four places once decided this
   * independently and "agreed only by being equally wrong". This was the fifth,
   * and the only caller that never adopted the fix - queries, shopping and trip
   * were all already here.
   */
  const stockIndex = indexStock(items);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const lines: CookLine[] = recipe.ingredients.map((line) => {
    const item = resolveWithLinks(line, links, stockIndex, itemsById).item ?? undefined;

    return {
      id: line.id,
      item_name: line.item_name,
      quantity: line.quantity,
      unit: line.unit,
      pack_size: line.pack_size,
      pack_unit: line.pack_unit,
      note: line.note,
      optional: line.optional === 1,
      approx: line.approx === 1,
      section: line.section,
      /**
       * What else on the shelf could stand in.
       *
       * Worked out here rather than in the browser because it needs the whole
       * kitchen's tags, and shipping those to rank four chips would be sending
       * the shelf to decide what is on it.
       */
      substitutes: rankSubstitutes(
        line.item_name,
        item ?? null,
        items,
        tagsByItem,
        tagCounts,
      ).map((option) => ({
        id: option.item.id,
        name: option.item.name,
        shared: option.shared,
        level: {
          quantity: option.item.quantity,
          canonical_unit: option.item.canonical_unit,
          sealed_count: option.item.sealed_count,
          pack_size: option.item.pack_size,
          pack_unit: option.item.pack_unit,
          unspecified: option.item.unspecified,
          count_noun: option.item.count_noun,
          dimension: option.item.dimension,
        },
      })),
      item: item
        ? {
            quantity: item.quantity,
            dimension: item.dimension,
            canonical_unit: item.canonical_unit,
            // The containers too: judging a line against the open one alone
            // called recipes short with sealed packs sitting behind it.
            sealed_count: item.sealed_count,
            pack_size: item.pack_size,
            pack_unit: item.pack_unit,
            unspecified: item.unspecified,
            count_noun: item.count_noun,
          }
        : null,
    };
  });

  const steps: CookStep[] = recipe.steps.map((step) => ({
    id: step.id,
    section: step.section,
    body: step.body,
    minutes: step.minutes,
    photo_url: step.photo_url,
    uses: step.uses.map((line) => line.id),
  }));

  const timings = [
    recipe.prep_minutes ? `${recipe.prep_minutes} min prep` : null,
    recipe.cook_minutes ? `${recipe.cook_minutes} min cooking` : null,
  ].filter(Boolean);

  return (
    <>
      <SiteHeader active="recipes" />

      {/* 760 was a phone's column standing in the middle of a monitor. The
          hero and the heading stay readable because they cap themselves; the
          cook panel below is what actually wanted the room. */}
      <div className="mx-auto w-full max-w-[760px] px-5 pt-6 pb-32 sm:px-9 sm:py-8 lg:max-w-[1180px]">
        {/*
          One header whether or not there is a photo.

          A recipe with a photo had a title on it and a recipe without had a
          title above where the photo would be, so the two read as different
          screens - and the second one opened on a wall of small grey text. The
          flat per-id tint is the same colour the listing card gives it, so a
          recipe you tapped is recognisably the thing you tapped.
        */}
        {/* Paper gets a heading instead of the header: the tint is an inline
            background, which no print rule can undo, and a page of flat colour
            is somebody else's ink. */}
        <div className="hidden print:block">
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">
            {displayTitle(recipe.name)}
          </h1>
          <p className="mt-1 text-sm font-semibold">
            Serves {recipe.base_servings}
            {timings.length > 0 ? ` · ${timings.join(" · ")}` : ""}
          </p>
        </div>

        <header
          className="relative -mx-5 -mt-6 overflow-hidden print:hidden sm:mx-0 sm:mt-0 sm:rounded-[20px]"
          style={recipe.photo_url ? undefined : { background: recipeTint(recipe.id) }}
        >
          {/*
            The photo fills the header rather than setting its height.

            Sized by the words on it, which is the only thing that cannot be
            made to fit: a three-line title over a fixed 16:10 photo grew
            upwards and straight through the back button. The photo crops, the
            title never does.
          */}
          {recipe.photo_url && (
            <>
              <Image
                src={recipe.photo_url}
                alt=""
                fill
                priority
                sizes="(max-width: 768px) 100vw, 760px"
                className="object-cover"
              />
              {/* A scrim rather than a flat overlay: the title needs contrast at
                  the bottom and the photo deserves to be seen at the top. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
            </>
          )}

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 print:hidden">
            {/* Back to wherever the recipe was opened from - Tonight, more
                often than not - rather than always to the cookbook. */}
            <BackLink
              href="/recipes"
              label="Cookbook"
              icon={<ArrowLeft className="h-5 w-5" strokeWidth={2.5} />}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)] backdrop-blur"
            />

            <div className="flex items-center gap-2">
              {/* Where the first look happens. It was at the bottom of the
                  page, several screens down, and was reported as hidden. */}
              <RecipeLike
                recipeId={recipe.id}
                likes={social.likes}
                youLiked={social.youLiked}
                onPhoto={Boolean(recipe.photo_url)}
              />

              <RecipeMenu>
                <PrintButton label="Print this recipe" />
                {isAuthor && (
                  <Link
                    href={`/recipes/${recipe.id}/edit`}
                    className="flex min-h-11 items-center rounded-[14px] bg-chip px-4 text-sm font-extrabold hover:bg-border"
                  >
                    Edit this recipe
                  </Link>
                )}
                {isAuthor ? (
                  <RecipeVisibility recipeId={recipe.id} current={recipe.visibility} />
                ) : (
                  <RemixButton recipeId={recipe.id} yours={false} />
                )}
                {/* The author gets it too: trying a variation without losing the
                    version that already works is the same operation. */}
                {isAuthor && <RemixButton recipeId={recipe.id} yours />}
              </RecipeMenu>
            </div>
          </div>

          <div className="relative flex min-h-[220px] flex-col justify-end px-5 pt-20 pb-5 sm:min-h-[260px]">
            <h1
              className={`text-[26px] font-extrabold tracking-[-0.02em] break-words sm:text-[32px] ${
                recipe.photo_url ? "text-white" : ""
              }`}
            >
              {displayTitle(recipe.name)}
            </h1>
            {recipe.description && (
              <p
                className={`mt-1 text-sm leading-relaxed font-medium ${
                  recipe.photo_url ? "text-white/85" : "text-ink/70"
                }`}
              >
                {recipe.description}
              </p>
            )}
          </div>
        </header>

        {(author || forkedAuthor) && (
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {author && (
              <>
                by{" "}
                <Link
                  href={`/people/${author.handle}`}
                  className="font-bold text-foreground underline underline-offset-2"
                >
                  @{author.handle}
                </Link>
              </>
            )}
            {forkedAuthor && (
              <>
                {author ? " · " : ""}adapted from{" "}
                <Link
                  href={`/people/${forkedAuthor.handle}`}
                  className="font-bold text-foreground underline underline-offset-2"
                >
                  @{forkedAuthor.handle}
                </Link>
              </>
            )}
          </p>
        )}

        {/* Above the timings rather than below them: the tags are how you
            found this recipe, so they belong with its identity rather than
            filed away with its statistics. */}
        <div className="print:hidden">
        <RecipeTags
          recipeId={recipe.id}
          tags={recipeTagsByRecipe.get(recipe.id) ?? []}
          derived={derivedTags(recipe, recipe.ingredients, recipe.steps)}
          /**
           * Suggestions have to be about THIS recipe.
           *
           * Every tag the reader had ever used was appended here
           * unconditionally, so a soup and a tofu stir-fry were both offered
           * "Baking" and "Frying" - not because either involved baking or
           * frying, but because those were the two most-used tags in the
           * account, echoed back. lib/recipe-tags.ts says in its own comments
           * that every one of these should be checkable against the row, and
           * half of them could not be checked against anything.
           *
           * What is left is what suggestTags derived by reading the
           * ingredients and the method. Applying a tag you already use is
           * still possible - that is what the tag picker is for - but it is a
           * thing you choose, not a thing the app claims to have noticed.
           */
          suggestions={suggestTags(recipe.ingredients, recipe.steps)}
          canEdit={isAuthor}
        />
        </div>

        <div className="mt-3 mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground print:hidden">
          <span>base {recipe.base_servings} servings</span>
          {timings.map((timing) => (
            <span key={timing}>{timing}</span>
          ))}
          <span>cooked {recipe.times_cooked}&times;</span>
          {recipe.source && <span>from {recipe.source}</span>}
        </div>

        <CookPanel
          recipeId={recipe.id}
          baseServings={recipe.base_servings}
          rating={yourRating}
          lines={lines}
          steps={steps}
          hasKitchen={kitchen !== null}
          inCookbook={inCookbook}
          /**
           * What you last cooked THIS recipe for, and otherwise the recipe's
           * own number.
           *
           * The kitchen's usual serving count used to sit between the two and
           * it was wrong: a recipe that makes sixteen flapjacks makes sixteen
           * flapjacks, and a household that cooks for two does not want an
           * eighth of a tray. Reported as "authored recipe not retaining its
           * state" - the number had not been forgotten, it was being overruled
           * on every visit, which looks identical from the outside.
           *
           * Last time here is different: it is a fact about this recipe and
           * this kitchen together, which is the only thing that beats what the
           * recipe says about itself.
           */
          lastServings={history[0]?.servings ?? null}
        />

        {/* Adopting comes before cooking, because adopting is where the app is
            allowed to ask which jar an ingredient means. Above the visibility
            and remix controls: it is the thing to do with a recipe you have
            just found, and those are things to do with one you already keep. */}
        {kitchen && kitchen.role !== "viewer" && (
          <div className="mt-5 space-y-2 print:hidden">
            <CookbookButton recipeId={recipe.id} inCookbook={inCookbook} />
            {/* Under it, because "I want this on Thursday" is the other thing
                you decide while reading a recipe, and until now it could only
                be said on a different screen - which is why the planner has
                never had a meal put in it. */}
            <PlanItButton
              recipeId={recipe.id}
              slots={slots}
              days={nextSevenDays}
            />
          </div>
        )}

        <div className="print:hidden">
        <RecipeSocial
          recipeId={recipe.id}
          comments={comments}
          viewerId={context.user.id}
          isAuthor={isAuthor}
        />

        </div>

        <Lineage ancestors={ancestors} remixes={remixes} />

        <RecipeNutrition macros={nutrition} />

        <div className="print:hidden">
          <CookHistory entries={history} />
        </div>

        {recipe.notes && (
          <section className="mt-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
              Notes
            </h2>
            <p className="rounded-[20px] bg-card p-5 text-sm leading-relaxed font-medium shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {recipe.notes}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
