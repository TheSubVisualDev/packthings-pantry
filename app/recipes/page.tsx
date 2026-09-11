import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  SuggestionCard,
  TopMatchCard,
} from "@/components/recipe-suggestion";
import { getRecipesWithMatches } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  const { kitchen } = context;

  const recipes = await getRecipesWithMatches(kitchen.id);
  const [topMatch, ...rest] = recipes;

  return (
    <>
      <SiteHeader
        active="recipes"
        meta={`${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`}
      />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        {recipes.length === 0 ? (
          <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              No recipes yet.
            </p>
            <Link
              href="/recipes/new"
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              Write one
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                Cook with what you have
              </span>
              <Link
                href="/recipes/new"
                className="rounded-full bg-chip px-4 py-2 text-sm font-bold hover:bg-border"
              >
                New recipe
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TopMatchCard recipe={topMatch} />
              {rest.map((recipe) => (
                <SuggestionCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
