"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteItem,
  setOpened,
  updateItem,
  type ItemResult,
} from "@/app/pantry/actions";
import { daysUntil, parseStamp } from "@/lib/dates";
import type { Item } from "@/lib/types";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";
const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

export function ItemDetail({
  item,
  locations,
  canEdit,
}: {
  item: Item;
  locations: string[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ItemResult, FormData>(updateItem, {
    ok: true,
  });
  const [opened, setOpenedLocal] = useState(item.opened_at);
  const [openError, setOpenError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Delete still shows progress - a destructive action should wait and say so.
  const [busy, startTransition] = useTransition();

  // Recomputed here rather than passed in, so it follows the toggle without a
  // round trip. The server is still what decides what actually gets stored.
  const openedOn = parseStamp(opened);
  const openedDeadline =
    openedOn && item.shelf_life_days
      ? new Date(openedOn.getTime() + item.shelf_life_days * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;

  const deadlines = [item.expiry_date, openedDeadline].filter(Boolean) as string[];
  const useBy = [...deadlines].sort()[0] ?? null;
  const left = useBy ? daysUntil(useBy) : null;

  return (
    <div className="space-y-3">
      <section className={CARD}>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em] break-words">
            {item.name}
          </h1>
        </div>

        {useBy && (
          <p
            className={`mt-2 text-sm font-bold ${
              left !== null && left < 0 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {left !== null && left < 0
              ? `Was good until ${useBy} — ${Math.abs(left)} days ago`
              : left === 0
                ? "Use it today"
                : `Use by ${useBy} — ${left} days`}
            {openedDeadline && useBy === openedDeadline && " (because it's open)"}
          </p>
        )}

        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                // Flipped here, not after the round trip to Nuremberg. The
                // old order also flipped it whether or not the write landed,
                // which told you it was open when it wasn't.
                const was = opened;
                const next = !opened;
                setOpenedLocal(next ? new Date().toISOString() : null);
                setOpenError(null);
                startTransition(async () => {
                  const result = await setOpened(item.id, next);
                  if (!result.ok) {
                    setOpenedLocal(was);
                    setOpenError(result.error ?? "Couldn't save that.");
                  }
                });
              }}
              className={`rounded-[14px] px-4 py-2.5 text-sm font-extrabold disabled:opacity-60 ${
                opened
                  ? "bg-chip text-muted-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {opened ? "Opened — mark unopened" : "I've opened it"}
            </button>

            {opened && !item.shelf_life_days && (
              <span className="text-xs font-semibold text-muted-foreground">
                Say how long it keeps once open, below, and this becomes a deadline.
              </span>
            )}

            {openError && (
              <span role="alert" className="text-xs font-bold text-destructive">
                {openError}
              </span>
            )}
          </div>
        )}
      </section>

      {canEdit && (
        <form action={action} className={CARD}>
          <input type="hidden" name="item_id" value={item.id} />

          <h2 className={LABEL}>Details</h2>

          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="name" className={LABEL}>
                Name
              </label>
              <input id="name" name="name" defaultValue={item.name} className={FIELD} />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="min-w-28 flex-1">
                <label htmlFor="quantity" className={LABEL}>
                  {item.pack_size === null ? "How much" : "In the open one"} ({item.canonical_unit})
                </label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  defaultValue={item.quantity}
                  className={FIELD}
                />
              </div>
              <div className="min-w-28 flex-1">
                <label htmlFor="shelf_life_days" className={LABEL}>
                  Keeps once open
                </label>
                <input
                  id="shelf_life_days"
                  name="shelf_life_days"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="days"
                  defaultValue={item.shelf_life_days ?? ""}
                  className={FIELD}
                />
              </div>
            </div>

            {/* Category used to live here. Tags replaced it, and they are
                edited above the form rather than inside it because adding one
                saves immediately - there is nothing to Save afterwards. */}
            <div className="flex flex-wrap gap-3">
              <div className="min-w-28 flex-1">
                <label htmlFor="location" className={LABEL}>
                  Where
                </label>
                <select
                  id="location"
                  name="location"
                  defaultValue={item.location ?? ""}
                  className={FIELD}
                >
                  <option value="">Unplaced</option>
                  {locations.map((place) => (
                    <option key={place} value={place}>
                      {place}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="expiry_date" className={LABEL}>
                Date on the packet
              </label>
              <input
                id="expiry_date"
                name="expiry_date"
                type="date"
                defaultValue={item.expiry_date ?? ""}
                className={FIELD}
              />
            </div>
          </div>

          {state.error && (
            <p role="alert" className="mt-3 text-sm font-bold text-destructive">
              {state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p className="mt-3 text-sm font-bold text-muted-foreground">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            Measured in {item.canonical_unit}. To change that, delete it and add
            it again — reinterpreting a number already on the shelf is how stock
            counts go quietly wrong.
          </p>
        </form>
      )}

      {canEdit && (
        <section className={CARD}>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-destructive"
            >
              Delete {item.name}
            </button>
          ) : (
            <div>
              <p className="text-sm font-bold text-destructive">
                Delete {item.name}? Recipes that call for it keep the line and
                simply stop being linked to stock.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteItem(item.id);
                    })
                  }
                  className="rounded-[12px] bg-destructive px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  {busy ? "Deleting…" : "Delete it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-[12px] px-4 py-2.5 text-sm font-bold"
                >
                  Keep it
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
