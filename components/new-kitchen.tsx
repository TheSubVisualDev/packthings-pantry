"use client";

import { useActionState, useState } from "react";
import { makeKitchen, type KitchenResult } from "@/app/kitchens/actions";

/** Tucked behind a link: most people will only ever have one kitchen. */
export function NewKitchen() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<KitchenResult, FormData>(
    makeKitchen,
    { ok: true },
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Add another kitchen
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
