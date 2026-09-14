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
export function RestockPanel({
  suggestions,
  filter,
}: {
  suggestions: RestockSuggestion[];
  /** The shop the list is narrowed to, so "Add all" adds only what it showed. */
  filter?: string | null;
}) {
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

      {/*
        Name on its own line, shop and shortfall sharing the one below it -
        always two lines, never one that happens to fit and one that
        doesn't. A short shop name and a long one used to leave the shortfall
        on the same line as one and wrapped under the other, which is a
        ragged list for no reason a shopper would understand.
      */}
      <ul className="mt-3 space-y-2.5">
        {suggestions.map((suggestion) => (
          <li key={suggestion.item_id} className="text-sm">
            <p className="font-bold break-words">{suggestion.name}</p>
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {suggestion.shop ?? "Anywhere"}
              </span>
              <span className="font-semibold text-quantity">
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
            </p>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addRestock(filter);
            if (result.ok) setAdded(true);
            else setError(result.error ?? "Couldn't add those.");
          })
        }
        className="mt-4 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60 print:hidden"
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
