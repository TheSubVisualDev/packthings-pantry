import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { getRecipesWithMatches } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  const { kitchen } = context;

  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  const recipes = await getRecipesWithMatches(kitchen.id, context.user.id, term);

  return (
    <>
      <SiteHeader
        active="recipes"
        meta={`${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`}
      />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            Your recipes
          </h1>
          <Link
            href="/recipes/new"
            className="rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
          >
            New recipe
          </Link>
        </div>

        <Suspense>
          <SearchBox basePath="/recipes" placeholder="Find one of yours" />
        </Suspense>

        {recipes.length === 0 ? (
          <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              {term ? `Nothing of yours matches "${term}".` : "No recipes yet."}
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
      </div>

      <SiteFooter />
    </>
  );
}
