import { dominantMacro, macroShare } from "@/lib/nutrition";
import { formatQuantity } from "@/lib/units";
import type { WeekMacros } from "@/lib/recipe-nutrition";
import type { Macros } from "@/lib/nutrition";

const ROWS = [
  { key: "protein_100", label: "Protein" },
  { key: "carbs_100", label: "Carbs" },
  { key: "fat_100", label: "Fat" },
  { key: "fibre_100", label: "Fibre" },
  { key: "salt_100", label: "Salt" },
] as const;

/**
 * What the week you have planned comes to.
 *
 * Asked before the shopping rather than after the eating, which is the only
 * moment at which the answer can still change anything - and is the reason
 * this sits on the planner rather than on /stats.
 *
 * The per-portion average leads and the week total follows, because the
 * average is the comparable number. A week total depends on how many people
 * you cooked for, so it cannot be read against your own last week, let alone
 * anybody else's; a plate is a plate. It is also the same shape of figure the
 * recipe page already shows, so the two can be held in one head.
 *
 * How many of the planned meals are actually behind the number is said out
 * loud. Three dinners' worth of figures presented as a week is worse than no
 * figures at all, because it looks like an answer.
 */
export function WeekNutrition({
  week,
  each,
}: {
  week: WeekMacros;
  /** The same week divided by its portions. */
  each: Macros;
}) {
  if (week.counted === 0) return null;

  const dominant = dominantMacro(each);
  const partial = week.counted < week.meals;

  return (
    <section className="mt-5 rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <h2 className="text-xs font-bold tracking-[0.1em] text-label uppercase">
        This week, per plate
      </h2>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {each.kcal_100 !== null && (
          <span className="text-[22px] font-extrabold tracking-[-0.01em]">
            {Math.round(each.kcal_100)}
            <span className="ml-1 text-sm font-bold text-muted-foreground">
              kcal
            </span>
          </span>
        )}
        {dominant && (
          <span className="text-sm font-semibold text-muted-foreground">
            mostly {dominant} &mdash;{" "}
            {Math.round(macroShare(each, dominant) * 100)}% of its energy
          </span>
        )}
      </div>

      {/* The same five rows the recipe page shows, so a plate here and a
          portion there are read the same way. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {ROWS.map(({ key, label }) =>
          each[key] === null ? null : (
            <div key={key} className="flex items-baseline justify-between gap-2">
              <dt className="text-sm font-semibold text-muted-foreground">
                {label}
              </dt>
              <dd className="text-sm font-bold tabular-nums">
                {formatQuantity(Math.round(each[key]! * 10) / 10)}g
              </dd>
            </div>
          ),
        )}
      </dl>

      {/* The week total second, and said as what it is: a sum over however
          many plates, which is a different kind of number from the one above. */}
      {week.kcal_100 !== null && (
        <p className="mt-3 border-t border-border pt-3 text-sm font-semibold text-muted-foreground">
          <span className="font-mono font-bold tabular-nums text-foreground">
            {Math.round(week.kcal_100).toLocaleString("en-GB")} kcal
          </span>{" "}
          across the whole week &mdash; {week.portions}{" "}
          {week.portions === 1 ? "plate" : "plates"} over {week.counted}{" "}
          {week.counted === 1 ? "meal" : "meals"}.
        </p>
      )}

      {/*
        Coverage, stated rather than implied.

        A confident total resting on three of seven dinners is worse than no
        total, because it looks like an answer to a question it has not
        answered. The names are there so the gap is fixable rather than just
        disclosed.
      */}
      {partial && (
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          {week.meals - week.counted} of {week.meals} planned{" "}
          {week.meals === 1 ? "meal is" : "meals are"} not counted &mdash;
          nothing known about {week.missing.slice(0, 3).join(", ")}
          {week.missing.length > 3 ? ` and ${week.missing.length - 3} more` : ""}.
        </p>
      )}
    </section>
  );
}
