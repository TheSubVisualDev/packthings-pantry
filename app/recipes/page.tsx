import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { Segmented } from "@/components/ui/segmented";
import { getMyRecipes, getRecipesWithMatches, getSavedRecipes } from "@/lib/queries";
import { getCookbookIds } from "@/lib/cookbook";
import { RecipeFilters } from "@/components/recipe-filters";
import {
  derivedTags,
  getRecipeTags,
  getTagsByRecipe,
  totalMinutes,
} from "@/lib/recipe-tags";
import { currentKitchen } from "@/lib/session";
import type { RecipeWithAuthor } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Three collections that were one list and a footnote.
 *
 * Cooking, saved and wrote are three different relationships to a recipe and
 * the database has stored them separately since phase 2 - `cookbook`,
 * `recipe_likes`, `recipes.author_id`. The page showed the first, appended the
 * third under a heading, and never showed the second at all, which made the
 * save button on somebody else's recipe a thing you could press and then never
 * find again.
 */
const VIEWS = ["cooking", "saved", "wrote"] as const;
type View = (typeof VIEWS)[number];

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; within?: string; view?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // No kitchen is fine here: your recipes are yours, not a kitchen's. The
  // "what can I cook" counts simply come back empty.
  const kitchen = context.kitchen;

  const { q, tag, within, view } = await searchParams;
  const term = q?.trim() ?? "";
  const wantedTag = tag?.trim() || null;
  // A nonsense ?within= is no filter rather than an error page: a URL somebody
  // edited by hand should degrade to the unfiltered list.
  const wantedWithin = Number.isFinite(Number(within)) && Number(within) > 0
    ? Number(within)
    : null;
  const activeView: View = VIEWS.includes(view as View) ? (view as View) : "cooking";

  const [everything, saved, mine, adopted, myTags] = await Promise.all([
    getRecipesWithMatches(kitchen?.id ?? null, context.user.id, term),
    getSavedRecipes(context.user.id, term),
    getMyRecipes(context.user.id, term),
    getCookbookIds(kitchen?.id ?? null),
    getRecipeTags(context.user.id),
  ]);

  const tagsByRecipe = await getTagsByRecipe([
    ...everything.map((recipe) => recipe.id),
    ...saved.map((recipe) => recipe.id),
    ...mine.map((recipe) => recipe.id),
  ]);

  /**
   * What to show on a card: the typed tags first, then the derived ones.
   *
   * Typed first because somebody chose them, and a card only has room for
   * about three. The derived ones are still there on the recipe itself.
   */
  const cardTags = (recipeId: number, recipe: { prep_minutes: number | null; cook_minutes: number | null; base_servings: number }) => [
    ...(tagsByRecipe.get(recipeId) ?? []).map((each) => each.name),
    // Not the time bucket: the card already prints the real total on the line
    // above, and "90 mins" under "50 min" reads as a disagreement rather than
    // as the bucket it is.
    ...derivedTags(recipe, [], [])
      .filter((each) => each.kind !== "time")
      .map((each) => each.label),
  ];

  /**
   * The tag and time filters, applied to whichever collection is on screen.
   *
   * Run over all three rather than only the visible one, so the counts on the
   * tabs answer "where are the Thai ones" rather than contradicting the list
   * under them.
   */
  function narrow<T extends RecipeWithAuthor>(list: T[]): T[] {
    return list.filter((recipe) => {
      if (wantedTag) {
        const carried = (tagsByRecipe.get(recipe.id) ?? []).map((each) =>
          each.name.toLowerCase(),
        );
        if (!carried.includes(wantedTag.toLowerCase())) return false;
      }
      if (wantedWithin !== null) {
        const minutes = totalMinutes(recipe);
        // An untimed recipe is not "quick", it is unknown. Filtering for speed
        // must not hand back everything nobody has bothered to time.
        if (minutes === null || minutes > wantedWithin) return false;
      }
      return true;
    });
  }

  const cooking = narrow(everything);
  const savedByYou = narrow(saved);
  const written = narrow(mine);

  const shown: RecipeWithAuthor[] =
    activeView === "saved" ? savedByYou : activeView === "wrote" ? written : cooking;

  const filtered = wantedTag !== null || wantedWithin !== null;
  const searched = term.length > 0;

  /** Keeps the search and the filters when you change tab. */
  const hrefFor = (next: View) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (wantedTag) params.set("tag", wantedTag);
    if (wantedWithin !== null) params.set("within", String(wantedWithin));
    if (next !== "cooking") params.set("view", next);
    const query = params.toString();
    return query ? `/recipes?${query}` : "/recipes";
  };

  const empty = {
    cooking: {
      line: "Nothing in your cookbook yet.",
      action: "Find one to cook",
      href: "/discover",
    },
    saved: {
      line: "Nothing saved yet. The star on somebody else's recipe puts it here.",
      action: "See what others cook",
      href: "/discover",
    },
    wrote: {
      line: "You have not written one yet.",
      action: "Write one",
      href: "/recipes/new",
    },
  }[activeView];

  return (
    <>
      <SiteHeader
        active="recipes"
        meta={`${shown.length} ${shown.length === 1 ? "recipe" : "recipes"}`}
      />

      <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            Your cookbook
          </h1>
          {/* Three equally-weighted chips wrapped onto two lines on a phone
              and read as the main thing on the page, which none of them is -
              writing a recipe already has the FAB, and Cooked is a history you
              visit occasionally. One quiet link, and the rest live where they
              belong. */}
          <Link
            href="/cooked"
            className="flex min-h-11 shrink-0 items-center text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            Cooked →
          </Link>
        </div>

        <div className="mb-4">
          <Segmented
            label="Which recipes"
            active={activeView}
            options={[
              {
                key: "cooking",
                label: "Cooking",
                href: hrefFor("cooking"),
                meta: String(cooking.length),
              },
              {
                key: "saved",
                label: "Saved",
                href: hrefFor("saved"),
                meta: String(savedByYou.length),
              },
              {
                key: "wrote",
                label: "Wrote",
                href: hrefFor("wrote"),
                meta: String(written.length),
              },
            ]}
          />
        </div>

        <Suspense>
          <SearchBox basePath="/recipes" placeholder="Find one of yours" />
        </Suspense>

        <RecipeFilters
          tags={myTags.map((each) => each.name)}
          activeTag={wantedTag}
          activeWithin={wantedWithin}
          term={term}
        />

        {shown.length === 0 ? (
          <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              {searched || filtered ? "Nothing here matches that." : empty.line}
            </p>
            <Link
              href={searched || filtered ? hrefFor(activeView) : empty.href}
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              {searched || filtered ? "Drop the search" : empty.action}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-label">
              {searched || filtered
                ? `${shown.length} ${shown.length === 1 ? "match" : "matches"}`
                : activeView === "cooking"
                  ? "Cook with what you have"
                  : activeView === "saved"
                    ? "Saved off other people"
                    : "Written by you"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((recipe) => (
                <RecipeBrowseCard
                  key={recipe.id}
                  recipe={recipe}
                  // Your own name on your own recipes is noise; on something
                  // you saved, whose it is is half of why you saved it.
                  showAuthor={activeView === "saved"}
                  match={
                    "have" in recipe && "total" in recipe
                      ? {
                          have: (recipe as { have: number }).have,
                          total: (recipe as { total: number }).total,
                        }
                      : undefined
                  }
                  tags={[
                    // A recipe you wrote and never adopted is not in your
                    // cookbook and cannot be cooked from your shelves, which
                    // is worth saying on the card rather than in a footnote
                    // under a second list.
                    ...(activeView !== "cooking" && !adopted.has(recipe.id)
                      ? ["not in your cookbook"]
                      : []),
                    ...cardTags(recipe.id, recipe),
                  ]}
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
