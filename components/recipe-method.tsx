"use client";

import Image from "next/image";
import { useState } from "react";

export interface CookStep {
  id: number;
  section: string | null;
  body: string;
  minutes: number | null;
  photo_url: string | null;
  /** recipe_ingredients ids this step draws on. */
  uses: number[];
}

/**
 * The method, laid out to be read while cooking.
 *
 * Each step carries the ingredients it uses, at the amount for the serving
 * count actually chosen - the point is not to send anyone back up the page
 * with wet hands to work out what "the tofu" meant at half quantities.
 *
 * Ticking a step off is deliberately not saved anywhere. It's a place to keep
 * your finger for the next twenty minutes, not a record of anything, and a
 * half-cooked recipe restoring its ticks a week later would be worse than
 * useless.
 */
export function RecipeMethod({
  steps,
  labels,
}: {
  steps: CookStep[];
  /** Ingredient id to its scaled display label, e.g. "400g firm tofu". */
  labels: Record<number, string>;
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});

  if (steps.length === 0) return null;

  // Worked out up front rather than tracked through the map: a heading shows
  // wherever a step's section differs from the one before it.
  const rows = steps.map((step, index) => ({
    step,
    index,
    showSection: Boolean(step.section) && step.section !== steps[index - 1]?.section,
  }));

  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
        Method
      </h2>

      <ol className="space-y-2.5">
        {rows.map(({ step, index, showSection }) => {
          const isChecked = done[step.id] === true;

          return (
            <li key={step.id}>
              {showSection && (
                <h3 className="mt-4 mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground first:mt-0">
                  {step.section}
                </h3>
              )}

              <button
                type="button"
                aria-pressed={isChecked}
                onClick={() =>
                  setDone((current) => ({ ...current, [step.id]: !current[step.id] }))
                }
                className={`flex w-full gap-3.5 rounded-[20px] p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-opacity sm:p-5 ${
                  isChecked ? "bg-chip opacity-55" : "bg-card"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                    isChecked
                      ? "bg-primary text-primary-foreground"
                      : "bg-chip text-muted-foreground"
                  }`}
                >
                  {isChecked ? "✓" : index + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[15px] leading-relaxed font-medium ${
                      isChecked ? "line-through" : ""
                    }`}
                  >
                    {step.body}
                  </span>

                  {step.photo_url && (
                    <span className="relative mt-3 block aspect-[16/10] w-full overflow-hidden rounded-[14px]">
                      <Image
                        src={step.photo_url}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 100vw, 620px"
                        className="object-cover"
                      />
                    </span>
                  )}

                  {(step.uses.length > 0 || step.minutes) && (
                    <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {step.minutes && (
                        <span className="rounded-full bg-[oklch(0.94_0.06_75)] px-2.5 py-1 text-xs font-bold text-[oklch(0.42_0.1_60)]">
                          {step.minutes} min
                        </span>
                      )}
                      {step.uses.map((id) =>
                        labels[id] ? (
                          <span
                            key={id}
                            className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted-foreground"
                          >
                            {labels[id]}
                          </span>
                        ) : null,
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
