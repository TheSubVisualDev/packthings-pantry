import Image from "next/image";
import Link from "next/link";
import type { RecipeWithAuthor } from "@/lib/types";

/**
 * A stable colour for a recipe with no photo.
 *
 * Derived from the id so it never changes, and kept inside the warm half of
 * the wheel so a wall of these still looks like one app. The point is only
 * that two recipes don't look identical at a glance - which is most of what a
 * photo would be doing anyway, before anyone has uploaded one.
 */
function placeholder(id: number): string {
  const hue = 20 + ((id * 47) % 90);
  return `linear-gradient(135deg, oklch(0.82 0.09 ${hue}), oklch(0.58 0.13 ${hue - 12}))`;
}

/**
 * A recipe as it appears to someone browsing rather than cooking.
 *
 * The photo occupies the left of the card and fades out across it, so the
 * title sits on the card's own colour rather than on top of an image. Leads
 * with who wrote it, because on a discover page that's the thing you're
 * actually deciding on - whose cooking you trust.
 */
export function RecipeBrowseCard({
  recipe,
  showAuthor = true,
  match,
}: {
  recipe: RecipeWithAuthor;
  showAuthor?: boolean;
  /** How much of it your kitchen already has, on your own collection. */
  match?: { have: number; total: number };
}) {
  const timing = [
    recipe.prep_minutes ? `${recipe.prep_minutes} prep` : null,
    recipe.cook_minutes ? `${recipe.cook_minutes} cooking` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="relative flex min-h-[132px] overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_22px_-10px_rgba(60,44,30,0.45)]"
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[58%]"
        style={{
          // The mask is what does the fading: the image is painted normally and
          // then dissolved to nothing before it reaches the text.
          maskImage: "linear-gradient(to right, black 45%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, black 45%, transparent 100%)",
        }}
      >
        {recipe.photo_url ? (
          <Image
            src={recipe.photo_url}
            alt=""
            fill
            sizes="(max-width: 640px) 60vw, 260px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full" style={{ background: placeholder(recipe.id) }} />
        )}
      </div>

      <div className="relative ml-[34%] flex min-w-0 flex-1 flex-col justify-center p-4 sm:p-5">
        <h3 className="text-[17px] font-extrabold tracking-[-0.01em] break-words">
          {recipe.name}
        </h3>

        {recipe.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed font-medium text-muted-foreground">
            {recipe.description}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-muted-foreground">
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

        {match && match.total > 0 && (
          <div className="mt-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                match.have === match.total
                  ? "bg-primary text-primary-foreground"
                  : "bg-chip text-muted-foreground"
              }`}
            >
              {match.have === match.total
                ? "You have everything"
                : `${match.have} of ${match.total} in stock`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
