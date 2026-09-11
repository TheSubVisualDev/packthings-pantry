"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { setNutrition } from "@/app/pantry/actions";
import type { ItemResult } from "@/app/pantry/actions";
import type { Item } from "@/lib/types";

const FIELDS = [
  { name: "kcal_100", label: "kcal", step: "1" },
  { name: "protein_100", label: "Protein g", step: "any" },
  { name: "carbs_100", label: "Carbs g", step: "any" },
  { name: "fat_100", label: "Fat g", step: "any" },
  { name: "fibre_100", label: "Fibre g", step: "any" },
  { name: "salt_100", label: "Salt g", step: "any" },
] as const;

/**
 * Typing the figures in yourself.
 *
 * The door out of guessing. A standard figure for "cheese" is nothing like a
 * particular cheese, and the person holding the block can read the back of it.
 * What they type outranks the table and any future scan.
 *
 * Folded away until asked, because most items either arrive with a scan or are
 * fine with a guess, and six number boxes under every item would make the page
 * about data entry rather than about food.
 */
export function NutritionEditor({ item }: { item: Item }) {
  const [state, action, saving] = useActionState<ItemResult, FormData>(setNutrition, {
    ok: true,
  });
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
        {item.nutrition_source === null
          ? "Type the figures in"
          : "Correct these by hand"}
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 border-t border-border pt-3">
      <input type="hidden" name="item_id" value={item.id} />

      <p className="text-xs font-bold uppercase tracking-[0.08em] text-label">
        Per {item.canonical_unit === "ml" ? "100ml" : "100g"}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <label
              htmlFor={field.name}
              className="mb-1 block text-xs font-semibold text-muted-foreground"
            >
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="number"
              min="0"
              step={field.step}
              inputMode="decimal"
              defaultValue={item[field.name] ?? ""}
              className="w-full rounded-[12px] border border-border bg-background px-3 py-2 font-semibold outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-[14px] bg-ink px-5 py-2.5 text-sm font-extrabold text-background disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save figures"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-semibold text-muted-foreground"
        >
          Never mind
        </button>
        {state.error && (
          <span role="alert" className="text-sm font-bold text-destructive">
            {state.error}
          </span>
        )}
        {state.message && !state.error && (
          <span className="text-sm font-bold text-muted-foreground">
            {state.message}
          </span>
        )}
      </div>

      <p className="mt-2 text-xs font-semibold text-muted-foreground">
        Yours outrank both the standard table and any later scan. Empty every box
        to clear them and let it be estimated again.
      </p>
    </form>
  );
}
