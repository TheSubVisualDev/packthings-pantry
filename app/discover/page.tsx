import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PersonChip } from "@/components/person-chip";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { SiteHeader } from "@/components/site-header";
import { SearchBox } from "@/components/search-box";
import { browseRecipes, getFeed, searchPeople, searchRecipes } from "@/lib/queries";
import Image from "next/image";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { getCookedByOthers, getSimilarCooks, getTrusted } from "@/lib/social";
import { shortDate } from "@/lib/dates";
import { recipeTint } from "@/lib/tint";
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
                  <PersonChip
                    key={person.id}
                    handle={person.handle}
                    displayName={person.display_name}
                    avatarUrl={person.avatar_url}
                  />
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

  const [feed, everything, cooked, trusted, similar] = await Promise.all([
    getFeed(viewerId),
    browseRecipes(viewerId),
    getCookedByOthers(viewerId),
    getTrusted(viewerId),
    getSimilarCooks(viewerId),
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

        {/*
          Board 1n: social, not a social network.

          Three questions, in the order they are worth answering - what did
          people actually cook, what has something behind it, and who is worth
          following and why. Deliberately no comment feed, no notifications and
          no follower counts: none of them helps anybody decide what to have
          for dinner, and every one of them is a thing to keep up with.
        */}
        {cooked.length > 0 && (
          <section className="mb-9">
            <h2 className={HEADING}>Cooked this fortnight</h2>
            <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {cooked.map((entry) => (
                <li
                  key={`${entry.recipe_id}-${entry.handle}`}
                  className="border-b border-border last:border-b-0"
                >
                  <Link
                    href={`/recipes/${entry.recipe_id}`}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-3 hover:bg-chip"
                  >
                    <Avatar
                      handle={entry.handle}
                      displayName={entry.display_name}
                      url={entry.avatar_url}
                      size={36}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold break-words">
                        {entry.name}
                      </span>
                      <span className="block text-xs font-semibold text-muted-foreground">
                        @{entry.handle} cooked it
                        {entry.times > 1 ? ` ${entry.times} times` : ""} ·{" "}
                        {shortDate(entry.cooked_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trusted.length > 0 && (
          <section className="mb-9">
            <h2 className={HEADING}>Cooks trust these</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trusted.map((recipe) => (
                <Link
                  key={recipe.id}
                  href={`/recipes/${recipe.id}`}
                  className="flex items-center gap-3 rounded-[18px] bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_22px_-10px_rgba(60,44,30,0.45)]"
                >
                  <span
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px]"
                    style={
                      recipe.photo_url
                        ? undefined
                        : { background: recipeTint(recipe.id) }
                    }
                  >
                    {recipe.photo_url && (
                      <Image
                        src={recipe.photo_url}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] leading-snug font-extrabold">
                      {recipe.name}
                    </span>
                    {/* The numbers themselves, not a score made out of them. */}
                    <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                      {[
                        recipe.times_cooked > 0
                          ? `cooked ${recipe.times_cooked}×`
                          : null,
                        recipe.saves > 0 ? `saved by ${recipe.saves}` : null,
                        recipe.avg_rating !== null ? `★ ${recipe.avg_rating}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "nobody has cooked it yet"}
                    </span>
                    {recipe.author_handle && (
                      <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                        @{recipe.author_handle}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

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

        {similar.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                Cooks like you
              </h2>
              <Link
                href="/people"
                className="text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                See all
              </Link>
            </div>

            {/* Each one says why it is suggesting them. A row of faces with
                follower counts is a popularity chart; what you have in common
                is the only fact that answers "should I follow this person". */}
            <ul className="grid gap-2 sm:grid-cols-2">
              {similar.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center gap-3 rounded-[16px] bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <Link href={`/people/${person.handle}`} className="shrink-0">
                    <Avatar
                      handle={person.handle}
                      displayName={person.display_name}
                      url={person.avatar_url}
                      size={40}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/people/${person.handle}`}
                      className="block truncate text-sm font-extrabold hover:underline"
                    >
                      {person.display_name}
                    </Link>
                    <p className="truncate text-xs font-semibold text-muted-foreground">
                      {person.shared_saves > 0
                        ? `${person.shared_saves} ${person.shared_saves === 1 ? "recipe" : "recipes"} you have both saved`
                        : person.recipe_count > 0
                          ? `${person.recipe_count} ${person.recipe_count === 1 ? "recipe" : "recipes"} shared`
                          : "nothing shared yet"}
                    </p>
                  </div>
                  <FollowButton
                    handle={person.handle}
                    youFollow={person.you_follow === 1}
                    followsYou={false}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
