import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { getMyRecipes, getRecipesWithMatches } from "@/lib/queries";
import { getCookbookIds } from "@/lib/cookbook";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // No kitchen is fine here: your recipes are yours, not a kitchen's. The
  // "what can I cook" counts simply come back empty.
  const kitchen = context.kitchen;

  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  const [recipes, mine, adopted] = await Promise.all([
    getRecipesWithMatches(kitchen?.id ?? null, context.user.id, term),
    getMyRecipes(context.user.id, term),
    getCookbookIds(kitchen?.id ?? null),
  ]);

  /**
   * What you wrote and have not adopted.
   *
   * Kept visible rather than filed away somewhere, because the cookbook being
   * a choice only works if the things you did not choose are still easy to
   * find - otherwise writing a recipe and not adopting it feels like losing it.
   */
  const unadopted = mine.filter((recipe) => !adopted.has(recipe.id));

  return (
    <>
      <SiteHeader
        active="recipes"
        meta={`${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`}
      />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            Your cookbook
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/cooked"
              className="rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
            >
              Cooked
            </Link>
            <Link
              href="/recipes/paste"
              className="rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
            >
              Paste from Claude
            </Link>
            <Link
              href="/recipes/new"
              className="rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
            >
              New recipe
            </Link>
          </div>
        </div>

        <Suspense>
          <SearchBox basePath="/recipes" placeholder="Find one of yours" />
        </Suspense>

        {recipes.length === 0 ? (
          <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              {term
                ? `Nothing in your cookbook matches "${term}".`
                : "Nothing in your cookbook yet."}
            </p>
            <Link
              href={term ? "/recipes" : "/recipes/new"}
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              {term ? "Show all of mine" : "Write one"}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-label">
              {term
                ? `${recipes.length} ${recipes.length === 1 ? "match" : "matches"}`
                : "Cook with what you have"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.map((recipe) => (
                <RecipeBrowseCard
                  key={recipe.id}
                  recipe={recipe}
                  showAuthor={false}
                  match={{ have: recipe.have, total: recipe.total }}
                />
              ))}
            </div>
          </>
        )}

        {unadopted.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-label">
              Written by you, not in your cookbook
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unadopted.map((recipe) => (
                <RecipeBrowseCard key={recipe.id} recipe={recipe} showAuthor={false} />
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              Open one and add it to link its ingredients to your shelves. Until
              then it is a recipe you have written down rather than one you cook.
            </p>
          </section>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
