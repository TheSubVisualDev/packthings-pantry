"use client";

import { useActionState, useState } from "react";
import { addItem, type AddItemState } from "@/app/pantry/actions";
import { ChipPicker } from "@/components/chip-picker";
import { dimensionOf, UNITS_BY_DIMENSION } from "@/lib/units";
import type { Dimension } from "@/lib/types";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL =
  "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";

/** Group headings in the unit picker. */
const DIMENSION_LABEL: Record<Dimension, string> = {
  mass: "Weight",
  volume: "Volume",
  count: "Count",
};

/**
 * What the number actually means, which depends on the unit beside it. Asking
 * for "Quantity" in grams reads oddly; asking for "Weight" in onions reads
 * worse.
 */
const AMOUNT_LABEL: Record<Dimension, string> = {
  mass: "Weight",
  volume: "Volume",
  count: "Quantity",
};

/** Values a barcode scan can arrive with; everything is optional. */
export interface AddItemPrefill {
  name?: string;
  quantity?: string;
  /** What one pack holds, from a scan. Its presence turns on the fields. */
  pack_size?: string;
  sealed_count?: string;
  unit?: string;
  tags?: string;
  shops?: string;
  location?: string;
  /** Set when the scanner sent us here; linked to the new item on submit. */
  barcode?: string;
}

export function AddItemForm({
  prefill,
  tags,
  shops,
  locations,
}: {
  prefill: AddItemPrefill;
  /** Tags already used in this kitchen, offered so the vocabulary converges. */
  tags: string[];
  /** Shops this kitchen already buys from. */
  shops: string[];
  /** This kitchen's own places, not a fixed list - see lib/kitchens.ts. */
  locations: string[];
}) {
  const [state, formAction, pending] = useActionState<AddItemState, FormData>(
    addItem,
    {},
  );
  const [unit, setUnit] = useState(prefill.unit ?? "g");
  // A scan arrives knowing the pack; typing it by hand is opt-in.
  const [packed, setPacked] = useState(Boolean(prefill.pack_size));
  const [unspecified, setUnspecified] = useState(false);

  // An unrecognised prefill unit falls back to mass rather than blanking the
  // label; the action rejects it on submit either way.
  const dimension = dimensionOf(unit) ?? "mass";

  return (
    <form action={formAction} className="space-y-4">
      {prefill.barcode && (
        <input type="hidden" name="barcode" value={prefill.barcode} />
      )}
      <div>
        <label htmlFor="name" className={LABEL}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={80}
          defaultValue={prefill.name ?? ""}
          autoFocus={!prefill.name}
          className={FIELD}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="quantity" className={LABEL}>
            {AMOUNT_LABEL[dimension]}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            required
            defaultValue={prefill.quantity ?? ""}
            className={FIELD}
          />
        </div>
        <div className="w-32">
          <label htmlFor="unit" className={LABEL}>
            Unit
          </label>
          {/* Dimension is never asked for - it follows from the unit picked. */}
          <select
            id="unit"
            name="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className={FIELD}
          >
            {(Object.keys(UNITS_BY_DIMENSION) as Dimension[]).map((dimension) => (
              <optgroup key={dimension} label={DIMENSION_LABEL[dimension]}>
                {UNITS_BY_DIMENSION[dimension].map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

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

      <div>
        <label className="flex items-center gap-2.5 text-sm font-bold">
          <input
            type="checkbox"
            checked={packed}
            onChange={(event) => setPacked(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          It comes in packs, tins or bottles
        </label>

        {/* The amount above is then what is in the OPEN one, and these say how
            many unopened ones are behind it. A scan fills both in. */}
        {packed && (
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="min-w-32 flex-1">
              <label htmlFor="pack_size" className={LABEL}>
                One holds ({unit})
              </label>
              <input
                id="pack_size"
                name="pack_size"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                defaultValue={prefill.pack_size ?? ""}
                className={FIELD}
              />
            </div>
            <div className="min-w-28 flex-1">
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
                defaultValue={prefill.sealed_count ?? "0"}
                className={FIELD}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="restock_target" className={LABEL}>
          Keep at least{" "}
          <span className="normal-case text-muted-foreground">
            optional, in {unit}
          </span>
        </label>
        <input
          id="restock_target"
          name="restock_target"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="any"
          className={FIELD}
        />
      </div>

      <div>
        <span className={LABEL}>
          Tags <span className="normal-case text-muted-foreground">optional</span>
        </span>
        {/* The first tag is the one it gets filed under, which is why the
            picker marks it rather than explaining it. */}
        <ChipPicker
          name="tags"
          options={tags}
          defaultValue={prefill.tags ?? ""}
          placeholder="Asian, sauce, soya…"
          primaryNote={(first) => (
            <>
              Filed under <strong className="text-foreground">{first}</strong> — the
              first one. Remove it to file under another.
            </>
          )}
        />
      </div>

      <div>
        <span className={LABEL}>
          Bought from <span className="normal-case text-muted-foreground">optional</span>
        </span>
        {/* Several, because plenty of things are available in more than one
            place. The first is where you usually go, which is what groups the
            shopping list. */}
        <ChipPicker
          name="shops"
          options={shops}
          defaultValue={prefill.shops ?? ""}
          placeholder="Tesco, the Asian supermarket…"
          primaryNote={(first) => (
            <>
              Usually <strong className="text-foreground">{first}</strong> — the first
              one. That is the trip it gets grouped into.
            </>
          )}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="location" className={LABEL}>
            Location
          </label>
          <select
            id="location"
            name="location"
            defaultValue={prefill.location ?? ""}
            className={FIELD}
          >
            <option value="">Unplaced</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="expiry_date" className={LABEL}>
            Expires
          </label>
          <input id="expiry_date" name="expiry_date" type="date" className={FIELD} />
        </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-36 flex-1">
          <label htmlFor="shelf_life_days" className={LABEL}>
            Keeps once open{" "}
            <span className="normal-case text-muted-foreground">days</span>
          </label>
          <input
            id="shelf_life_days"
            name="shelf_life_days"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="—"
            className={FIELD}
          />
        </div>
        <label className="flex min-w-36 flex-1 items-center gap-2.5 py-2.5 text-sm font-bold">
          <input
            type="checkbox"
            name="opened"
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          It&apos;s already open
        </label>
      </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add to pantry"}
      </button>
    </form>
  );
}
