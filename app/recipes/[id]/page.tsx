import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { RecipeMenu } from "@/components/recipe-menu";
import { PrintButton } from "@/components/print-button";
import { RecipeVisibility } from "@/components/recipe-visibility";
import { RemixButton } from "@/components/remix-button";
import { CookbookButton } from "@/components/cookbook-button";
import { isInCookbook } from "@/lib/cookbook";
import { RecipeTags } from "@/components/recipe-tags";
import {
  derivedTags,
  getRecipeTags,
  getTagsByRecipe,
  suggestTags,
} from "@/lib/recipe-tags";
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
import { rankSubstitutes } from "@/lib/substitutes";
import { getTags, getTagsByItem } from "@/lib/tags";
import { recipeMacros } from "@/lib/recipe-nutrition";
import { recipeTint } from "@/lib/tint";
import { currentKitchen } from "@/lib/session";
import { myRating } from "@/lib/recipe-store";
import { getUser } from "@/lib/users";

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
    myRecipeTags,
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
    getRecipeTags(context.user.id),
  ]);

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
  const lines: CookLine[] = recipe.ingredients.map((line) => {
    // item_id is the link when it exists; the name is still matched as a
    // fallback for lines written before the ingredient was ever in stock.
    const item = line.item_id
      ? items.find((candidate) => candidate.id === line.item_id)
      : itemsByName.get(line.item_name.toLowerCase());

    return {
      id: line.id,
      item_name: line.item_name,
      quantity: line.quantity,
      unit: line.unit,
      pack_size: line.pack_size,
      pack_unit: line.pack_unit,
      note: line.note,
      optional: line.optional === 1,
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

      <div className="mx-auto w-full max-w-[760px] px-5 pt-6 pb-32 sm:px-9 sm:py-8">
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
            {recipe.name}
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
            <Link
              href="/recipes"
              aria-label="Back to your cookbook"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)] backdrop-blur"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
            </Link>

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

          <div className="relative flex min-h-[220px] flex-col justify-end px-5 pt-20 pb-5 sm:min-h-[260px]">
            <h1
              className={`text-[26px] font-extrabold tracking-[-0.02em] break-words sm:text-[32px] ${
                recipe.photo_url ? "text-white" : ""
              }`}
            >
              {recipe.name}
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
          suggestions={[
            ...suggestTags(recipe.ingredients, recipe.steps),
            ...myRecipeTags.map((tag) => tag.name),
          ]}
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
        />

        {/* Adopting comes before cooking, because adopting is where the app is
            allowed to ask which jar an ingredient means. Above the visibility
            and remix controls: it is the thing to do with a recipe you have
            just found, and those are things to do with one you already keep. */}
        {kitchen && kitchen.role !== "viewer" && (
          <div className="mt-5 print:hidden">
            <CookbookButton recipeId={recipe.id} inCookbook={inCookbook} />
          </div>
        )}

        <div className="print:hidden">
        <RecipeSocial
          recipeId={recipe.id}
          likes={social.likes}
          youLiked={social.youLiked}
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
