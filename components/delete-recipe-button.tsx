"use client";

import { useState, useTransition } from "react";
import { removeRecipe } from "@/app/recipes/actions";

/**
 * Deleting takes two taps. Cooking history cascades with the recipe, so this
 * throws away more than the page shows, and it isn't something to do by
 * brushing a button on a phone.
 */
export function DeleteRecipeButton({
  recipeId,
  recipeName,
}: {
  recipeId: number;
  recipeName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-destructive"
      >
        Delete this recipe
      </button>
    );
  }

  return (
    <div className="rounded-[20px] bg-[oklch(0.96_0.03_40)] p-5">
      <p className="text-sm font-bold text-destructive">
        Delete {recipeName}? Its cooking history goes with it.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await removeRecipe(recipeId); })}
          className="rounded-[12px] bg-destructive px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete it"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-[12px] bg-card px-4 py-2.5 text-sm font-bold"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
