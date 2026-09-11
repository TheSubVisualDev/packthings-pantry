import { dominantMacro, hasMacros, macroShare } from "@/lib/nutrition";
import { formatQuantity } from "@/lib/units";
import type { Item } from "@/lib/types";

const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

const BARS = [
  { key: "protein", label: "Protein", column: "protein_100", tint: "bg-[oklch(0.62_0.12_150)]" },
  { key: "carbs", label: "Carbs", column: "carbs_100", tint: "bg-[oklch(0.72_0.13_75)]" },
  { key: "fat", label: "Fat", column: "fat_100", tint: "bg-[oklch(0.66_0.14_35)]" },
] as const;

/**
 * What an item is made of, per 100g or 100ml.
 *
 * The bar is by share of ENERGY, not by weight, and says so - because by weight
 * butter is 82% fat and 0.6% carbohydrate, while by weight cheese reads as a
 * protein when it is mostly fat. Energy share is what people mean when they
 * call something a fat or a carb, and it is the same number the shelf groups by.
 *
 * Read-only. The figures come from Open Food Facts via the barcode, cached once
 * in `products` and copied here; there is no editing because a typed-in guess
 * would be indistinguishable from a measured one.
 */
export function NutritionPanel({ item }: { item: Item }) {
  if (!hasMacros(item)) return null;

  const energy =
    (item.protein_100 ?? 0) * KCAL_PER_GRAM.protein +
    (item.carbs_100 ?? 0) * KCAL_PER_GRAM.carbs +
    (item.fat_100 ?? 0) * KCAL_PER_GRAM.fat;

  const dominant = dominantMacro(item);
  const suffix = item.canonical_unit === "ml" ? "100ml" : "100g";

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        Per {suffix}
      </h2>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {item.kcal_100 !== null && (
          <span className="text-[22px] font-extrabold tracking-[-0.01em]">
            {Math.round(item.kcal_100)}
            <span className="ml-1 text-sm font-bold text-muted-foreground">kcal</span>
          </span>
        )}
        {dominant && (
          <span className="text-sm font-bold text-muted-foreground">
            mostly {dominant} — {Math.round(macroShare(item, dominant) * 100)}% of
            its energy
          </span>
        )}
      </div>

      {energy > 0 && (
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-chip">
          {BARS.map((bar) => {
            const grams = item[bar.column] ?? 0;
            const share = (grams * KCAL_PER_GRAM[bar.key]) / energy;
            if (share <= 0) return null;
            return (
              <span
                key={bar.key}
                className={bar.tint}
                style={{ width: `${share * 100}%` }}
                aria-hidden
              />
            );
          })}
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {BARS.map((bar) =>
          item[bar.column] === null ? null : (
            <div key={bar.key} className="flex items-baseline justify-between gap-2">
              <dt className="text-sm font-semibold text-muted-foreground">
                {bar.label}
              </dt>
              <dd className="text-sm font-bold tabular-nums">
                {formatQuantity(item[bar.column]!)}g
              </dd>
            </div>
          ),
        )}
        {item.fibre_100 !== null && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-sm font-semibold text-muted-foreground">Fibre</dt>
            <dd className="text-sm font-bold tabular-nums">
              {formatQuantity(item.fibre_100)}g
            </dd>
          </div>
        )}
        {item.salt_100 !== null && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-sm font-semibold text-muted-foreground">Salt</dt>
            <dd className="text-sm font-bold tabular-nums">
              {formatQuantity(item.salt_100)}g
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-3 text-xs font-semibold text-muted-foreground">
        {item.nutrition_source === "estimate" ? (
          <>
            Estimated — these are standard figures for this kind of food, not
            what is on your packet. Scan it and the real ones replace them.
          </>
        ) : item.nutrition_source === "manual" ? (
          <>Entered by hand.</>
        ) : (
          <>From Open Food Facts, kept locally after the first look.</>
        )}
      </p>
    </div>
  );
}
