"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { estimateNutrition } from "@/app/pantry/actions";

/**
 * Fills in standard figures for stock no barcode covers.
 *
 * A button, not a background job. These are what carrots are usually like
 * rather than what yours are, and that is a judgement somebody should make on
 * purpose - and then see the list of what was assumed, which is why the result
 * names every guess and what it was taken to be.
 */
export function EstimateButton({ missing }: { missing: number }) {
  const [filled, setFilled] = useState<{ name: string; basis: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (missing === 0 && filled === null) return null;

  if (filled) {
    return (
      <div className="print:hidden mt-3 rounded-[14px] bg-chip p-3">
        <p className="text-sm font-bold">
          {filled.length === 0
            ? "Nothing here matched anything in the table."
            : `Estimated ${filled.length}.`}
        </p>
        {filled.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs font-semibold text-muted-foreground">
            {filled.map((entry) => (
              <li key={entry.name}>
                {entry.name} — taken as {entry.basis}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await estimateNutrition();
            if (result.ok) setFilled(result.filled ?? []);
            else setError(result.error ?? "Couldn't estimate those.");
          })
        }
        className="flex items-center gap-2 rounded-full bg-chip px-3.5 py-2 text-xs font-bold hover:bg-border disabled:opacity-60"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
        {pending
          ? "Estimating…"
          : `Estimate the ${missing} with no figures`}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
