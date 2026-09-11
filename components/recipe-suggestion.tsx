import Link from "next/link";
import type { RecipeWithMatch } from "@/lib/queries";

export function Stars({
  rating,
  className = "",
}: {
  rating: number | null;
  className?: string;
}) {
  if (rating === null) return <span className={className}>Unrated</span>;
  return (
    <span className={className} aria-label={`Rated ${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="opacity-35">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * The accent "Top match" card from the artboards - the first suggestion only.
 */
export function TopMatchCard({ recipe }: { recipe: RecipeWithMatch }) {
  const missing = recipe.total - recipe.have;
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block rounded-[20px] bg-primary p-[18px] text-primary-foreground sm:rounded-[22px] sm:p-[22px]"
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">
        {missing === 0 ? "Ready to cook" : "Top match"}
      </div>
      <div className="my-1 text-[19px] font-extrabold tracking-[-0.01em] sm:mt-1.5 sm:mb-2 sm:text-2xl sm:tracking-[-0.02em]">
        {recipe.name}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold opacity-90 sm:gap-2.5 sm:text-sm">
        <Stars rating={recipe.avg_rating} />
        <span>
          {recipe.have}/{recipe.total} in stock
        </span>
        <span>serves {recipe.base_servings}</span>
      </div>
    </Link>
  );
}

/** White suggestion card for the runners-up. */
export function SuggestionCard({ recipe }: { recipe: RecipeWithMatch }) {
  const missing = recipe.total - recipe.have;
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block rounded-[20px] bg-card p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="text-lg font-extrabold tracking-[-0.01em]">
        {recipe.name}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[13px] font-semibold text-muted-foreground">
        <Stars rating={recipe.avg_rating} />
        {missing > 0 ? (
          <span className="text-destructive">{missing} missing</span>
        ) : (
          <span>
            {recipe.have}/{recipe.total} in stock
          </span>
        )}
        <span>serves {recipe.base_servings}</span>
      </div>
    </Link>
  );
}
