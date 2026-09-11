import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { CookPanel, type CookLine } from "@/components/cook-panel";
import type { CookStep } from "@/components/recipe-method";
import { getRecipe, getItems } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

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
  const { kitchen } = context;

  const [recipe, items] = await Promise.all([
    getRecipe(recipeId),
    getItems(kitchen.id),
  ]);
  if (!recipe) notFound();

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

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] break-words sm:text-[32px]">
            {recipe.name}
          </h1>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="mt-1.5 shrink-0 rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
          >
            Edit
          </Link>
        </div>

        {recipe.description && (
          <p className="mt-2 text-[15px] leading-relaxed font-medium text-muted-foreground">
            {recipe.description}
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
          rating={recipe.rating}
          lines={lines}
          steps={steps}
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
