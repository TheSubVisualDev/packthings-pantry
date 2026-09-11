"use client";

import { useState, useTransition } from "react";
import { publish } from "@/app/social/actions";
import { VISIBILITIES, VISIBILITY_BLURB, VISIBILITY_LABEL, type Visibility } from "@/lib/social";

/**
 * Who can see this recipe.
 *
 * Shown only to the author, and only on their own recipes. New recipes start
 * private, so putting one on the discover page is always a deliberate act
 * rather than something that happened while you weren't looking.
 */
export function RecipeVisibility({
  recipeId,
  current,
}: {
  recipeId: number;
  current: Visibility;
}) {
  const [visibility, setVisibility] = useState<Visibility>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
        Who can see it
      </h2>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {VISIBILITIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={visibility === option}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await publish(recipeId, option);
                if (result.ok) {
                  setVisibility(option);
                  setError(null);
                } else {
                  setError(result.error ?? "Couldn't change that.");
                }
              })
            }
            className={`rounded-full px-3.5 py-2 text-sm font-bold disabled:opacity-60 ${
              visibility === option
                ? "bg-primary text-primary-foreground"
                : "bg-chip text-muted-foreground"
            }`}
          >
            {VISIBILITY_LABEL[option]}
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-sm font-medium text-muted-foreground">
        {VISIBILITY_BLURB[visibility]}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
