"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteItem,
  setOpened,
  updateItem,
  type ItemResult,
} from "@/app/pantry/actions";
import { ItemMenu } from "@/components/item-menu";
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
  shelf,
}: {
  item: Item;
  locations: string[];
  canEdit: boolean;
  /**
   * How much there is, rendered between the deadline and the paperwork.
   *
   * Passed in rather than imported because it is a server-rendered panel of
   * its own, and because the order is the point: what is expiring, then how
   * much is left, then the fields you almost never change.
   */
  shelf?: React.ReactNode;
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

  /**
   * Whether the date being shown is one the app made up.
   *
   * Only when the packet date is the one winning. An opened-on deadline is
   * arithmetic on a day somebody actually opened it, which is a different
   * confidence - and if the guessed packet date is later than that, it is not
   * the number on screen and its guessiness is nobody's business.
   */
  const guessed = item.expiry_estimated === 1 && useBy === item.expiry_date;

  return (
    <div className="space-y-3">
      {/*
        Delete, at the top, behind the menu every other page keeps it behind.
        
        It was a grey underlined link at the bottom of three hundred lines,
        past the shelf, the packaging, the dates and the paperwork - which is
        indistinguishable from not existing, and was duly reported as missing.
        A thing you do to an item belongs with the item's name, not after
        everything you do with it.
      */}
      {canEdit && (
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-[22px] font-extrabold tracking-[-0.02em] break-words">
            {item.name}
          </h1>
          <ItemMenu name={item.name} onDelete={() => setConfirming(true)} />
        </div>
      )}

      {/* Asked here rather than inside the menu: a sheet that closes to reveal
          the question it asked is a sheet that loses the answer. */}
      {confirming && (
        <div className="rounded-[20px] bg-[oklch(0.96_0.03_40)] p-5">
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
      <section className={CARD}>
        {/* No vessel here on purpose. The "On the shelf" card below already
            draws this item large and DRAGGABLE - putting a small static copy
            above it meant two pictures of one bottle on one screen, in two
            different styles, and the better one second. */}
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em] break-words">
            {item.name}
          </h1>
        </div>

        {useBy && (
          /*
            A guess is never drawn in the alarm colour, and never told as a
            fact.

            "Was good until the 3rd" is a thing to act on; the app has no
            business saying it about a date it invented from the average life
            of bread. So an estimate stays muted however far past it is, says
            "probably", and offers the way to correct it - which is the only
            reason this wording matters: the fastest way to get a real date
            into the app is somebody disagreeing with a wrong one.
          */
          <p
            className={`mt-2 text-sm font-bold ${
              left !== null && left < 0 && !guessed
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {guessed
              ? left !== null && left <= 0
                ? "Probably past its best by now"
                : `Probably about ${left} ${left === 1 ? "day" : "days"} left`
              : left !== null && left < 0
                ? `Was good until ${useBy} — ${Math.abs(left)} days ago`
                : left === 0
                  ? "Use it today"
                  : `Use by ${useBy} — ${left} days`}
            {openedDeadline && useBy === openedDeadline && " (because it's open)"}
            {guessed && (
              <span className="font-semibold"> — estimated, no date entered</span>
            )}
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

      {shelf}

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
              {/* Editable here even though the unit is not, because this is
                  the label on the number rather than what the number means -
                  "4" becoming "4 cloves" reinterprets nothing on the shelf. */}
              {item.canonical_unit === "count" && (
                <div className="min-w-28 flex-1">
                  <label htmlFor="count_noun" className={LABEL}>
                    Counted in
                  </label>
                  <input
                    id="count_noun"
                    name="count_noun"
                    type="text"
                    maxLength={20}
                    autoComplete="off"
                    placeholder="tin, clove"
                    defaultValue={item.count_noun ?? ""}
                    className={FIELD}
                  />
                </div>
              )}
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
    </div>
  );
}
