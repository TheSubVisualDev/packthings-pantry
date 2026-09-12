"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { adjustItem, adjustPacks, setPackaging } from "@/app/pantry/actions";
import type { ItemResult } from "@/app/pantry/actions";
import { StockBar } from "@/components/stock-bar";
import { formatQuantity } from "@/lib/units";
import { applyDelta, totalOnHand } from "@/lib/containers";
import { Vessel, vesselKindFor, vesselModeFor } from "@/components/vessel";
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
  /** What is in the open one, held locally so the liquid moves on the drag. */
  const [open, setOpen] = useState(item.quantity);

  /**
   * What the server last told us it holds.
   *
   * The prop only changes when the page re-renders from the database, so a
   * second drag before that lands would compute its delta against a stale
   * number and move the stock twice. This is the last answer we actually
   * have, updated by every write that succeeds.
   */
  const server = useRef({ quantity: item.quantity, sealed: item.sealed_count });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [packed, setPacked] = useState(item.pack_size !== null);
  const [unspecified, setUnspecified] = useState(item.unspecified === 1);
  const [target, setTarget] = useState(
    item.restock_target !== null ? String(item.restock_target) : "",
  );

  /**
   * A couple of targets worth one tap each.
   *
   * This field is what makes the shopping list offer things without being
   * asked, and almost nothing in the pantry has one - because it is a number
   * in a unit you have to stop and reason about ("how many grams of butter is
   * a sensible amount to keep?"). Said as packs, or as what is in right now,
   * it stops being a sum.
   */
  const quickTargets = (() => {
    const pack = item.pack_size;
    if (packed && pack !== null && pack > 0) {
      return [
        { label: "1 pack", value: pack },
        { label: "2 packs", value: pack * 2 },
        { label: "3 packs", value: pack * 3 },
      ];
    }
    const onHand = totalOnHand(item);
    if (onHand === null || onHand <= 0) return [];
    // What is in now is usually about what a normal amount looks like, which
    // is the whole question and needs no history to answer.
    return [{ label: `what's in now (${formatQuantity(onHand)})`, value: onHand }];
  })();

  /**
   * The level while a finger is still on it: local only.
   *
   * Dragging fires many times a second and this database is in Nuremberg. The
   * first version wrote on every frame, which produced a queue of round trips
   * whose answers came back out of order and overwrote each other - the
   * liquid jerked between empty and full and would not stay where it was put.
   * Nothing leaves the phone until the finger does.
   */
  function pour(to: number) {
    setOpen(Math.max(0, Math.min(item.pack_size ?? to, to)));
    setError(null);
  }

  /**
   * The level somebody settled on, saved once.
   *
   * A delta rather than an assignment, because the cascade rule is written as
   * one - and the optimistic number has to be the number the server arrives
   * at, which applyDelta is the JavaScript half of. Dragging the liquid from a
   * fifth to a half of a bottle with two sealed ones behind it must not decide
   * there is now half a bottle in total.
   */
  function commit(to: number) {
    const was = { ...server.current };
    const delta = Math.round((to - was.quantity) * 1e6) / 1e6;
    if (delta === 0) return;

    const next = applyDelta(
      { ...item, quantity: was.quantity, sealed_count: was.sealed },
      delta,
    );
    setOpen(next.quantity);
    setSealed(next.sealedCount);
    server.current = { quantity: next.quantity, sealed: next.sealedCount };
    setError(null);

    startTransition(async () => {
      const result = await adjustItem(item.id, delta);
      if (!result.ok) {
        setOpen(was.quantity);
        setSealed(was.sealed);
        server.current = was;
        setError(result.error ?? "Couldn't save that.");
      } else if (result.quantity !== undefined && result.sealedCount !== undefined) {
        setOpen(result.quantity);
        setSealed(result.sealedCount);
        server.current = { quantity: result.quantity, sealed: result.sealedCount };
      }
    });
  }

  function movePacks(by: number) {
    if (sealed + by < 0) return;
    const was = sealed;
    setSealed(was + by);
    setError(null);

    server.current = { ...server.current, sealed: was + by };

    startTransition(async () => {
      const result = await adjustPacks(item.id, by);
      if (!result.ok) {
        setSealed(was);
        server.current = { ...server.current, sealed: was };
        setError(result.error ?? "Couldn't save that.");
      } else if (result.sealedCount !== undefined) {
        setSealed(result.sealedCount);
        server.current = { ...server.current, sealed: result.sealedCount };
      }
    });
  }

  const shown = {
    ...item,
    quantity: open,
    sealed_count: sealed,
    unspecified: unspecified ? 1 : 0,
  };
  const unitSuffix = item.canonical_unit === "count" ? "" : item.canonical_unit;

  const capacity = item.pack_size !== null && item.pack_size > 0 ? item.pack_size : 0;
  const mode = vesselModeFor({
    dimension: item.dimension,
    packSize: capacity > 0 ? capacity : null,
    unspecified,
  });

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        On the shelf
      </h2>

      {/*
        The open container, as the thing it is.

        The bar says what is on the shelf; the vessel is how you change it
        without doing arithmetic. Only where there is a container to be a
        fraction of - see vesselModeFor - and only for people who can edit,
        because a control you cannot use is worse than a picture.
      */}
      {canEdit && mode === "fill" ? (
        <div className="mt-2.5">
          <Vessel
            kind={vesselKindFor({
              packUnit: item.pack_unit ?? item.canonical_unit,
              name: item.name,
              dimension: item.dimension,
            })}
            level={capacity > 0 ? Math.min(1, open / capacity) : 0}
            onLevel={(level) => pour(Math.round(level * capacity * 100) / 100)}
            onCommit={(level) => commit(Math.round(level * capacity * 100) / 100)}
            capacity={capacity}
            unit={item.canonical_unit}
            label={`How full the open ${item.name} is`}
          />
          {sealed > 0 && (
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {sealed} sealed behind it, {formatQuantity(item.pack_size ?? 0)}
              {unitSuffix} each.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2.5">
          <StockBar item={shown} />
        </div>
      )}

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
                </div>
              )}

              {/* Not everything comes in countable packs, and you still want
                  a butter in reserve. Same idea as keeping three tins, said
                  in the unit the thing is actually measured in. */}
              <div className="mt-4">
                <label htmlFor="restock_target" className={LABEL}>
                  Keep at least ({unitSuffix || item.canonical_unit})
                </label>
                <input
                  id="restock_target"
                  name="restock_target"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="any"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  className={FIELD}
                />

                {quickTargets.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {quickTargets.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setTarget(String(option.value))}
                        className={
                          target === String(option.value)
                            ? "rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                            : "rounded-full bg-chip px-3 py-1.5 text-xs font-bold hover:bg-border"
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                    {target && (
                      <button
                        type="button"
                        onClick={() => setTarget("")}
                        className="px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        clear
                      </button>
                    )}
                  </div>
                )}
                {/* Said in the thing, never in packaging: nobody thinks "keep
                    two boxes of eggs". The shopping list works out how many
                    packs that takes, rounding up. */}
                <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
                  {packed && item.pack_size
                    ? `How much to keep in, not how many packs — ${formatQuantity(item.pack_size)}${unitSuffix} per pack.`
                    : "How much to keep in. The shopping list offers the difference."}
                </p>
              </div>
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
