"use client";

import { useState, useTransition } from "react";
import { ShoppingBasket } from "lucide-react";
import { addShortfall } from "@/app/pantry/list/actions";

/**
 * Puts everything a recipe is short of onto the shopping list.
 *
 * Offered before cooking as well as after, because "I can't make this tonight,
 * what do I need" is the more common question - the cook flow already knows
 * the answer and until now had nowhere to put it.
 *
 * It is also the only thing that starts a shopping trip, which is why it has
 * two looks. In the cook panel it is a quiet link under a dense list of
 * ingredients and should stay one. On the card that answers "what's for
 * dinner" it was the same quiet link, and in the app's whole life it had been
 * pressed zero times - `pinned_recipes` had never held a row - so on that card
 * it is a button now, with the number of things on it, because "short 4
 * things" is the reason to press it and it was not being said.
 */
export function AddShortfallButton({
  recipeId,
  servings,
  /** How many lines the shelves cannot supply, when the caller knows. */
  missing,
  tone = "link",
}: {
  recipeId: number;
  servings: number;
  missing?: number;
  tone?: "link" | "button";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const press = () =>
    startTransition(async () => {
      const result = await addShortfall(recipeId, servings);
      setMessage(result.ok ? (result.message ?? "Added.") : (result.error ?? "Couldn't."));
    });

  const label = pending
    ? "Adding…"
    : tone === "button"
      ? missing && missing > 0
        ? `Shop for it — ${missing} ${missing === 1 ? "thing" : "things"}`
        : "Shop for it"
      : "Add what's missing to the shopping list";

  return (
    <div className="text-center">
      <button
        type="button"
        disabled={pending}
        onClick={press}
        className={
          tone === "button"
            ? "flex w-full items-center justify-center gap-2 rounded-[14px] bg-chip px-4 py-3 text-sm font-extrabold disabled:opacity-60"
            : "text-sm font-semibold text-primary underline underline-offset-2 disabled:opacity-60"
        }
      >
        {tone === "button" && !pending && (
          <ShoppingBasket className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        )}
        {label}
      </button>
      {message && (
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
