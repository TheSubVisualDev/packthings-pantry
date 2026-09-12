import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { NearlyCard, SuggestionRow, TonightCard } from "@/components/tonight-card";
import { getTonightFacts } from "@/lib/queries";
import { getRecipeTags, getTagsByRecipe } from "@/lib/recipe-tags";
import { nearlyThere, rankTonight } from "@/lib/tonight";
import { RecipeFilters } from "@/components/recipe-filters";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TonightPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; within?: string; servings?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const { tag, within, servings } = await searchParams;
  const wantedTag = tag?.trim() || null;
  const wantedWithin =
    Number.isFinite(Number(within)) && Number(within) > 0 ? Number(within) : null;
  const forServings =
    Number.isFinite(Number(servings)) && Number(servings) > 0 ? Number(servings) : 2;

  const [facts, myTags] = await Promise.all([
    getTonightFacts(kitchen.id, context.user.id),
    getRecipeTags(context.user.id),
  ]);

  const tagsByRecipe = await getTagsByRecipe(facts.map((each) => each.id));

  /**
   * Filters narrow what is considered, they do not re-rank it.
   *
   * "Something Asian" is a constraint on the answer rather than another signal
   * to weigh - if you have said Asian, a brilliantly-scoring shepherd's pie is
   * not a better answer, it is the wrong answer.
   */
  const considered = facts.filter((recipe) => {
    if (wantedTag) {
      const carried = (tagsByRecipe.get(recipe.id) ?? []).map((each) =>
        each.name.toLowerCase(),
      );
      if (!carried.includes(wantedTag.toLowerCase())) return false;
    }
    if (wantedWithin !== null) {
      // Untimed is unknown, not quick. Asking for fifteen minutes must not
      // return everything nobody has bothered to time.
      if (recipe.minutes === null || recipe.minutes > wantedWithin) return false;
    }
    return true;
  });

  const ranked = rankTonight(considered);
  const [best, ...rest] = ranked;

  /**
   * Only offered once something can actually be cooked.
   *
   * A kitchen with nothing makeable wants a shopping list, not a card saying
   * it is nearly there - and the shortfall on the main card already covers
   * that case.
   */
  const nearly = best ? nearlyThere(considered, [best.id]) : null;

  const filtered = wantedTag !== null || wantedWithin !== null;

  return (
    <>
      <SiteHeader active="tonight" meta={`${ranked.length} to choose from`} />

      <div className="mx-auto w-full max-w-[720px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <h1 className="mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          What to cook
        </h1>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">
          Ranked on what is going off, what you have, and what you had recently.
        </p>

        <RecipeFilters
          tags={myTags.map((each) => each.name)}
          activeTag={wantedTag}
          activeWithin={wantedWithin}
          term=""
          basePath="/tonight"
        />

        {!best ? (
          <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-muted-foreground">
              {filtered
                ? "Nothing in your cookbook matches that."
                : "Nothing in your cookbook yet, so there is nothing to suggest."}
            </p>
            <Link
              href={filtered ? "/tonight" : "/recipes"}
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              {filtered ? "Drop the filters" : "Go to your cookbook"}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <TonightCard suggestion={best} servings={forServings} />
            {nearly && <NearlyCard suggestion={nearly} servings={forServings} />}

            {rest.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer list-none rounded-[14px] bg-chip px-4 py-3 text-center text-sm font-bold hover:bg-border">
                  Other ideas ({rest.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {rest.map((suggestion) => (
                    <SuggestionRow key={suggestion.id} suggestion={suggestion} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
