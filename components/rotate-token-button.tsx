"use client";

import { useState, useTransition } from "react";
import { newApiKey } from "@/app/settings/actions";

/** Two taps, because rotating breaks whatever is currently using the old key. */
export function RotateTokenButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Issue a new key
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await newApiKey(); setConfirming(false); })}
        className="rounded-[12px] bg-destructive px-3.5 py-2 text-sm font-extrabold text-white disabled:opacity-60"
      >
        {pending ? "Issuing…" : "Yes, replace it"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-sm font-semibold text-muted-foreground"
      >
        Cancel
      </button>
    </span>
  );
}
