"use client";

import { useState, useTransition } from "react";
import { BookOpen, BookmarkCheck } from "lucide-react";
import {
  addRecipeToCookbook,
  removeRecipeFromCookbook,
} from "@/app/recipes/[id]/cookbook-actions";

/**
 * Adding a recipe to the kitchen's cookbook, or taking it out.
 *
 * This used to be the one place the app asked which jar an ingredient meant,
 * in a sheet of "ingredients to check" before a recipe could be adopted. v2
 * stopped tracking stock (18 Oct 2026), so there is nothing to link and
 * nothing to ask: it is a toggle.
 */
export function CookbookButton({
  recipeId,
  inCookbook,
}: {
  recipeId: number;
  inCookbook: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (inCookbook) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await removeRecipeFromCookbook(recipeId);
              if (!result.ok) setError(result.error ?? "Couldn't remove that.");
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-chip px-4 py-3 text-sm font-bold disabled:opacity-60"
        >
          <BookmarkCheck className="h-4 w-4" strokeWidth={2.5} />
          {pending ? "Removing…" : "In your cookbook"}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await addRecipeToCookbook(recipeId);
            if (!result.ok) setError(result.error ?? "Couldn't add that.");
          })
        }
        data-track="recipe.save"
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
      >
        <BookOpen className="h-4 w-4" strokeWidth={2.5} />
        {pending ? "Adding…" : "Add to cookbook"}
      </button>
      <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
        Puts it in the kitchen&rsquo;s cookbook, where the week planner can pick it.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
