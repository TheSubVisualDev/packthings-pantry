"use client";

import { useState, useTransition } from "react";
import { removeKitchen, type KitchenResult } from "@/app/kitchens/actions";
import type { KitchenContents } from "@/lib/kitchens";

/**
 * Deleting a kitchen, behind a confirmation that says what actually goes.
 *
 * Typing the name is deliberate friction. This takes the stock, the scanned
 * barcodes, the cooking history and everyone else's access with it, and none
 * of that comes back - which is more than a person can weigh from the word
 * "delete" alone.
 */
export function DeleteKitchen({
  kitchenId,
  name,
  contents,
}: {
  kitchenId: number;
  name: string;
  contents: KitchenContents;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const goes = [
    contents.items > 0 ? `${contents.items} ${contents.items === 1 ? "item" : "items"}` : null,
    contents.cooks > 0 ? `${contents.cooks} recorded ${contents.cooks === 1 ? "cook" : "cooks"}` : null,
    contents.products > 0 ? `${contents.products} scanned ${contents.products === 1 ? "barcode" : "barcodes"}` : null,
    contents.shopping > 0 ? `${contents.shopping} on the shopping list` : null,
  ].filter(Boolean) as string[];

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-destructive"
      >
        Delete this kitchen
      </button>
    );
  }

  return (
    <div className="rounded-[16px] bg-[oklch(0.96_0.03_40)] p-4">
      <p className="text-sm font-bold text-destructive">
        Deleting {name} takes everything in it.
      </p>

      <ul className="mt-2 space-y-0.5 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
        {goes.length > 0 ? (
          goes.map((line) => <li key={line}>· {line}</li>)
        ) : (
          <li>· it&apos;s empty</li>
        )}
        {contents.members > 1 && (
          <li>· {contents.members - 1} other {contents.members === 2 ? "person loses" : "people lose"} access</li>
        )}
      </ul>

      <p className="mt-2 text-sm font-medium text-[oklch(0.44_0.09_38)]">
        Your recipes are safe — they belong to you, not to a set of shelves.
      </p>

      <label className="mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-label">
        Type {name} to confirm
      </label>
      <input
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        aria-label={`Type ${name} to confirm`}
        className="mt-1.5 w-full rounded-[12px] border border-border bg-card px-4 py-2.5 font-semibold outline-none focus:border-primary"
      />

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || typed.trim() !== name}
          onClick={() =>
            startTransition(async () => {
              const result: KitchenResult = await removeKitchen(kitchenId);
              if (!result.ok) setError(result.error ?? "Couldn't delete that.");
            })
          }
          className="rounded-[12px] bg-destructive px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete it"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          className="rounded-[12px] px-4 py-2.5 text-sm font-bold"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
