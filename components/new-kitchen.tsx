"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { makeKitchen, type KitchenResult } from "@/app/kitchens/actions";

/**
 * Tucked behind a button where you already have a kitchen, and shown outright
 * where you have none - there it isn't an extra, it's the thing to do.
 *
 * It was grey underlined text reading "Add another kitchen", at the foot of
 * the last card on the page, and somebody looking for how to make a kitchen
 * did not find it. A second kitchen is a rare thing to want and the button
 * stays quiet for that reason, but quiet means outlined and tappable rather
 * than disguised as a footnote.
 */
export function NewKitchen({ alwaysOpen = false }: { alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen);
  const [state, action, pending] = useActionState<KitchenResult, FormData>(
    makeKitchen,
    { ok: true },
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[14px] border border-border bg-card px-4 py-2.5 text-sm font-extrabold text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
        New kitchen
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input
        name="name"
        placeholder="The flat, Mum's, the caravan…"
        aria-label="Kitchen name"
        maxLength={60}
        className="min-w-44 flex-1 rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Making…" : "Create"}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm font-bold text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
