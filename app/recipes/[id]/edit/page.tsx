import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RecipeEditor } from "@/components/recipe-editor";
import type { RecipePhotos } from "@/components/recipe-editor";
import { SiteHeader } from "@/components/site-header";
import { DeleteRecipeButton } from "@/components/delete-recipe-button";
import { getItems, getRecipe } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";
import { draftFromRecipe } from "@/lib/recipe-draft";
import { getSectionNames } from "@/lib/recipe-sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit recipe · Pantry",
};

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const recipeId = Number((await params).id);
  // Pasting lands here rather than on the finished recipe, and arriving in a
  // three-stage form with no explanation reads as having been put somewhere by
  // mistake. This is what says otherwise.
  const review = (await searchParams).review === "paste";
  if (!Number.isInteger(recipeId)) notFound();

  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  const kitchen = context.kitchen;

  const [recipe, items, sections] = await Promise.all([
    getRecipe(recipeId, context.user.id),
    getItems(kitchen?.id ?? null),
    getSectionNames(),
  ]);
  if (!recipe) notFound();

  // Photos belong to saved rows, not to the draft: the editor shows them and
  // the upload route owns them, so a save can't accidentally drop one.
  const photos: RecipePhotos = {
    hero: recipe.photo_url,
    steps: Object.fromEntries(recipe.steps.map((step) => [step.id, step.photo_url])),
    stepIds: recipe.steps.map((step) => step.id),
  };

  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9 lg:max-w-[1280px]">
        <Link
          href={`/recipes/${recipe.id}`}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; {recipe.name}
        </Link>
        <h1
          className={`mt-2 text-[26px] font-extrabold tracking-[-0.02em] ${
            review ? "" : "mb-6"
          }`}
        >
          {review ? "Check it through" : "Edit recipe"}
        </h1>
        {review && (
          <p className="mt-1 mb-6 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Read from what you pasted, and saved as it stands. Walk the three
            screens and correct anything that came out wrong.
          </p>
        )}

        <RecipeEditor
          initial={draftFromRecipe(recipe)}
          recipeId={recipe.id}
          photos={photos}
          pantryNames={items.map((item) => item.name)}
          sections={sections}
        />

        <div className="mt-8 border-t border-border pt-6">
          <DeleteRecipeButton recipeId={recipe.id} recipeName={recipe.name} />
        </div>
      </main>
    </>
  );
}
