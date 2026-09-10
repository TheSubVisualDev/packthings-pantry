"use client";

import { useState, useTransition } from "react";
import { adjustItem } from "@/app/pantry/actions";
import { ADJUST_STEP, formatQuantity } from "@/lib/units";
import type { Item } from "@/lib/types";

/**
 * Plus/minus against existing stock, one row per item.
 *
 * Each row carries its own amount box seeded with a sensible step for the
 * dimension: grams and millilitres move 100 at a time, counts move one, and
 * either can be overtyped for a one-off.
 */
export function QuickAdjust({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  // Only holds rows this session has changed; everything else reads through to
  // the server's numbers, so a refresh elsewhere isn't masked by stale state.
  const [edited, setEdited] = useState<Record<number, number>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? items.filter((item) => item.name.toLowerCase().includes(needle))
    : items;

  function amountFor(item: Item): string {
    return amounts[item.id] ?? String(ADJUST_STEP[item.dimension]);
  }

  function apply(item: Item, direction: 1 | -1) {
    const amount = Number(amountFor(item));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setError(null);
    setBusyId(item.id);

    startTransition(async () => {
      const result = await adjustItem(item.id, amount * direction);
      setBusyId(null);

      if (!result.ok) {
        setError(result.error ?? "Couldn't adjust that.");
        return;
      }
      setEdited((current) => ({ ...current, [item.id]: result.quantity! }));
    });
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find an item"
        aria-label="Find an item"
        className="w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
      />

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-sm font-semibold text-muted-foreground">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {visible.map((item) => {
            const quantity = edited[item.id] ?? item.quantity;
            const busy = busyId === item.id;

            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="font-bold break-words">{item.name}</div>
                  <div className="text-sm font-semibold text-quantity">
                    {formatQuantity(quantity)}
                    {item.canonical_unit === "count" ? "" : item.canonical_unit}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Take from ${item.name}`}
                    onClick={() => apply(item, -1)}
                    disabled={busy || quantity <= 0}
                    className="h-10 w-10 rounded-full bg-chip text-xl font-extrabold leading-none text-foreground disabled:opacity-30"
                  >
                    &minus;
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-label={`Amount to adjust ${item.name} by`}
                    value={amountFor(item)}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    className="w-20 rounded-[12px] border border-border bg-background px-2 py-2 text-center font-semibold outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    aria-label={`Add to ${item.name}`}
                    onClick={() => apply(item, 1)}
                    disabled={busy}
                    className="h-10 w-10 rounded-full bg-primary text-xl font-extrabold leading-none text-primary-foreground disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
