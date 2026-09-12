import Link from "next/link";
import { AlarmClock, ShoppingBasket } from "lucide-react";
import { AddShortfallButton } from "@/components/add-shortfall-button";
import type { Suggestion } from "@/lib/tonight";

/**
 * The answer, with its reasoning on it.
 *
 * One card rather than a list, because a list is the app declining to decide
 * and that is exactly what it has been doing. The reason is not decoration:
 * a recommendation nobody can check is a magic trick, and magic tricks are not
 * trusted twice.
 */
export function TonightCard({
  suggestion,
  servings,
}: {
  suggestion: Suggestion;
  /** What the shortfall button should buy for, when there is a shortfall. */
  servings: number;
}) {
  const urgent = suggestion.rescues.length > 0;

  return (
    <article className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-label">
          Tonight
        </span>
        {urgent && (
          <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            <AlarmClock className="h-3 w-3" strokeWidth={3} />
            use it up
          </span>
        )}
      </div>

      <Link
        href={`/recipes/${suggestion.id}`}
        className="text-[22px] font-extrabold tracking-[-0.02em] break-words hover:underline"
      >
        {suggestion.name}
      </Link>

      <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
        {suggestion.reason}
      </p>

      <Link
        href={`/recipes/${suggestion.id}`}
        className="mt-4 block w-full rounded-[14px] bg-primary px-4 py-3.5 text-center text-[15px] font-extrabold text-primary-foreground"
      >
        Cook it
      </Link>

      {suggestion.missing.length > 0 && (
        <div className="mt-2">
          <AddShortfallButton recipeId={suggestion.id} servings={servings} />
        </div>
      )}
    </article>
  );
}

/**
 * The best thing you are one ingredient short of.
 *
 * Its own card rather than second place, because "one shop away" is a
 * different kind of answer from "cook this now" and putting it in the list
 * makes it read as a worse version of the winner. Names the single item, so
 * the decision is "do I want to buy tahini" rather than "what am I missing".
 */
export function NearlyCard({
  suggestion,
  servings,
}: {
  suggestion: Suggestion;
  servings: number;
}) {
  return (
    <article className="rounded-[20px] border border-dashed border-border p-5">
      <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-label">
        <ShoppingBasket className="h-3.5 w-3.5" strokeWidth={3} />
        One thing away
      </div>

      <Link
        href={`/recipes/${suggestion.id}`}
        className="text-[17px] font-extrabold tracking-[-0.01em] break-words hover:underline"
      >
        {suggestion.name}
      </Link>

      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        {suggestion.reason}
      </p>

      <div className="mt-3">
        <AddShortfallButton recipeId={suggestion.id} servings={servings} />
      </div>
    </article>
  );
}

/** A runner-up, for the list behind the tap. */
export function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  return (
    <Link
      href={`/recipes/${suggestion.id}`}
      className="block rounded-[16px] bg-card px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_22px_-10px_rgba(60,44,30,0.45)]"
    >
      <p className="text-[15px] font-extrabold tracking-[-0.01em] break-words">
        {suggestion.name}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
        {suggestion.reason}
      </p>
    </Link>
  );
}
