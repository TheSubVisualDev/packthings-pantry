import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { RecipeVisibility } from "@/components/recipe-visibility";
import { SaveRecipeButton } from "@/components/save-recipe-button";
import { RecipeSocial } from "@/components/recipe-social";
import { CookPanel, type CookLine } from "@/components/cook-panel";
import type { CookStep } from "@/components/recipe-method";
import {
  getComments,
  getItems,
  getRecipe,
  getRecipeAuthorHandle,
  getRecipeSocial,
} from "@/lib/queries";
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

  const [recipe, items] = await Promise.all([
    getRecipe(recipeId, context.user.id),
    getItems(kitchen?.id ?? null),
  ]);
  if (!recipe) notFound();

  const isAuthor = recipe.author_id === context.user.id;

  // Everything the page still needs, in one round trip rather than two.
  // libSQL over HTTP opens a request per query, so awaits in sequence cost
  // sequential trips to Nuremberg; none of these five depends on another.
  const [author, forkedFrom, yourRating, social, comments] = await Promise.all([
    recipe.author_id ? getUser(recipe.author_id) : null,
    // Looked up without a visibility check on purpose: the credit has to
    // survive the original being made private.
    recipe.forked_from_id ? getRecipeAuthorHandle(recipe.forked_from_id) : null,
    myRating(recipe.id, context.user.id),
    getRecipeSocial(recipe.id, context.user.id),
    getComments(recipe.id, context.user.id),
  ]);

  const forkedAuthor =
    forkedFrom && forkedFrom.id !== recipe.author_id ? forkedFrom : null;

  const itemsByName = new Map(
    items.map((item) => [item.name.toLowerCase(), item]),
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
      item: item
        ? {
            quantity: item.quantity,
            dimension: item.dimension,
            canonical_unit: item.canonical_unit,
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
        <Link
          href="/recipes"
          className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Recipes
        </Link>

        {recipe.photo_url && (
          <div className="relative mt-3 aspect-[16/10] overflow-hidden rounded-[20px] sm:aspect-[2/1]">
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
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-16">
              <h1 className="text-[26px] font-extrabold tracking-[-0.02em] break-words text-white sm:text-[32px]">
                {recipe.name}
              </h1>
              {recipe.description && (
                <p className="mt-1 text-sm leading-relaxed font-medium text-white/85">
                  {recipe.description}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          {!recipe.photo_url && (
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em] break-words sm:text-[32px]">
              {recipe.name}
            </h1>
          )}
          {isAuthor && (
            <Link
              href={`/recipes/${recipe.id}/edit`}
              className="mt-1.5 shrink-0 rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
            >
              Edit
            </Link>
          )}
        </div>

        {recipe.description && !recipe.photo_url && (
          <p className="mt-2 text-[15px] leading-relaxed font-medium text-muted-foreground">
            {recipe.description}
          </p>
        )}

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

        <div className="mt-2 mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground">
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
        />

        <div className="mt-5">
          {isAuthor ? (
            <RecipeVisibility recipeId={recipe.id} current={recipe.visibility} />
          ) : (
            <SaveRecipeButton recipeId={recipe.id} />
          )}
        </div>

        <RecipeSocial
          recipeId={recipe.id}
          likes={social.likes}
          youLiked={social.youLiked}
          comments={comments}
          viewerId={context.user.id}
          isAuthor={isAuthor}
        />

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
