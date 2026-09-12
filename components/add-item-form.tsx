"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Undo2 } from "lucide-react";
import { addItem, type AddItemState } from "@/app/pantry/actions";
import { ChipPicker } from "@/components/chip-picker";
import { dimensionOf, UNITS_BY_DIMENSION } from "@/lib/units";
import { probableDuplicate, suggestFor, type ItemProfile } from "@/lib/suggest";
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
  profiles,
}: {
  prefill: AddItemPrefill;
  /**
   * What this kitchen already holds, trimmed to the fields worth copying.
   *
   * Handed over at page load rather than asked for per keystroke: the database
   * is in Nuremberg and a form that pauses while it thinks is a form that feels
   * slower than typing the answer yourself.
   */
  profiles: ItemProfile[];
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
  const [name, setName] = useState(prefill.name ?? "");
  const [unspecified, setUnspecified] = useState(false);

  /**
   * What the kitchen reckons, from the name alone.
   *
   * Recomputed as you type rather than on blur, because the whole effect
   * depends on the rest of the form being filled in by the time you look down
   * at it.
   *
   * A scan runs this too, per field rather than instead of it. The barcode
   * knows the pack size and the brand-free name and nothing else; it has no
   * idea which shelf you keep it on or what you file it under, and it used to
   * block the guess that did.
   */
  const suggestion = useMemo(() => suggestFor(name, profiles), [name, profiles]);

  /**
   * The row this probably already is.
   *
   * A pantry holding both Tomatoes and Tomatos has every recipe match, rescue
   * and shopping list quietly half right, and this is the one moment it costs
   * nothing to stop.
   */
  const duplicate = useMemo(() => probableDuplicate(name, profiles), [name, profiles]);

  /**
   * Fields somebody has actually touched.
   *
   * A suggestion may only ever land in a field nobody has filled in. Typing
   * over something and watching it change back is the failure mode that makes
   * people distrust every clever form they meet afterwards.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  function set(field: string, value: string) {
    setTouched((current) => ({ ...current, [field]: true }));
    setOverrides((current) => ({ ...current, [field]: value }));
  }

  /**
   * What you typed, then what the scan knew, then what the kitchen reckons.
   *
   * That order matters: a barcode read off the packet in front of you beats a
   * guess from a similar jar, but only for the fields it actually carries.
   * Everywhere it is silent the guess still answers.
   */
  const valueOf = (
    field: string,
    scanned: string | undefined,
    suggested: string | undefined,
    fallback: string,
  ) =>
    touched[field]
      ? (overrides[field] ?? fallback)
      : (scanned ?? suggested ?? fallback);

  const unit = valueOf("unit", prefill.unit, suggestion.unit, "g");
  const location = valueOf("location", prefill.location, suggestion.location, "");
  const packSize = valueOf("pack_size", prefill.pack_size, suggestion.pack_size, "");
  const shelfLife = valueOf("shelf_life_days", undefined, suggestion.shelf_life_days, "");

  // A scan arrives knowing the pack, and so does anything copied from a jar you
  // already own; typing it by hand is still opt-in.
  const [packedOverride, setPackedOverride] = useState<boolean | null>(null);
  const packed = packedOverride ?? Boolean(packSize);

  /**
   * Remounts the chip pickers when the guess changes.
   *
   * They keep their own state from defaultValue, which is right for typing and
   * wrong for being handed a new answer. Keying on what the suggestion was
   * based on re-seeds them exactly when the suggestion itself changed.
   */
  const chipKey = (field: "tags" | "shops") =>
    touched[field] ? "own" : (suggestion.because ?? "none");

  function forget() {
    // Everything the guess filled in becomes yours, unchanged, so dismissing
    // it never wipes a field you were about to keep.
    setTouched({
      unit: true,
      location: true,
      pack_size: true,
      shelf_life_days: true,
      tags: true,
      shops: true,
    });
    setOverrides({
      unit,
      location,
      pack_size: packSize,
      shelf_life_days: shelfLife,
    });
    setPackedOverride(packed);
  }

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
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus={!prefill.name}
          className={FIELD}
        />

        {duplicate && (
          <p className="mt-2 rounded-[12px] bg-chip px-3 py-2 text-sm font-semibold">
            You already have{" "}
            <Link
              href={`/pantry/item/${duplicate.id}`}
              className="font-extrabold text-primary underline underline-offset-2"
            >
              {duplicate.name}
            </Link>
            . Add to that one instead of starting a second row?
          </p>
        )}

        {!duplicate && suggestion.because && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
            Filled in {suggestion.because}.
            <button
              type="button"
              onClick={forget}
              className="inline-flex items-center gap-1 font-bold text-foreground underline underline-offset-2"
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} />
              leave it to me
            </button>
          </p>
        )}
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
            onChange={(event) => set("unit", event.target.value)}
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
            onChange={(event) => setPackedOverride(event.target.checked)}
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
                value={packSize}
                onChange={(event) => set("pack_size", event.target.value)}
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
          key={`tags-${chipKey("tags")}`}
          name="tags"
          options={tags}
          onDirty={() => setTouched((c) => ({ ...c, tags: true }))}
          defaultValue={prefill.tags || suggestion.tags?.join(", ") || ""}
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
          key={`shops-${chipKey("shops")}`}
          name="shops"
          options={shops}
          onDirty={() => setTouched((c) => ({ ...c, shops: true }))}
          defaultValue={prefill.shops || suggestion.shops?.join(", ") || ""}
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
            value={location}
            onChange={(event) => set("location", event.target.value)}
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
            value={shelfLife}
            onChange={(event) => set("shelf_life_days", event.target.value)}
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
