"use client";

import { useState, useTransition } from "react";
import { setBlocked } from "@/app/social/actions";

/**
 * Blocking, behind a confirmation.
 *
 * It cuts both ways and drops any follow in either direction, so it's worth
 * one extra tap to be sure - and worth saying so before it happens.
 */
export function BlockButton({
  handle,
  blocked,
}: {
  handle: string;
  blocked: boolean;
}) {
  const [isBlocked, setIsBlocked] = useState(blocked);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    startTransition(async () => {
      const result = await setBlocked(handle, next);
      if (result.ok) {
        setIsBlocked(next);
        setConfirming(false);
      }
    });
  }

  if (isBlocked) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => apply(false)}
        className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {pending ? "…" : `Unblock @${handle}`}
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-muted-foreground/70 hover:text-destructive"
      >
        Block
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-muted-foreground">
        Hides their recipes from you and yours from them, and unfollows both ways.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => apply(true)}
        className="rounded-[12px] bg-destructive px-3.5 py-2 text-sm font-extrabold text-white disabled:opacity-60"
      >
        {pending ? "…" : "Block"}
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
