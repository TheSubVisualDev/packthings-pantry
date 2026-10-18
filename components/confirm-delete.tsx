"use client";

import { useState, useTransition } from "react";

/**
 * A delete that takes two taps, as delete-recipe-button.tsx does.
 *
 * Shared by the spend, meal and receipt-settings screens because all three
 * delete small things from a list on a phone, where brushing a button is the
 * commonest way anything gets deleted. The action arrives already bound to
 * its id, so this knows nothing about what it is deleting beyond the words -
 * and the second tap says those words in full, because "Delete" twice is not
 * a confirmation of anything.
 */
export function ConfirmDelete({
  action,
  label = "Delete",
  question,
  yes = "Delete it",
  no = "Keep it",
}: {
  action: () => Promise<{ ok: boolean; error?: string } | void>;
  label?: string;
  /** What is about to go: "Forget the card ending 1234?" */
  question: string;
  yes?: string;
  no?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 shrink-0 px-1 text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-destructive sm:min-h-8"
      >
        {label}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label={question} className="w-full rounded-[16px] bg-[oklch(0.96_0.03_40)] p-4">
      <p className="text-sm font-bold text-destructive">{question}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await action();
              if (result && !result.ok) setError(result.error ?? "That didn't work.");
            })
          }
          className="min-h-11 rounded-[12px] bg-destructive px-4 text-sm font-extrabold text-white disabled:opacity-60 sm:min-h-9"
        >
          {pending ? "Deleting…" : yes}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="min-h-11 rounded-[12px] bg-card px-4 text-sm font-bold sm:min-h-9"
        >
          {no}
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>}
    </div>
  );
}
