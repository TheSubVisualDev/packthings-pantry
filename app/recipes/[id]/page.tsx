import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { CookPanel, type CookLine } from "@/components/cook-panel";
import { getRecipe, getItems } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId)) notFound();

  const [recipe, items] = await Promise.all([getRecipe(recipeId), getItems()]);
  if (!recipe) notFound();

  const itemsByName = new Map(
    items.map((item) => [item.name.toLowerCase(), item]),
  );

  // Pass raw stock alongside each line so the panel can re-resolve status as
  // the serving count changes, using the same pure helpers as the server.
  const lines: CookLine[] = recipe.ingredients.map((line) => {
    const item = itemsByName.get(line.item_name.toLowerCase());
    return {
      id: line.id,
      item_name: line.item_name,
      quantity: line.quantity,
      unit: line.unit,
      item: item
        ? {
            quantity: item.quantity,
            dimension: item.dimension,
            canonical_unit: item.canonical_unit,
          }
        : null,
    };
  });

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

        <h1 className="mt-3 text-[28px] font-extrabold tracking-[-0.02em] break-words sm:text-[32px]">
          {recipe.name}
        </h1>
        <div className="mt-2 mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground">
          <span>base {recipe.base_servings} servings</span>
          <span>cooked {recipe.times_cooked}&times;</span>
        </div>

        <CookPanel
          recipeId={recipe.id}
          baseServings={recipe.base_servings}
          rating={recipe.rating}
          lines={lines}
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
