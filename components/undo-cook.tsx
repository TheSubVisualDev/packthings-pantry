"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoCook } from "@/app/recipes/[id]/actions";

/**
 * Undo, for a cook that is over and off the screen it happened on.
 *
 * The ten-second toast after cooking was the only way to reach `undoCook`, and
 * it lived in component state - so locking the phone, taking a call or a
 * reload took the safety net with it. What is left then is doing the
 * arithmetic by hand against six shelves from memory, which is the exact
 * arithmetic the rest of this app refuses to make anybody do.
 *
 * The event is undone by id, and the row is marked `undone_at` rather than
 * deleted - see AGENTS.md on why the notification is keyed to the cook. The
 * page is re-read afterwards rather than the row hidden locally: undoing puts
 * stock back, and everything else on screen is about that stock.
 */
export function UndoCook({ id, recipeName }: { id: number; recipeName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [undoing, startUndoing] = useTransition();
  const router = useRouter();

  return (
    <span className="flex shrink-0 items-center gap-2">
      {error && (
        <span role="alert" className="text-xs font-bold text-destructive">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={undoing}
        aria-label={`Undo cooking ${recipeName}`}
        onClick={() => {
          setError(null);
          startUndoing(async () => {
            const result = await undoCook(id);
            if (!result.ok) {
              setError(result.error ?? "Couldn't undo that.");
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-[10px] bg-chip px-2.5 py-1.5 text-xs font-extrabold disabled:opacity-50"
      >
        {undoing ? "Putting it back…" : "Undo"}
      </button>
    </span>
  );
}
