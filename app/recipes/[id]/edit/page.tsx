import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/recipe-editor";
import { SiteHeader } from "@/components/site-header";
import { DeleteRecipeButton } from "@/components/delete-recipe-button";
import { getItems, getRecipe } from "@/lib/queries";
import { draftFromRecipe } from "@/lib/recipe-draft";
import { getSectionNames } from "@/lib/recipe-sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit recipe · Pantry",
};

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const recipeId = Number((await params).id);
  if (!Number.isInteger(recipeId)) notFound();

  const [recipe, items, sections] = await Promise.all([
    getRecipe(recipeId),
    getItems(),
    getSectionNames(),
  ]);
  if (!recipe) notFound();

  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href={`/recipes/${recipe.id}`}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; {recipe.name}
        </Link>
        <h1 className="mt-2 mb-6 text-[26px] font-extrabold tracking-[-0.02em]">
          Edit recipe
        </h1>

        <RecipeEditor
          initial={draftFromRecipe(recipe)}
          recipeId={recipe.id}
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
