import { SiteHeader } from "@/components/site-header";
import {
  SuggestionCard,
  TopMatchCard,
} from "@/components/recipe-suggestion";
import { getRecipesWithMatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await getRecipesWithMatches();
  const [topMatch, ...rest] = recipes;

  return (
    <>
      <SiteHeader
        active="recipes"
        meta={`${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`}
      />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        {recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recipes yet.</p>
        ) : (
          <>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-label">
              Cook with what you have
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
    </>
  );
}
