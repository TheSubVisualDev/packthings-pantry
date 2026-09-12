"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { SoftSelect } from "@/components/soft-select";
import { suggestFor, type ItemProfile } from "@/lib/suggest";
import {
  addItemToList,
  clearDone,
  drop,
  tick,
  type ListResult,
} from "@/app/pantry/list/actions";
import { ENTRY_UNITS, formatQuantity, unitSuffix } from "@/lib/units";
import type { ShoppingLine } from "@/lib/shopping";

const SMALL =
  "rounded-[12px] border border-border bg-card px-3 py-2.5 font-semibold outline-none focus:border-primary";

export function ShoppingList({
  lines,
  filter,
  profiles,
}: {
  lines: ShoppingLine[];
  /** The shop the list is narrowed to, if any. */
  filter?: string | null;
  /**
   * What the kitchen already holds, so a line can be typed once and mean the
   * same row the pantry already knows about.
   *
   * Free text here was quietly expensive: "bread" and "Bread" and "Sourdough
   * bread" all became separate lines, and none of them matched the stock row
   * the shortfall list was trying not to duplicate.
   */
  profiles: ItemProfile[];
}) {
  const [state, formAction, pending] = useActionState<ListResult, FormData>(
    addItemToList,
    { ok: true },
  );
  const [, startTransition] = useTransition();

  const [draft, setDraft] = useState("");
  /** Bumped on every add, to remount the name field empty. */
  const [seq, setSeq] = useState(0);

  /**
   * Ticks, held here until the server catches up.
   *
   * The database is in Nuremberg and a supermarket is the worst place in the
   * world for a round trip: half a bar of signal, a moving thumb, and six
   * things to tick in a row. The circle fills on the press; if the write
   * fails the tick goes back and says so.
   */
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [tickError, setTickError] = useState<string | null>(null);

  const isBought = (line: ShoppingLine) =>
    ticked[line.id] ?? Boolean(line.bought_at);

  function setBought(line: ShoppingLine, next: boolean) {
    setTicked((current) => ({ ...current, [line.id]: next }));
    setTickError(null);
    startTransition(async () => {
      const result = await tick(line.id, next);
      if (!result?.ok) {
        setTicked((current) => ({ ...current, [line.id]: !next }));
        setTickError(result?.error ?? "Couldn't save that tick.");
      }
    });
  }

  /**
   * The unit follows the name, the same way it does on the add form.
   *
   * Grams was the default for everything, so a line for bread went on the list
   * as "500 g bread" unless somebody noticed and changed it.
   */
  const guess = useMemo(() => suggestFor(draft, profiles), [draft, profiles]);
  const [unitOverride, setUnitOverride] = useState<string | null>(null);
  const unit = unitOverride ?? guess.unit ?? "g";

  /**
   * Clears and refocuses the moment you submit, not when the server replies.
   *
   * A shopping list is written in bursts of five or six things, and the form
   * used to keep whatever was in it - so every line after the first began with
   * selecting the old text and deleting it. Waiting for the round trip to
   * Nuremberg first would put a visible pause between each one, which is the
   * same reason QuickAdjust moves its number before the server is asked.
   */
  function submit(data: FormData) {
    setSeq((value) => value + 1);
    setDraft("");
    setUnitOverride(null);
    formAction(data);
  }

  /**
   * Outstanding lines, grouped by shop, in the order the query returned them.
   *
   * A Map preserves insertion order, so the SQL's ORDER BY decides the groups
   * and their contents - there is one place that knows what order a shopping
   * list goes in, and it is not here.
   */
  const byShop = (() => {
    const groups = new Map<string, ShoppingLine[]>();
    for (const line of lines.filter((entry) => !isBought(entry))) {
      /**
       * Under a filter, anything with a shop is here by definition - the query
       * only kept lines this shop sells - so it groups under the shop you are
       * standing in, not the one you usually use. Saying "Asian supermarket"
       * over a line while you are in Tesco is just wrong.
       */
      const key = filter && line.shop ? filter : (line.shop ?? "Anywhere");
      const bucket = groups.get(key);
      if (bucket) bucket.push(line);
      else groups.set(key, [line]);
    }
    return [...groups.entries()];
  })();

  const done = lines.filter((line) => isBought(line));
  const inBasket = done.length;
  const total = lines.length;

  function row(line: ShoppingLine) {
    const bought = isBought(line);

    return (
      <li
        key={line.id}
        className="flex min-h-[52px] items-center gap-3 border-b border-border px-4 last:border-b-0"
      >
        {/*
          A 32px circle in a 52px row.

          This is the one screen in the app used while walking, holding a
          basket, with one thumb - and the old 24px tick was drawn for a desk.
          Missing it means un-ticking something else, which is worse than
          missing it.
        */}
        <button
          type="button"
          aria-pressed={bought}
          aria-label={bought ? `Un-tick ${line.item_name}` : `Tick off ${line.item_name}`}
          onClick={() => setBought(line, !bought)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
            bought
              ? "bg-primary text-primary-foreground"
              : "border-2 border-border text-transparent"
          }`}
        >
          ✓
        </button>

        <span className={`min-w-0 flex-1 py-2 ${bought ? "opacity-50" : ""}`}>
          <span
            className={`block text-[15px] font-bold break-words ${bought ? "line-through" : ""}`}
          >
            {line.item_name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {line.quantity !== null && (
              <span className="font-mono text-sm font-semibold text-quantity">
                {formatQuantity(line.quantity)}
                {unitSuffix(line.unit)}
              </span>
            )}
            {/* Why it is here, in a muted chip. Never the destructive colour:
                needing to buy something is not a fault, and a line you typed
                carries no chip at all because "you typed it" is not a fact
                worth the space. */}
            {line.source && (
              <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                {line.source}
              </span>
            )}
          </span>
        </span>

        <button
          type="button"
          aria-label={`Remove ${line.item_name}`}
          onClick={() => startTransition(async () => { await drop(line.id); })}
          className="shrink-0 self-stretch px-2 text-xs font-bold text-muted-foreground hover:text-destructive"
        >
          ✕
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      {/*
        Where you are in the trip.

        A shopping list is the one screen with a finish line, and knowing you
        are three off it is the difference between checking the list again and
        going to the till. The bar is the count, not a decoration - it says the
        same thing twice because one of them is readable at arm's length.
      */}
      {total > 0 && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-label">
              {inBasket === total
                ? "That is everything"
                : `${inBasket} of ${total} in the basket`}
            </p>
            {inBasket < total && (
              <p className="font-mono text-xs font-semibold text-muted-foreground">
                {total - inBasket} to go
              </p>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-chip">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${total === 0 ? 0 : (inBasket / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <form action={submit} className="flex flex-wrap gap-2">
        {/* Offers what the kitchen already calls things, so a line matches the
            stock row it means rather than becoming a second name for it. Still
            free text: half of what goes on a shopping list is something you
            have never bought before. */}
        <div className="min-w-36 flex-1">
          <SoftSelect
            key={seq}
            autoFocus={seq > 0}
            id="shopping-name"
            name="name"
            options={profiles.map((profile) => profile.name)}
            onValueChange={setDraft}
            className={`${SMALL} w-full pr-9`}
          />
        </div>
        <input
          name="quantity"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Qty"
          aria-label="How much (optional)"
          className={`${SMALL} w-20 text-center`}
        />
        <select
          name="unit"
          value={unit}
          onChange={(event) => setUnitOverride(event.target.value)}
          aria-label="Unit"
          className={`${SMALL} w-24`}
        >
          {ENTRY_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-[12px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {(state.error || tickError) && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {state.error ?? tickError}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="rounded-[20px] bg-card p-6 text-sm font-semibold text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          Nothing on the list. Cooking something you&apos;re short of will offer
          to add what&apos;s missing.
        </p>
      ) : (
        <div className="space-y-4">
          {byShop.map(([shop, shopLines]) => (
            <section key={shop}>
              {/* No heading when everything is unassigned: a single "Anywhere"
                  banner over the whole list is a label, not information. */}
              {byShop.length > 1 && (
                <h2 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-label">
                  {shop}
                </h2>
              )}
              <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                {shopLines.map(row)}
              </ul>
            </section>
          ))}

          {done.length > 0 && (
            <section>
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-label">
                In the basket &middot; {done.length}
              </h2>
              <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                {done.map(row)}
              </ul>
            </section>
          )}
        </div>
      )}

      {done.length > 0 && (
        <button
          type="button"
          onClick={() => startTransition(async () => { await clearDone(); })}
          className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear the {done.length} ticked off
        </button>
      )}
    </div>
  );
}
