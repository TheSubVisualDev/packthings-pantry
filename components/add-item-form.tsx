"use client";

import { useActionState, useState } from "react";
import { addItem, type AddItemState } from "@/app/pantry/actions";
import { SoftSelect } from "@/components/soft-select";
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
  unit?: string;
  category?: string;
  location?: string;
  /** Set when the scanner sent us here; linked to the new item on submit. */
  barcode?: string;
}

export function AddItemForm({
  prefill,
  categories,
  locations,
}: {
  prefill: AddItemPrefill;
  categories: string[];
  /** This kitchen's own places, not a fixed list - see lib/kitchens.ts. */
  locations: string[];
}) {
  const [state, formAction, pending] = useActionState<AddItemState, FormData>(
    addItem,
    {},
  );
  const [unit, setUnit] = useState(prefill.unit ?? "g");

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

      <div>
        <label htmlFor="category" className={LABEL}>
          Category <span className="normal-case text-muted-foreground">optional</span>
        </label>
        {/* Offers what's already in use so the grouping doesn't fragment into
            "Dairy", "dairy" and "Dairy products", without refusing a new one. */}
        <SoftSelect
          id="category"
          name="category"
          options={categories}
          defaultValue={prefill.category ?? ""}
          className={`${FIELD} pr-11`}
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
