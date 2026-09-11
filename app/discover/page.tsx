import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { SiteHeader } from "@/components/site-header";
import { browseRecipes } from "@/lib/queries";
import { browsePeople } from "@/lib/social";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover · Pantry",
};

export default async function DiscoverPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fdiscover");

  const [recipes, people] = await Promise.all([
    browseRecipes(context.user.id),
    browsePeople(context.user.id),
  ]);

  // Your own private drafts aren't a discovery; they're already on /recipes.
  const others = recipes.filter((recipe) => recipe.author_id !== context.user.id);

  return (
    <>
      <SiteHeader active="discover" />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Discover</h1>
        <p className="mt-1 mb-6 text-sm font-semibold text-muted-foreground">
          What everyone else is cooking.
        </p>

        {others.length === 0 ? (
          <div className="rounded-[20px] bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              Nothing shared yet. Recipes start private — open one of yours and
              set it to <strong className="text-foreground">Everyone here</strong>{" "}
              to put it on this page.
            </p>
            <Link
              href="/recipes"
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              Your recipes
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((recipe) => (
              <RecipeBrowseCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}

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
