"use client";

import { useState, useTransition } from "react";
import {
  cookRecipe,
  rateRecipe,
  type CookResult,
} from "@/app/recipes/[id]/actions";
import { formatQuantity, scaleQuantity, toCanonical } from "@/lib/units";
import type { Dimension } from "@/lib/types";

export interface CookLine {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  item: {
    quantity: number;
    dimension: Dimension;
    canonical_unit: string;
  } | null;
}

type Status =
  | { kind: "in-stock" }
  | { kind: "short"; detail: string }
  | { kind: "not-in-pantry" }
  | { kind: "needs-manual"; detail: string };

/**
 * Resolves a line at the chosen serving count. Recomputed on every servings
 * change - whether a line is short depends on how many you're cooking for.
 */
function resolve(line: CookLine, base: number, servings: number): Status {
  if (!line.item) return { kind: "not-in-pantry" };

  const scaled = scaleQuantity(line.quantity, base, servings);
  const converted = toCanonical(scaled, line.unit, line.item.dimension);

  if (!converted.ok) {
    return {
      kind: "needs-manual",
      detail:
        converted.reason === "dimension-mismatch"
          ? `${line.unit} can't convert to ${line.item.canonical_unit}`
          : `unknown unit "${line.unit}"`,
    };
  }

  if (converted.quantity > line.item.quantity) {
    return {
      kind: "short",
      detail: `need ${formatQuantity(converted.quantity)}${line.item.canonical_unit}, have ${formatQuantity(line.item.quantity)}${line.item.canonical_unit}`,
    };
  }
  return { kind: "in-stock" };
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
}: {
  recipeId: number;
  baseServings: number;
  rating: number | null;
  lines: CookLine[];
}) {
  const [servings, setServings] = useState(baseServings);
  const [result, setResult] = useState<CookResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [ratingPending, startRating] = useTransition();

  const resolved = lines.map((line) => ({
    line,
    scaled: scaleQuantity(line.quantity, baseServings, servings),
    status: resolve(line, baseServings, servings),
  }));

  const blockers = resolved.filter((r) => r.status.kind !== "in-stock");

  function onCook() {
    setResult(null);
    startTransition(async () => {
      setResult(await cookRecipe(recipeId, servings));
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
        <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {resolved.map(({ line, scaled, status }) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
            >
              <div className="min-w-0">
                <div className="font-bold break-words">{line.item_name}</div>
                <div className="text-sm font-semibold text-quantity">
                  {formatQuantity(scaled)}
                  {line.unit === "count" ? "" : ` ${line.unit}`}
                </div>
              </div>
              <StatusBadge status={status} />
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={onCook}
        disabled={pending}
        className="w-full rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Cooking…" : `Cook for ${servings}`}
      </button>

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
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
          Rating
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
            {rating === null ? "Unrated" : `${rating}/5`}
          </span>
        </div>
      </section>
    </div>
  );
}
