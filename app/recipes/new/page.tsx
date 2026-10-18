import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { redirect } from "next/navigation";
import { RecipeEditor } from "@/components/recipe-editor";
import { SiteHeader } from "@/components/site-header";
import { getIngredientNames } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";
import { emptyDraft } from "@/lib/recipe-draft";
import { getSectionNames } from "@/lib/recipe-sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New recipe · Pantry",
};

export default async function NewRecipePage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  const kitchen = context.kitchen;

  const [names, sections] = await Promise.all([
    getIngredientNames(context.user.id),
    getSectionNames(),
  ]);

  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9 lg:max-w-[1280px]">
        <BackLink
          href="/recipes"
          label="Cookbook"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        />
        <h1 className="mt-2 mb-6 text-[26px] font-extrabold tracking-[-0.02em]">
          New recipe
        </h1>
        <RecipeEditor
          initial={emptyDraft(kitchen?.default_servings)}
          knownNames={names}
          sections={sections}
        />
      </main>
    </>
  );
}
