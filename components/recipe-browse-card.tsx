import Link from "next/link";
import type { RecipeWithAuthor } from "@/lib/types";

/**
 * A recipe as it appears to someone browsing rather than cooking.
 *
 * Leads with who wrote it, because on a discover page that's the thing you're
 * actually deciding on - whose cooking you trust.
 */
export function RecipeBrowseCard({
  recipe,
  showAuthor = true,
}: {
  recipe: RecipeWithAuthor;
  showAuthor?: boolean;
}) {
  const timing = [
    recipe.prep_minutes ? `${recipe.prep_minutes} prep` : null,
    recipe.cook_minutes ? `${recipe.cook_minutes} cooking` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex flex-col rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_6px_18px_-8px_rgba(60,44,30,0.4)]"
    >
      <h3 className="text-[17px] font-extrabold tracking-[-0.01em] break-words">
        {recipe.name}
      </h3>

      {recipe.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed font-medium text-muted-foreground">
          {recipe.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-muted-foreground">
        {showAuthor && recipe.author_handle && (
          <span className="font-bold text-foreground">@{recipe.author_handle}</span>
        )}
        <span>serves {recipe.base_servings}</span>
        {timing.length > 0 && <span>{timing.join(" + ")} min</span>}
        {recipe.avg_rating !== null && (
          <span className="text-primary">
            ★ {recipe.avg_rating}
            {recipe.rating_count > 1 && ` (${recipe.rating_count})`}
          </span>
        )}
        {recipe.times_cooked > 0 && <span>cooked {recipe.times_cooked}&times;</span>}
      </div>
    </Link>
  );
}
