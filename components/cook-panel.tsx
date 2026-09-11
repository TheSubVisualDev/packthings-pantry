"use client";

import { useEffect, useState, useTransition } from "react";
import {
  cookRecipe,
  rateRecipe,
  undoCook,
  type CookResult,
  type UndoResult,
} from "@/app/recipes/[id]/actions";
import { RecipeMethod, type CookStep } from "@/components/recipe-method";
import {
  describeAmount,
  formatQuantity,
  resolveAmount,
  scaleQuantity,
} from "@/lib/units";
import type { Dimension } from "@/lib/types";

export interface CookLine {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  /** "1 tin (400 g)": what one unit amounts to, when it's a package. */
  pack_size: number | null;
  pack_unit: string | null;
  note: string | null;
  optional: boolean;
  section: string | null;
  item: {
    quantity: number;
    dimension: Dimension;
    canonical_unit: string;
  } | null;
}

/** How long the undo stays the loud button. It never stops being possible. */
const UNDO_WINDOW_SECONDS = 10;

type Status =
  | { kind: "in-stock" }
  | { kind: "short"; detail: string }
  | { kind: "not-in-pantry" }
  | { kind: "needs-manual"; detail: string };

/**
 * Resolves a line at the chosen serving count. Recomputed on every servings
 * change - whether a line is short depends on how many you're cooking for.
 */
function resolve(
  line: CookLine,
  base: number,
  servings: number,
): { status: Status; display: number } {
  const scaled = scaleQuantity(line.quantity, base, servings);
  if (!line.item) return { status: { kind: "not-in-pantry" }, display: scaled };

  const converted = resolveAmount(
    scaled,
    line.unit,
    { size: line.pack_size, unit: line.pack_unit },
    line.item.dimension,
  );

  if (!converted.ok) {
    return {
      status: {
        kind: "needs-manual",
        detail:
          converted.reason === "dimension-mismatch"
            ? `${line.unit} can't convert to ${line.item.canonical_unit}`
            : `unknown unit "${line.unit}"`,
      },
      display: scaled,
    };
  }

  // Counts are rounded up during conversion, so show the whole number that
  // will actually leave stock rather than the raw fraction.
  const display =
    line.item.dimension === "count" ? converted.quantity : scaled;

  if (converted.quantity > line.item.quantity) {
    return {
      status: {
        kind: "short",
        detail: `need ${formatQuantity(converted.quantity)}${line.item.canonical_unit}, have ${formatQuantity(line.item.quantity)}${line.item.canonical_unit}`,
      },
      display,
    };
  }
  return { status: { kind: "in-stock" }, display };
}

function StatusBadge({ status }: { status: Status }) {
  const base =
    "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap";
  if (status.kind === "in-stock")
    return (
      <span className={`${base} bg-chip text-muted-foreground`}>In stock</span>
    );
  if (status.kind === "short")
    return (
      <span
        className={`${base} bg-[oklch(0.94_0.06_75)] text-[oklch(0.42_0.1_60)]`}
        title={status.detail}
      >
        Low
      </span>
    );
  if (status.kind === "not-in-pantry")
    return (
      <span className={`${base} bg-[oklch(0.94_0.05_35)] text-destructive`}>
        Not in pantry
      </span>
    );
  return (
    <span
      className={`${base} bg-[oklch(0.94_0.05_35)] text-destructive`}
      title={status.detail}
    >
      Manual
    </span>
  );
}

export function CookPanel({
  recipeId,
  baseServings,
  rating,
  lines,
  steps,
}: {
  recipeId: number;
  baseServings: number;
  rating: number | null;
  lines: CookLine[];
  steps: CookStep[];
}) {
  const [servings, setServings] = useState(baseServings);
  const [result, setResult] = useState<CookResult | null>(null);
  const [undone, setUndone] = useState<UndoResult | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();
  const [undoPending, startUndo] = useTransition();
  const [ratingPending, startRating] = useTransition();

  // Reads off a fixed deadline rather than decrementing a counter, so a tab
  // that was backgrounded comes back showing the right number, not a stale one.
  // The deadline itself is set in the cook handler; this only ticks.
  useEffect(() => {
    if (!deadline) return;

    const timer = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setSecondsLeft(left > 0 ? left : 0);
      if (left <= 0) clearInterval(timer);
    }, 250);

    return () => clearInterval(timer);
  }, [deadline]);

  const resolved = lines.map((line) => ({
    line,
    ...resolve(line, baseServings, servings),
  }));

  const blockers = resolved.filter((r) => r.status.kind !== "in-stock");

  // Kept in the order the recipe gave them, so a section header appears where
  // its lines start rather than being sorted somewhere else.
  const sections: { name: string | null; entries: typeof resolved }[] = [];
  for (const entry of resolved) {
    const name = entry.line.section;
    const last = sections.at(-1);
    if (last && last.name === name) last.entries.push(entry);
    else sections.push({ name, entries: [entry] });
  }

  // What each step should say it needs, at the serving count chosen now.
  const labels: Record<number, string> = {};
  for (const { line, display } of resolved) {
    labels[line.id] =
      `${describeAmount(display, line.unit, { size: line.pack_size, unit: line.pack_unit })} ${line.item_name}`;
  }

  function onCook() {
    setResult(null);
    setUndone(null);
    setDeadline(0);
    setSecondsLeft(0);

    startTransition(async () => {
      const cooked = await cookRecipe(recipeId, servings);
      setResult(cooked);

      if (cooked.eventId !== undefined) {
        setSecondsLeft(UNDO_WINDOW_SECONDS);
        setDeadline(Date.now() + UNDO_WINDOW_SECONDS * 1000);
      }
    });
  }

  function onUndo(eventId: number) {
    startUndo(async () => {
      setUndone(await undoCook(eventId));
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
          Cooking for
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center justify-between rounded-[14px] bg-card px-4 py-3 font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              aria-label="Fewer servings"
              onClick={() => setServings((v) => Math.max(1, v - 1))}
              className="text-2xl leading-none text-primary disabled:opacity-30"
              disabled={servings <= 1}
            >
              &minus;
            </button>
            <span className="tabular-nums">
              {servings} {servings === 1 ? "serving" : "servings"}
            </span>
            <button
              type="button"
              aria-label="More servings"
              onClick={() => setServings((v) => Math.min(50, v + 1))}
              className="text-2xl leading-none text-primary disabled:opacity-30"
              disabled={servings >= 50}
            >
              +
            </button>
          </div>
          {servings !== baseServings && (
            <button
              type="button"
              onClick={() => setServings(baseServings)}
              className="shrink-0 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
        {servings !== baseServings && (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            Scaled &times;{formatQuantity(servings / baseServings)} from base{" "}
            {baseServings}. Stored quantities stay at base.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
          Ingredients
        </h2>
        {sections.map((section) => (
          <div key={section.name ?? ""} className="mb-3 last:mb-0">
            {section.name && (
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {section.name}
              </h3>
            )}
            <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {section.entries.map(({ line, display, status }) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="font-bold break-words">
                      {line.item_name}
                      {line.optional && (
                        <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                          optional
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-quantity">
                      {describeAmount(display, line.unit, {
                        size: line.pack_size,
                        unit: line.pack_unit,
                      })}
                      {line.note && (
                        <span className="font-medium text-muted-foreground">
                          {" "}
                          &middot; {line.note}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={onCook}
        disabled={pending}
        className="w-full rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Cooking…" : `Cook for ${servings}`}
      </button>

      <RecipeMethod steps={steps} labels={labels} />

      {blockers.length > 0 && !result && (
        <p className="text-center text-xs font-semibold text-muted-foreground">
          {blockers.length} {blockers.length === 1 ? "line" : "lines"} won&apos;t
          decrement cleanly &mdash; they&apos;ll be listed after cooking.
        </p>
      )}

      {result && (
        <section
          className={`rounded-[20px] p-5 ${result.ok ? "bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]" : "bg-[oklch(0.96_0.03_40)]"}`}
        >
          {!result.ok ? (
            <p className="text-sm font-bold text-destructive">
              {result.error ?? "Cook failed"}
            </p>
          ) : undone?.ok ? (
            <>
              <h3 className="text-sm font-extrabold">
                Undone &mdash; stock put back
              </h3>
              {undone.restored.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm font-semibold text-muted-foreground">
                  {undone.restored.map((line) => (
                    <li key={line.item_name}>
                      {line.item_name} +{formatQuantity(line.restored)}
                      {line.unit === "count" ? "" : line.unit} (
                      {formatQuantity(line.quantity)} now)
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h3 className="text-sm font-extrabold">
                Cooked &mdash; {result.applied.length} of{" "}
                {result.applied.length + result.flagged.length} lines decremented
              </h3>
              {result.applied.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm font-semibold text-muted-foreground">
                  {result.applied.map((line) => (
                    <li key={line.item_name}>
                      {line.item_name} &minus;
                      {formatQuantity(line.decremented ?? 0)}
                      {line.unit === "count" ? "" : line.unit} (
                      {formatQuantity(line.remaining ?? 0)} left)
                    </li>
                  ))}
                </ul>
              )}
              {result.flagged.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-extrabold text-destructive">
                    Needs manual handling
                  </h4>
                  <ul className="mt-1 space-y-1 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
                    {result.flagged.map((line) => (
                      <li key={line.item_name}>
                        {line.item_name}
                        {line.detail ? ` — ${line.detail}` : ""}
                        {line.issue === "not-in-pantry"
                          ? " — not in pantry"
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.eventId !== undefined && (
                <div className="mt-4">
                  {secondsLeft > 0 ? (
                    <button
                      type="button"
                      onClick={() => onUndo(result.eventId!)}
                      disabled={undoPending}
                      className="w-full rounded-[14px] bg-ink px-4 py-3 text-sm font-extrabold text-background transition-opacity disabled:opacity-60"
                    >
                      {undoPending
                        ? "Undoing…"
                        : `Undo · ${secondsLeft}s`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUndo(result.eventId!)}
                      disabled={undoPending}
                      className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
                    >
                      {undoPending ? "Undoing…" : "Undo this cook"}
                    </button>
                  )}
                  {undone && !undone.ok && (
                    <p role="alert" className="mt-2 text-sm font-bold text-destructive">
                      {undone.error ?? "Undo failed"}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
          What you thought
        </h2>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} out of 5`}
              disabled={ratingPending}
              onClick={() =>
                startRating(async () => {
                  await rateRecipe(recipeId, star);
                })
              }
              className={`text-2xl leading-none transition-opacity disabled:opacity-50 ${
                rating !== null && star <= rating
                  ? "text-primary"
                  : "text-border hover:text-primary/50"
              }`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-sm font-semibold text-muted-foreground">
            {rating === null ? "Not rated yet" : `${rating}/5`}
          </span>
        </div>
      </section>
    </div>
  );
}
