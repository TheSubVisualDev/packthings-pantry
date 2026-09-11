import { dominantMacro, macroShare } from "@/lib/nutrition";
import { formatQuantity } from "@/lib/units";
import type { RecipeMacros } from "@/lib/recipe-nutrition";

const ROWS = [
  { key: "protein_100", label: "Protein" },
  { key: "carbs_100", label: "Carbs" },
  { key: "fat_100", label: "Fat" },
  { key: "fibre_100", label: "Fibre" },
  { key: "salt_100", label: "Salt" },
] as const;

/**
 * Roughly what a portion comes to.
 *
 * "Roughly" is the whole design. Figures come from Open Food Facts by barcode,
 * so a kitchen full of loose spices and unbranded veg will have gaps, and the
 * coverage line says exactly how many lines are behind the number. A confident
 * total over half the ingredients would be worse than no total at all.
 *
 * It does not move with the serving stepper, and does not need to: scaling a
 * recipe multiplies the total and the number of portions by the same amount, so
 * what one portion contains is the same whether you cook for two or for ten.
 * Computed once on the server, at base servings.
 */
export function RecipeNutrition({ macros }: { macros: RecipeMacros }) {
  if (macros.counted === 0) return null;

  const dominant = dominantMacro(macros);
  const partial = macros.counted < macros.total;

  return (
    <section className="mt-5 rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        Per portion
      </h2>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {macros.kcal_100 !== null && (
          <span className="text-[22px] font-extrabold tracking-[-0.01em]">
            {Math.round(macros.kcal_100)}
            <span className="ml-1 text-sm font-bold text-muted-foreground">kcal</span>
          </span>
        )}
        {dominant && (
          <span className="text-sm font-bold text-muted-foreground">
            mostly {dominant} — {Math.round(macroShare(macros, dominant) * 100)}%
            of its energy
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {ROWS.map((row) =>
          macros[row.key] === null ? null : (
            <div key={row.key} className="flex items-baseline justify-between gap-2">
              <dt className="text-sm font-semibold text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-sm font-bold tabular-nums">
                {formatQuantity(Math.round(macros[row.key]! * 10) / 10)}g
              </dd>
            </div>
          ),
        )}
      </dl>

      <p className="mt-3 text-xs font-semibold text-muted-foreground">
        {partial ? (
          <>
            From {macros.counted} of {macros.total} ingredients — nothing known
            about {macros.missing.slice(0, 3).join(", ")}
            {macros.missing.length > 3 ? ` and ${macros.missing.length - 3} more` : ""}
            , so the real figure is higher.
          </>
        ) : (
          <>From all {macros.total} ingredients.</>
        )}
        {macros.estimated > 0 && (
          <>
            {" "}
            {macros.estimated} of them{" "}
            {macros.estimated === 1 ? "is a" : "are"} standard figure
            {macros.estimated === 1 ? "" : "s"} rather than a packet.
          </>
        )}
      </p>
    </section>
  );
}
