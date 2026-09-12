"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { adjustItem, setOpened } from "@/app/pantry/actions";
import { ADJUST_STEP } from "@/lib/units";
import { applyDelta, describeStock } from "@/lib/containers";
import type { Item } from "@/lib/types";

/**
 * Changing how much of something there is, without leaving the list.
 *
 * Board `1t`, and the biggest flow win in the design pass. Adjusting stock is
 * the most frequent thing anybody does in this app and it was three screens
 * deep - open the add menu, choose Quick adjust, find the row, then press a
 * button. It is zero screens deep now: tap a row and the stepper unfolds
 * underneath it.
 *
 * The number moves on the tap, before the server is asked. The database is in
 * Nuremberg and the browser usually is not, so waiting for the round trip put
 * a visible pause on every press - and a stepper that hesitates is a stepper
 * people stop trusting and stop using. applyDelta is the same cascade rule the
 * server runs, which is why the optimistic number and the real one agree;
 * `npm run check:cascade` holds the two copies to that over 480 cases.
 */
export function RowAdjust({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const step = ADJUST_STEP[item.dimension];
  const [amount, setAmount] = useState(String(step));
  const [local, setLocal] = useState({
    quantity: item.quantity,
    sealedCount: item.sealed_count,
  });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /**
   * How many replies are still owed.
   *
   * The server answers with an absolute quantity, which is only safe to adopt
   * when nothing newer is outstanding - otherwise an early reply lands on top
   * of a later tap and the number jumps backwards under your thumb.
   */
  const inFlight = useRef(0);

  const shown = { ...item, ...local, sealed_count: local.sealedCount };

  function apply(direction: 1 | -1) {
    const size = Number(amount);
    if (!Number.isFinite(size) || size <= 0) {
      setError("Give it an amount above zero.");
      return;
    }
    setError(null);

    const delta = size * direction;
    setLocal(applyDelta(shown, delta));
    inFlight.current += 1;

    startTransition(async () => {
      const result = await adjustItem(item.id, delta);
      inFlight.current -= 1;
      if (!result.ok) {
        setError(result.error ?? "Couldn't change that.");
        // Put it back: the shelf did not move, so the number must not either.
        setLocal({ quantity: item.quantity, sealedCount: item.sealed_count });
        return;
      }
      if (inFlight.current === 0 && result.quantity !== undefined) {
        setLocal({
          quantity: result.quantity,
          sealedCount: result.sealedCount ?? local.sealedCount,
        });
      }
    });
  }

  function useItAll() {
    const total = local.sealedCount * (item.pack_size ?? 0) + local.quantity;
    if (total <= 0) return;
    setLocal({ quantity: 0, sealedCount: 0 });
    startTransition(async () => {
      await adjustItem(item.id, -total);
    });
  }

  return (
    <div className="border-b border-border bg-chip/60 px-3.5 py-3 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Less ${item.name}`}
          onClick={() => apply(-1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        >
          <Minus className="h-5 w-5" strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <div className="font-mono text-[17px] font-bold tabular-nums">
            {describeStock(shown)}
          </div>
          <label className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-bold text-muted-foreground">
            <span>±</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              aria-label="How much each press changes"
              onChange={(event) => setAmount(event.target.value)}
              className="w-12 rounded-md bg-transparent text-center font-mono tabular-nums outline-none focus:bg-card"
            />
            <span>{item.canonical_unit === "count" ? "" : item.canonical_unit}</span>
          </label>
        </div>

        <button
          type="button"
          aria-label={`More ${item.name}`}
          onClick={() => apply(1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Plus className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>

      {/* The three things you actually want after changing an amount. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={useItAll}
          className="flex h-9 items-center rounded-full bg-card px-3.5 text-[12px] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        >
          Used it all
        </button>
        {item.opened_at === null && (
          <button
            type="button"
            onClick={() => startTransition(async () => void (await setOpened(item.id, true)))}
            className="flex h-9 items-center rounded-full bg-card px-3.5 text-[12px] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            Opened
          </button>
        )}
        <Link
          href={`/pantry/item/${item.id}`}
          className="flex h-9 items-center gap-1 rounded-full bg-card px-3.5 text-[12px] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        >
          Open item
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.8} />
        </Link>
        <div className="flex-grow" />
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 items-center px-2 text-[12px] font-bold text-muted-foreground"
        >
          Done
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
