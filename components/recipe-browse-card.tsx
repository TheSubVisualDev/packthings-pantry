import Image from "next/image";
import Link from "next/link";
import type { RecipeWithAuthor } from "@/lib/types";

/**
 * A stable colour for a recipe with no photo.
 *
 * Derived from the id so it never changes, and kept inside the warm half of
 * the wheel so a wall of these still looks like one app.
 *
 * A flat tint rather than the gradient-behind-a-mask this used to be. That
 * version rendered as a solid black block on iOS - a masked element whose only
 * content is a CSS gradient is exactly the combination Safari is worst at -
 * and a decoration that can fail closed to black is not worth the risk on the
 * one platform this app is mostly used on.
 */
function placeholder(id: number): string {
  const hue = 20 + ((id * 47) % 90);
  return `oklch(0.88 0.06 ${hue})`;
}

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
export function RecipeBrowseCard({
  recipe,
  showAuthor = true,
  match,
  tags = [],
}: {
  recipe: RecipeWithAuthor;
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
}) {
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex items-center gap-3 rounded-[18px] bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_22px_-10px_rgba(60,44,30,0.45)]"
    >
      <div
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] sm:h-20 sm:w-20"
        style={recipe.photo_url ? undefined : { background: placeholder(recipe.id) }}
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
          {recipe.name}
        </h3>

        {/* One line, and the things people actually compare on. The blurb went:
            it was two more lines of the card for text nobody reads while
            choosing between four recipes. */}
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {[
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
        </div>
      </div>
    </Link>
  );
}
