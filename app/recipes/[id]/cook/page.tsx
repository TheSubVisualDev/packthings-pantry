import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CookStory, type StoryStep } from "@/components/cook-story";
import { getRecipe } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";
import { describeAmount, scaleQuantity } from "@/lib/units";

export const dynamic = "force-dynamic";

/**
 * Cooking a recipe, one step at a time.
 *
 * Its own route rather than a mode on the recipe page, because it is a
 * different thing: the recipe page is for deciding and reading, this is for
 * standing at the hob. A URL also means the phone's back button ends a cook,
 * and that a half-finished one survives the screen locking.
 *
 * The serving count arrives in the URL so the step chips say what to actually
 * put in the pan. It is chosen on the recipe page, where the stock counts are.
 */
export default async function CookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ servings?: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId)) notFound();

  const context = await currentKitchen();
  if (!context.ok) redirect("/login");

  const recipe = await getRecipe(recipeId, context.user.id);
  if (!recipe) notFound();

  const { servings } = await searchParams;
  const wanted = Number(servings);
  const forServings =
    Number.isFinite(wanted) && wanted > 0 && wanted <= 100
      ? wanted
      : recipe.base_servings;

  /**
   * What each line comes to at this serving count, worded the way the step
   * should say it.
   *
   * Worked out here rather than in the browser because the serving count is
   * fixed for the length of a cook - it is in the URL - so there is nothing
   * for the client to recompute.
   */
  const labels = new Map(
    recipe.ingredients.map((line) => [
      line.id,
      `${describeAmount(
        scaleQuantity(line.quantity, recipe.base_servings, forServings),
        line.unit,
        { size: line.pack_size, unit: line.pack_unit },
      )} ${line.item_name}`,
    ]),
  );

  const steps: StoryStep[] = recipe.steps.map((step) => ({
    id: step.id,
    section: step.section,
    body: step.body,
    minutes: step.minutes,
    photo_url: step.photo_url,
    needs: step.uses
      .map((line) => labels.get(line.id))
      .filter((label): label is string => Boolean(label)),
  }));

  /**
   * A recipe with no method cannot be walked through.
   *
   * Said plainly with the way back, rather than rendering an empty progress
   * bar and a Next button that does nothing.
   */
  if (steps.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[oklch(0.22_0.012_55)] px-8 text-center text-[oklch(0.96_0.008_60)]">
        <p className="text-[17px] font-bold">
          {recipe.name} has no method written down yet.
        </p>
        <Link
          href={`/recipes/${recipe.id}`}
          className="rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
        >
          Back to the recipe
        </Link>
      </div>
    );
  }

  return (
    <CookStory
      recipeId={recipe.id}
      name={recipe.name}
      servings={forServings}
      steps={steps}
    />
  );
}
