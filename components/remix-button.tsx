"use client";

import { useState, useTransition } from "react";
import { GitFork } from "lucide-react";
import { remix } from "@/app/social/actions";

/**
 * Takes a copy of a recipe to work on.
 *
 * A copy rather than a bookmark, because the first thing anyone does with
 * another person's recipe is change something about it - and because the
 * ingredient names then resolve against your own shelves rather than theirs.
 *
 * Offered on your own recipes too, quietly, where it is how you try a variation
 * without losing the version that already works.
 */
export function RemixButton({
  recipeId,
  yours,
}: {
  recipeId: number;
  /** Your own reads as a variation; somebody else's reads as taking a copy. */
  yours: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await remix(recipeId);
            if (!result.ok) setError(result.error ?? "Couldn't copy that.");
          })
        }
        className={
          yours
            ? "flex w-full items-center justify-center gap-2 rounded-[14px] bg-chip px-4 py-3 text-sm font-bold disabled:opacity-60"
            : "flex w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
        }
      >
        <GitFork className="h-4 w-4" strokeWidth={2.5} />
        {pending
          ? "Copying…"
          : yours
            ? "Remix this into a variation"
            : "Remix it into my recipes"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
      {!yours && !error && (
        <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
          Yours to change, credited back to whoever wrote it.
        </p>
      )}
    </div>
  );
}
