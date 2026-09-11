"use client";

import { useActionState, useTransition } from "react";
import {
  addItemToList,
  clearDone,
  drop,
  tick,
  type ListResult,
} from "@/app/pantry/list/actions";
import { ENTRY_UNITS, formatQuantity } from "@/lib/units";
import type { ShoppingLine } from "@/lib/shopping";

const SMALL =
  "rounded-[12px] border border-border bg-card px-3 py-2.5 font-semibold outline-none focus:border-primary";

export function ShoppingList({
  lines,
  filter,
}: {
  lines: ShoppingLine[];
  /** The shop the list is narrowed to, if any. */
  filter?: string | null;
}) {
  const [state, formAction, pending] = useActionState<ListResult, FormData>(
    addItemToList,
    { ok: true },
  );
  const [, startTransition] = useTransition();

  /**
   * Outstanding lines, grouped by shop, in the order the query returned them.
   *
   * A Map preserves insertion order, so the SQL's ORDER BY decides the groups
   * and their contents - there is one place that knows what order a shopping
   * list goes in, and it is not here.
   */
  const byShop = (() => {
    const groups = new Map<string, ShoppingLine[]>();
    for (const line of lines.filter((entry) => !entry.bought_at)) {
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

  const done = lines.filter((line) => line.bought_at);

  function row(line: ShoppingLine) {
    const bought = Boolean(line.bought_at);

    return (
      <li
        key={line.id}
        className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
      >
        <button
          type="button"
          aria-pressed={bought}
          aria-label={bought ? `Un-tick ${line.item_name}` : `Tick off ${line.item_name}`}
          onClick={() => startTransition(async () => { await tick(line.id, !bought); })}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
            bought ? "bg-primary text-primary-foreground" : "bg-chip text-transparent"
          }`}
        >
          ✓
        </button>

        <span className={`min-w-0 flex-1 ${bought ? "opacity-50" : ""}`}>
          <span className={`block font-bold break-words ${bought ? "line-through" : ""}`}>
            {line.item_name}
          </span>
          {line.quantity !== null && (
            <span className="block text-sm font-semibold text-quantity">
              {formatQuantity(line.quantity)}
              {line.unit && line.unit !== "count" ? line.unit : ""}
            </span>
          )}
        </span>

        <button
          type="button"
          aria-label={`Remove ${line.item_name}`}
          onClick={() => startTransition(async () => { await drop(line.id); })}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-muted-foreground hover:text-destructive"
        >
          ✕
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="name"
          placeholder="Bread"
          aria-label="What to buy"
          className={`${SMALL} min-w-36 flex-1`}
        />
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
        <select name="unit" defaultValue="g" aria-label="Unit" className={`${SMALL} w-24`}>
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

      {state.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {state.error}
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
                In the trolley
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
