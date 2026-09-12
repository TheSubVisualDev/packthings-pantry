"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AlarmClock } from "lucide-react";
import { splitStep } from "@/lib/step-timers";
import { TimerTray, useCookTimers } from "@/components/cook-timers";

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
/**
 * Holds the screen awake while you cook.
 *
 * Off by default and asked for explicitly: reading a recipe isn't cooking one,
 * and a page that silently stops a phone sleeping is a page that flattens a
 * battery. The lock is dropped when the component goes away, and re-taken if
 * the tab is hidden and comes back - browsers release it on their own when you
 * switch away, which is otherwise exactly when you'd lose it.
 */
function useKeepAwake(on: boolean) {
  const sentinel = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;

    let dropped = false;

    const take = async () => {
      try {
        sentinel.current = await navigator.wakeLock.request("screen");
      } catch {
        // Refused, usually because the tab isn't visible. Nothing to do.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !dropped) take();
    };

    take();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel.current?.release().catch(() => {});
      sentinel.current = null;
    };
  }, [on]);
}

/**
 * What a running timer calls itself.
 *
 * The opening words of the step, because by the time it rings the step
 * that started it is usually off screen and "20:00" on its own says
 * nothing about which pan.
 */
function stepLabel(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 44 ? `${trimmed.slice(0, 44)}\u2026` : trimmed;
}

export function RecipeMethod({
  steps,
  labels,
}: {
  steps: CookStep[];
  /** Ingredient id to its scaled display label, e.g. "400g firm tofu". */
  labels: Record<number, string>;
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [awake, setAwake] = useState(false);
  const { timers, now, start, stop } = useCookTimers();

  useKeepAwake(awake);

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
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
          Method
        </h2>
        <button
          type="button"
          aria-pressed={awake}
          onClick={() => setAwake((value) => !value)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            awake ? "bg-primary text-primary-foreground" : "bg-chip text-muted-foreground"
          }`}
        >
          {awake ? "Screen staying on" : "Keep screen on"}
        </button>
      </div>

      <TimerTray timers={timers} now={now} onStop={stop} />

      <ol className="space-y-2.5">
        {rows.map(({ step, index, showSection }) => {
          const isChecked = done[step.id] === true;
          const hasTiming = splitStep(step.body).some((p) => p.kind === "timing");

          return (
            <li key={step.id}>
              {showSection && (
                <h3 className="mt-4 mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground first:mt-0">
                  {step.section}
                </h3>
              )}

              {/* The card was one big button, which made the whole step a
                  tick target - good with wet hands, and impossible once a
                  timing inside the text needs to be a button too, since a
                  button cannot contain one. The tick moved to the left rail,
                  padded out to stay a large target, and the text is free. */}
              <div
                className={`flex gap-1 rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-opacity sm:p-5 ${
                  isChecked ? "bg-chip opacity-55" : "bg-card"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={isChecked}
                  aria-label={`Step ${index + 1} done`}
                  onClick={() =>
                    setDone((current) => ({ ...current, [step.id]: !current[step.id] }))
                  }
                  className="-my-2 -ml-2 flex shrink-0 items-start self-stretch px-2 py-2"
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold ${
                      isChecked
                        ? "bg-primary text-primary-foreground"
                        : "bg-chip text-muted-foreground"
                    }`}
                  >
                    {isChecked ? "✓" : index + 1}
                  </span>
                </button>

                <div className="ml-2.5 min-w-0 flex-1">
                  <p
                    className={`text-[15px] leading-relaxed font-medium ${
                      isChecked ? "line-through" : ""
                    }`}
                  >
                    {splitStep(step.body).map((piece, at) =>
                      piece.kind === "text" ? (
                        <span key={at}>{piece.text}</span>
                      ) : (
                        <button
                          key={at}
                          type="button"
                          onClick={() => start(stepLabel(step.body), piece.seconds)}
                          className="mx-0.5 inline-flex items-baseline gap-1 rounded-full bg-[oklch(0.94_0.06_75)] px-2 py-0.5 text-[14px] font-bold text-[oklch(0.42_0.1_60)] hover:bg-[oklch(0.90_0.08_75)]"
                        >
                          {piece.text}
                        </button>
                      ),
                    )}
                  </p>

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

                  {(step.uses.length > 0 || step.minutes !== null) && (
                    <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {/* Only when the text did not already offer one. A step
                          reading "simmer for 20 minutes" that also has
                          recipe_steps.minutes set would otherwise show the
                          same timer twice. */}
                      {step.minutes !== null && !hasTiming && (
                        <button
                          type="button"
                          onClick={() => start(stepLabel(step.body), step.minutes! * 60)}
                          className="flex items-center gap-1 rounded-full bg-[oklch(0.94_0.06_75)] px-2.5 py-1 text-xs font-bold text-[oklch(0.42_0.1_60)] hover:bg-[oklch(0.90_0.08_75)]"
                        >
                          <AlarmClock className="h-3 w-3" strokeWidth={3} />
                          {step.minutes} min
                        </button>
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
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
