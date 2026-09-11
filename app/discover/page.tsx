import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { SiteHeader } from "@/components/site-header";
import { SearchBox } from "@/components/search-box";
import { browseRecipes, getFeed, searchPeople, searchRecipes } from "@/lib/queries";
import { browsePeople } from "@/lib/social";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover · Pantry",
};

const HEADING = "mb-3 text-xs font-bold uppercase tracking-[0.1em] text-label";

function Grid({ recipes }: { recipes: Awaited<ReturnType<typeof browseRecipes>> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeBrowseCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fdiscover");

  const { q } = await searchParams;
  const term = q?.trim() ?? "";
  const viewerId = context.user.id;

  if (term) {
    const [recipes, people] = await Promise.all([
      searchRecipes(viewerId, term),
      searchPeople(viewerId, term),
    ]);

    return (
      <>
        <SiteHeader active="discover" />
        <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
          <Suspense>
            <SearchBox basePath="/discover" placeholder="Search recipes, ingredients, people" />
          </Suspense>

          <p className="mb-6 text-sm font-semibold text-muted-foreground">
            {recipes.length + people.length === 0
              ? `Nothing matches "${term}".`
              : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}${
                  people.length ? ` and ${people.length} ${people.length === 1 ? "person" : "people"}` : ""
                } for "${term}".`}
          </p>

          {people.length > 0 && (
            <section className="mb-8">
              <h2 className={HEADING}>People</h2>
              <div className="flex flex-wrap gap-2">
                {people.map((person) => (
                  <Link
                    key={person.id}
                    href={`/people/${person.handle}`}
                    className="rounded-full bg-card px-4 py-2.5 text-sm font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  >
                    @{person.handle}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {recipes.length > 0 && (
            <section>
              <h2 className={HEADING}>Recipes</h2>
              <Grid recipes={recipes} />
            </section>
          )}
        </div>
      </>
    );
  }

  const [feed, everything, people] = await Promise.all([
    getFeed(viewerId),
    browseRecipes(viewerId),
    browsePeople(viewerId),
  ]);

  // Your own drafts aren't a discovery; they're already on /recipes. Anything
  // already in the feed isn't worth showing twice either.
  const inFeed = new Set(feed.map((recipe) => recipe.id));
  const rest = everything.filter(
    (recipe) => recipe.author_id !== viewerId && !inFeed.has(recipe.id),
  );

  return (
    <>
      <SiteHeader active="discover" />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Discover</h1>
        <p className="mt-1 mb-5 text-sm font-semibold text-muted-foreground">
          What everyone else is cooking.
        </p>

        <Suspense>
          <SearchBox basePath="/discover" placeholder="Search recipes, ingredients, people" />
        </Suspense>

        {feed.length > 0 && (
          <section className="mb-9">
            <h2 className={HEADING}>From people you follow</h2>
            <Grid recipes={feed} />
          </section>
        )}

        <section>
          <h2 className={HEADING}>
            {feed.length > 0 ? "Everything else" : "Shared with you"}
          </h2>

          {rest.length === 0 ? (
            <div className="rounded-[20px] bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-sm font-semibold text-muted-foreground">
                Nothing shared yet. Recipes start private — open one of yours and
                set it to{" "}
                <strong className="text-foreground">Everyone here</strong> to put
                it on this page.
              </p>
              <Link
                href="/recipes"
                className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
              >
                Your recipes
              </Link>
            </div>
          ) : (
            <Grid recipes={rest} />
          )}
        </section>

        {people.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                People here
              </h2>
              <Link
                href="/people"
                className="text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                See all
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {people.slice(0, 8).map((person) => (
                <Link
                  key={person.id}
                  href={`/people/${person.handle}`}
                  className="rounded-full bg-card px-4 py-2.5 text-sm font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  @{person.handle}
                  <span className="ml-1.5 font-semibold text-muted-foreground">
                    {person.recipe_count}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
