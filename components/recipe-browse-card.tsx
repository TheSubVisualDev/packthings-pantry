import { displayTitle } from "@/lib/recipe-display";
import Image from "next/image";
import Link from "next/link";
import { recipeTint } from "@/lib/tint";
import type { RecipeWithAuthor } from "@/lib/types";

/**
 * A recipe in a list, at the size a phone can actually show several of.
 *
 * This was a 132px-tall card with the image taking 44% of the width. On a
 * phone that left the title about 180px to live in, so a real recipe name
 * wrapped to four lines and one card filled half the screen - you could see
 * two recipes at a time in a list whose entire job is comparing them.
 *
 * So: a small square thumbnail, the title with room to be a title, and the
 * facts on one line underneath. Roughly a third of the height, three or four
 * visible at once, and the thumbnail grows on desktop where there is width
 * going spare rather than shrinking the words.
 */
/**
 * What this card actually reads, rather than a whole recipe.
 *
 * It asked for RecipeWithAuthor, which meant the three Discover queries that
 * each select their own narrower shape could not use it - so they grew their
 * own cards instead, and the badge rules drifted apart. Asking for the eight
 * fields it draws is what lets one card serve every list.
 */
export type BrowsableRecipe = Pick<
  RecipeWithAuthor,
  | "id"
  | "name"
  | "photo_url"
  | "prep_minutes"
  | "cook_minutes"
  | "base_servings"
  | "author_handle"
  | "avg_rating"
>;

export function RecipeBrowseCard({
  recipe,
  showAuthor = true,
  match,
  tags = [],
  note,
  states = [],
}: {
  recipe: BrowsableRecipe;
  showAuthor?: boolean;
  /** How much of it your kitchen already has, on your own collection. */
  match?: { have: number; total: number };
  /**
   * What to file it under, at a glance.
   *
   * Typed and derived tags arrive already mixed and already ordered, because a
   * card has room for about two and which two is a decision for whoever built
   * the list, not for the card.
   */
  tags?: string[];
  /**
   * A line to print instead of the time-and-servings one.
   *
   * Discover had three hand-rolled copies of this card because its sections
   * each wanted to say something different on that line - why a recipe is
   * being suggested, or how many people have cooked it - and the card only
   * knew how to say one thing. Three copies meant three sets of badge rules
   * and only one of them showing the cupboard, which is how the most useful
   * fact on the page came to be missing from two thirds of it.
   */
  note?: string;
  /**
   * Your relationship to this recipe, as pills: saved, in your cookbook, whose
   * it is. Outlined rather than filled, unless `solid` - the distinction the
   * rest of the app makes between a fact and a state you are in.
   */
  states?: { label: string; solid?: boolean }[];
}) {
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      /* Every list of recipes in the app goes through this card, so counting
         the open here counts it from the feed, the search and the cookbook
         alike - and the page it was pressed on says which. */
      data-track="recipe.open"
      /* card-press, because a card is a button in everything but tag
         name - and on a phone the press is the only feedback there is. */
      className="card-press flex items-center gap-3 rounded-[18px] bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_22px_-10px_rgba(60,44,30,0.45)]"
    >
      <div
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] sm:h-20 sm:w-20"
        style={recipe.photo_url ? undefined : { background: recipeTint(recipe.id) }}
      >
        {recipe.photo_url && (
          <Image
            src={recipe.photo_url}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-extrabold tracking-[-0.01em]">
          {displayTitle(recipe.name)}
        </h3>

        {/* One line, and the things people actually compare on. The blurb went:
            it was two more lines of the card for text nobody reads while
            choosing between four recipes. */}
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {note ??
            [
              minutes > 0 ? `${minutes} min` : null,
              `serves ${recipe.base_servings}`,
              showAuthor && recipe.author_handle ? `@${recipe.author_handle}` : null,
              recipe.avg_rating !== null ? `★ ${recipe.avg_rating}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {match && match.total > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                match.have === match.total
                  ? "bg-primary text-primary-foreground"
                  : "bg-chip text-muted-foreground"
              }`}
            >
              {match.have === match.total
                ? "you have everything"
                : `${match.have}/${match.total} in stock`}
            </span>
          )}
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {states.map((state) => (
            <span
              key={state.label}
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                state.solid
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {state.label}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
