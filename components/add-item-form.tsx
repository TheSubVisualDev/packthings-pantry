"use client";

import { useActionState } from "react";
import { addItem, type AddItemState } from "@/app/pantry/actions";
import { LOCATIONS } from "@/lib/locations";
import { UNITS_BY_DIMENSION } from "@/lib/units";
import type { Dimension } from "@/lib/types";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL =
  "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";

const DIMENSION_LABEL: Record<Dimension, string> = {
  mass: "Weight",
  volume: "Volume",
  count: "Count",
};

/** Values a barcode scan can arrive with; everything is optional. */
export interface AddItemPrefill {
  name?: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

export function AddItemForm({
  prefill,
  categories,
}: {
  prefill: AddItemPrefill;
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState<AddItemState, FormData>(
    addItem,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
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
            Quantity
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
            defaultValue={prefill.unit ?? "g"}
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
        <input
          id="category"
          name="category"
          type="text"
          list="known-categories"
          defaultValue={prefill.category ?? ""}
          className={FIELD}
        />
        {/* Suggests what's already in use so the grouping doesn't fragment
            into "Dairy", "dairy" and "Dairy products". */}
        <datalist id="known-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="location" className={LABEL}>
            Location
          </label>
          <select id="location" name="location" defaultValue="" className={FIELD}>
            <option value="">Unplaced</option>
            {LOCATIONS.map((location) => (
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
