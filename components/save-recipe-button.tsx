"use client";

import { useState, useTransition } from "react";
import { saveToMine } from "@/app/social/actions";

/**
 * Takes a copy of someone else's recipe.
 *
 * A copy rather than a bookmark, because the first thing anyone does with
 * another person's recipe is change something about it - and because the
 * ingredient names then resolve against your own shelves rather than theirs.
 */
export function SaveRecipeButton({ recipeId }: { recipeId: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await saveToMine(recipeId);
            if (!result.ok) setError(result.error ?? "Couldn't save that.");
          })
        }
        className="w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Copying…" : "Save to my recipes"}
      </button>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">
        Makes your own copy, private, that you can change however you like.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
