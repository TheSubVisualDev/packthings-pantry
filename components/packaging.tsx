"use client";

import { useActionState, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { adjustPacks, setPackaging } from "@/app/pantry/actions";
import type { ItemResult } from "@/app/pantry/actions";
import { StockBar } from "@/components/stock-bar";
import { formatQuantity } from "@/lib/units";
import type { Item } from "@/lib/types";

const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";
const FIELD =
  "w-full rounded-[14px] border border-border bg-background px-3.5 py-2.5 font-semibold outline-none focus:border-primary";

/**
 * How an item is packaged, and the buttons for buying and finishing containers.
 *
 * The bar and the controls live together because they are the same fact: the
 * pips are what "Bought one" adds to, and watching one change when you press
 * the other is the whole explanation of the model. Nobody should have to read a
 * sentence about sealed counts.
 */
export function Packaging({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const [state, action, saving] = useActionState<ItemResult, FormData>(setPackaging, {
    ok: true,
  });
  // Held locally so the pips move on the press rather than after the round trip.
  const [sealed, setSealed] = useState(item.sealed_count);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [packed, setPacked] = useState(item.pack_size !== null);
  const [unspecified, setUnspecified] = useState(item.unspecified === 1);

  function movePacks(by: number) {
    if (sealed + by < 0) return;
    const was = sealed;
    setSealed(was + by);
    setError(null);

    startTransition(async () => {
      const result = await adjustPacks(item.id, by);
      if (!result.ok) {
        setSealed(was);
        setError(result.error ?? "Couldn't save that.");
      } else if (result.sealedCount !== undefined) {
        setSealed(result.sealedCount);
      }
    });
  }

  const shown = { ...item, sealed_count: sealed, unspecified: unspecified ? 1 : 0 };
  const unitSuffix = item.canonical_unit === "count" ? "" : item.canonical_unit;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        On the shelf
      </h2>

      <div className="mt-2.5">
        <StockBar item={shown} />
      </div>

      {canEdit && item.pack_size !== null && !unspecified && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => movePacks(-1)}
            disabled={sealed === 0}
            aria-label="One fewer sealed pack"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-chip disabled:opacity-30"
          >
            <Minus className="h-4 w-4" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => movePacks(1)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
            Bought one
          </button>
          <span className="text-xs font-semibold text-muted-foreground">
            {formatQuantity(item.pack_size)}
            {unitSuffix} each
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {canEdit && (
        <form action={action} className="mt-5 border-t border-border pt-4">
          <input type="hidden" name="item_id" value={item.id} />

          <label className="flex items-center gap-2.5 text-sm font-bold">
            <input
              type="checkbox"
              name="unspecified"
              checked={unspecified}
              onChange={(event) => setUnspecified(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Don&apos;t track how much of this there is
          </label>

          {!unspecified && (
            <>
              <label className="mt-4 flex items-center gap-2.5 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={packed}
                  onChange={(event) => setPacked(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                It comes in packs, tins or bottles
              </label>

              {/* Unchecking posts no pack_size, which the action reads as "a
                  loose amount again" and clears the sealed count with it. */}
              {packed && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="min-w-28 flex-1">
                    <label htmlFor="pack_size" className={LABEL}>
                      One holds ({item.canonical_unit})
                    </label>
                    <input
                      id="pack_size"
                      name="pack_size"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      defaultValue={item.pack_size ?? ""}
                      className={FIELD}
                    />
                  </div>
                  <div className="min-w-24 flex-1">
                    <label htmlFor="sealed_count" className={LABEL}>
                      Sealed
                    </label>
                    <input
                      id="sealed_count"
                      name="sealed_count"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      defaultValue={sealed}
                      className={FIELD}
                    />
                  </div>
                  <div className="min-w-24 flex-1">
                    <label htmlFor="restock_to" className={LABEL}>
                      Keep
                    </label>
                    <input
                      id="restock_to"
                      name="restock_to"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="any"
                      defaultValue={item.restock_to ?? ""}
                      className={FIELD}
                    />
                  </div>
                </div>
              )}
            </>
          )}


          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[14px] bg-ink px-5 py-2.5 text-sm font-extrabold text-background disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save packaging"}
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
        </form>
      )}
    </div>
  );
}
