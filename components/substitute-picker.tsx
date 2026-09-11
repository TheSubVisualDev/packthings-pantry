"use client";

import { useState } from "react";
import { Repeat2, X } from "lucide-react";
import { describeStock } from "@/lib/containers";
import type { SubstituteOption } from "@/components/cook-panel";

/**
 * Swapping one ingredient for something else on the shelf.
 *
 * Collapsed to a single quiet word until asked, because most lines do not need
 * it and a row of alternatives under every ingredient would bury the recipe.
 *
 * Each option carries what it shares with the original and how much of it there
 * is, so the choice can be made without leaving the page - "shares Soy sauces,
 * 2 sealed + 320ml open" is the whole argument for picking it.
 *
 * The swap lasts for this cook. It is not written to the recipe, because using
 * oat milk tonight because that is what is in does not make it an oat milk
 * recipe.
 */
export function SubstitutePicker({
  options,
  chosen,
  wanted,
  onChoose,
}: {
  options: SubstituteOption[];
  chosen: SubstituteOption | null;
  wanted: string;
  onChoose: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (chosen) {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-primary px-2.5 py-1 text-primary-foreground">
          using {chosen.name}
        </span>
        <button
          type="button"
          onClick={() => onChoose(null)}
          className="flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" strokeWidth={3} />
          back to {wanted}
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <Repeat2 className="h-3.5 w-3.5" strokeWidth={2.5} />
        Substitute
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-[14px] bg-chip p-2.5">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-label">
        Instead of {wanted}
      </p>
      <ul className="space-y-1">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => {
                onChoose(option.id);
                setOpen(false);
              }}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded-[10px] px-2 py-1.5 text-left hover:bg-card"
            >
              <span className="text-sm font-bold">{option.name}</span>
              <span className="text-xs font-semibold text-muted-foreground">
                {describeStock(option.level)}
                {option.shared.length > 0 && ` · shares ${option.shared.join(", ")}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1 px-2 text-xs font-semibold text-muted-foreground"
      >
        Never mind
      </button>
    </div>
  );
}
