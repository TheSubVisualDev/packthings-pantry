"use client";

import { useState, useTransition } from "react";
import { addRestock } from "@/app/pantry/list/actions";
import { formatQuantity } from "@/lib/units";
import type { RestockSuggestion } from "@/lib/shopping";

/**
 * Things that have fallen below the number of containers you said to keep.
 *
 * One button for all of them, not one per row. The whole point of setting a
 * target is not deciding again every week - a panel that made you approve each
 * line would just be the list you were trying to avoid writing.
 *
 * Each line says how many packs and what a pack is, because "2" on its own is
 * ambiguous in an aisle and "1000ml of soy sauce" is arithmetic.
 */
export function RestockPanel({ suggestions }: { suggestions: RestockSuggestion[] }) {
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (suggestions.length === 0 || added) return null;

  return (
    <section className="mb-5 rounded-[20px] border border-border bg-surface-raised p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        Running low
      </h2>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        Below what you said to keep on hand.
      </p>

      <ul className="mt-3 space-y-1.5">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.item_id}
            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="min-w-0 font-bold break-words">
              {suggestion.name}
              {suggestion.shop && (
                <span className="ml-2 text-xs font-semibold text-muted-foreground">
                  {suggestion.shop}
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold text-quantity">
              {/* The shortfall is the honest number; the packs are what you
                  actually pick up. Both, because one without the other is
                  either unbuyable or unexplained. */}
              {suggestion.packs !== null ? (
                <>
                  {suggestion.packs}
                  {suggestion.packs === 1 ? " pack" : " packs"}
                  <span className="font-semibold text-muted-foreground">
                    {" · "}
                    {formatQuantity(suggestion.short)}
                    {suggestion.canonical_unit === "count" ? "" : suggestion.canonical_unit}
                    {" short"}
                  </span>
                </>
              ) : (
                <>
                  {formatQuantity(suggestion.short)}
                  {suggestion.canonical_unit === "count" ? "" : suggestion.canonical_unit}
                  <span className="font-semibold text-muted-foreground"> short</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addRestock();
            if (result.ok) setAdded(true);
            else setError(result.error ?? "Couldn't add those.");
          })
        }
        className="mt-4 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
      >
        {pending
          ? "Adding…"
          : `Add all ${suggestions.length} to the list`}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
