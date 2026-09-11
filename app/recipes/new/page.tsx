import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RecipeEditor } from "@/components/recipe-editor";
import { SiteHeader } from "@/components/site-header";
import { getItems } from "@/lib/queries";
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
  const { kitchen } = context;

  const [items, sections] = await Promise.all([
    getItems(kitchen.id),
    getSectionNames(),
  ]);

  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9 lg:max-w-[1280px]">
        <Link
          href="/recipes"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Recipes
        </Link>
        <h1 className="mt-2 mb-6 text-[26px] font-extrabold tracking-[-0.02em]">
          New recipe
        </h1>
        <RecipeEditor
          initial={emptyDraft()}
          pantryNames={items.map((item) => item.name)}
          sections={sections}
        />
      </main>
    </>
  );
}
