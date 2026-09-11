"use client";

import { useState, useTransition } from "react";
import { addShortfall } from "@/app/pantry/list/actions";

/**
 * Puts everything a recipe is short of onto the shopping list.
 *
 * Offered before cooking as well as after, because "I can't make this tonight,
 * what do I need" is the more common question - the cook flow already knows
 * the answer and until now had nowhere to put it.
 */
export function AddShortfallButton({
  recipeId,
  servings,
}: {
  recipeId: number;
  servings: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="text-center">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addShortfall(recipeId, servings);
            setMessage(result.ok ? (result.message ?? "Added.") : (result.error ?? "Couldn't."));
          })
        }
        className="text-sm font-semibold text-primary underline underline-offset-2 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add what's missing to the shopping list"}
      </button>
      {message && (
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
