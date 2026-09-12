"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import {
  cookRecipe,
  rateRecipe,
  undoCook,
  type CookResult,
  type UndoResult,
} from "@/app/recipes/[id]/actions";
import { totalOnHand } from "@/lib/containers";
import { SubstitutePicker } from "@/components/substitute-picker";
import { NewPackDates } from "@/components/new-pack-dates";
import { AddShortfallButton } from "@/components/add-shortfall-button";
import { RecipeMethod, type CookStep } from "@/components/recipe-method";
import {
  describeAmount,
  formatQuantity,
  resolveAmount,
  scaleQuantity,
} from "@/lib/units";
import type { Item } from "@/lib/types";

/** A stand-in the pantry could offer for one ingredient. */
export interface SubstituteOption {
  id: number;
  name: string;
  /** Tags it has in common with what the recipe asked for, if any. */
  shared: string[];
  /** Its stock row, so a swap can be judged against the shelf immediately. */
  level: Pick<
    Item,
    | "quantity"
    | "canonical_unit"
    | "sealed_count"
    | "pack_size"
    | "pack_unit"
    | "unspecified"
    | "dimension"
  >;
}

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
  /**
   * The stock row this line resolves to, carrying its containers.
   *
   * Not just `quantity`: that is what is in the OPEN one, and judging a
   * recipe against it called things short with sealed packs behind them.
   */
  item: Pick<
    Item,
    | "quantity"
    | "dimension"
    | "canonical_unit"
    | "sealed_count"
    | "pack_size"
    | "pack_unit"
    | "unspecified"
  > | null;
  /** What else is in that could stand in, best first. Empty is common. */
  substitutes: SubstituteOption[];
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
/**
 * Judges one line against the shelf - or against its stand-in, if one has been
 * picked. The substitute is compared exactly as the original would be, so
 * swapping in something you have less of still reads as short.
 */
function resolve(
  line: CookLine,
  swap: SubstituteOption | null,
  base: number,
  servings: number,
): { status: Status; display: number } {
  const scaled = scaleQuantity(line.quantity, base, servings);
  /**
   * The stand-in's stock row, or the line's own.
   *
   * Checked before the not-in-pantry case rather than after: a substitute is
   * most useful exactly when the recipe asks for something this kitchen has
   * never held, and testing line.item first would refuse to offer one.
   */
  const level = swap ? swap.level : line.item;
  if (!level) return { status: { kind: "not-in-pantry" }, display: scaled };

  const converted = resolveAmount(
    scaled,
    line.unit,
    { size: line.pack_size, unit: line.pack_unit },
    level.dimension,
  );

  if (!converted.ok) {
    return {
      status: {
        kind: "needs-manual",
        detail:
          converted.reason === "dimension-mismatch"
            ? `${line.unit} can't convert to ${level.canonical_unit}`
            : `unknown unit "${line.unit}"`,
      },
      display: scaled,
    };
  }

  // Counts are rounded up during conversion, so show the whole number that
  // will actually leave stock rather than the raw fraction.
  const display =
    level.dimension === "count" ? converted.quantity : scaled;

  /**
   * Everything on the shelf, not just the open container.
   *
   * `quantity` has meant "what is in the open one" since containers arrived,
   * so comparing against it called a recipe short while two sealed bottles sat
   * behind the nearly-empty one. Unspecified items have no number to compare,
   * and are taken at their word.
   */
  const onHand = totalOnHand(level);

  if (onHand !== null && converted.quantity > onHand) {
    return {
      status: {
        kind: "short",
        detail: `need ${formatQuantity(converted.quantity)}${level.canonical_unit}, have ${formatQuantity(onHand)}${level.canonical_unit}`,
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
      // Deliberately not the destructive colour the other two use. An
      // ingredient you have not bought is a shopping item, not a fault - and a
      // recipe written before you own any of it went red from top to bottom,
      // which made writing one down feel like doing something wrong.
      <span className={`${base} bg-chip text-muted-foreground`}>To buy</span>
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
  hasKitchen,
  inCookbook,
}: {
  recipeId: number;
  baseServings: number;
  rating: number | null;
  lines: CookLine[];
  steps: CookStep[];
  /** Cooking spends stock, so without a kitchen there's nothing to spend. */
  hasKitchen: boolean;
  /**
   * Whether this kitchen has adopted the recipe.
   *
   * Cooking is gated on it because the links that decide what comes off the
   * shelf are written when a recipe is adopted. Cooking one that has not been
   * would have to guess at the stove, which is the one place guessing is worst.
   */
  inCookbook: boolean;
}) {
  const [servings, setServings] = useState(baseServings);
  const [result, setResult] = useState<CookResult | null>(null);
  const [undone, setUndone] = useState<UndoResult | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();

  /**
   * Stand-ins chosen for this cook, by ingredient line.
   *
   * Not saved to the recipe: using oat milk tonight because that is what is in
   * does not make it an oat milk recipe. It lives as long as this screen does.
   */
  const [swaps, setSwaps] = useState<Record<number, number>>({});

  /**
   * Which ingredients have actually gone in.
   *
   * Cooking used to fire the moment you pressed a button at the top, which is
   * backwards from how cooking goes: you work down the list, and the moment
   * you are *finished* is the moment the stock has really moved. Nothing is
   * written until Confirm.
   *
   * Everything starts ticked. The common case by a long way is that you used
   * the whole recipe, and a checklist you have to fill in before you can cook
   * would be a worse version of the button it replaced.
   */
  const [ticked, setTicked] = useState<Record<number, boolean>>({});

  /** The unticked lines, shown for confirmation. Null while not asking. */
  const [asking, setAsking] = useState<string[] | null>(null);
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

  const resolved = lines.map((line) => {
    const swap =
      line.substitutes.find((option) => option.id === swaps[line.id]) ?? null;
    return { line, swap, ...resolve(line, swap, baseServings, servings) };
  });

  const blockers = resolved.filter((r) => r.status.kind !== "in-stock");

  // Unticked means not used. A line is ticked unless it has been untucked, so
  // a recipe opened and confirmed straight away behaves exactly as the old
  // single button did.
  const skippedLines = resolved.filter(({ line }) => ticked[line.id] === false);
  const skippedIds = skippedLines.map(({ line }) => line.id);

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

  function cook(skip: number[]) {
    setResult(null);
    setUndone(null);
    setAsking(null);
    setDeadline(0);
    setSecondsLeft(0);

    startTransition(async () => {
      const cooked = await cookRecipe(recipeId, servings, swaps, skip);
      setResult(cooked);

      if (cooked.eventId !== undefined) {
        setSecondsLeft(UNDO_WINDOW_SECONDS);
        setDeadline(Date.now() + UNDO_WINDOW_SECONDS * 1000);
      }
    });
  }

  /**
   * Confirming, and asking about anything left unticked.
   *
   * An unticked line is genuinely ambiguous - it can mean "I did not use this"
   * or "I forgot to tick it" - and the app does not guess, because guessing
   * wrong either leaves stock too high or spends something that is still in
   * the cupboard. The prompt appears only when something is actually unticked,
   * so a full recipe still confirms in one tap.
   */
  function onConfirm() {
    if (skippedIds.length === 0) {
      cook([]);
      return;
    }
    setAsking(skippedLines.map(({ line }) => line.item_name));
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
              {section.entries.map(({ line, swap, display, status }) => (
                <li
                  key={line.id}
                  className="border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
                >
                  <div className="flex items-center justify-between gap-3">
                  {hasKitchen && inCookbook && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={ticked[line.id] !== false}
                      aria-label={`Used ${line.item_name}`}
                      onClick={() =>
                        setTicked((current) => ({
                          ...current,
                          [line.id]: current[line.id] === false,
                        }))
                      }
                      className={
                        ticked[line.id] === false
                          ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border"
                          : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      }
                    >
                      {ticked[line.id] !== false && (
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      )}
                    </button>
                  )}
                  <div className={`min-w-0 flex-1 ${ticked[line.id] === false ? "opacity-45" : ""}`}>
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
                  </div>

                  {line.substitutes.length > 0 && (
                    <SubstitutePicker
                      options={line.substitutes}
                      chosen={swap}
                      wanted={line.item_name}
                      onChoose={(id) =>
                        setSwaps((current) => {
                          const next = { ...current };
                          if (id === null) delete next[line.id];
                          else next[line.id] = id;
                          return next;
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

        {/* Right under the ingredients, because "can I make this tonight" is
            answered here and the answer is useless three screens down past the
            method. The cook flow offers it again afterwards for what it could
            not decrement. */}
        {hasKitchen && blockers.length > 0 && !result && (
          <div className="rounded-[16px] bg-chip px-4 py-3">
            <p className="text-center text-sm font-semibold text-muted-foreground">
              {/* A recipe you own none of is a normal thing to have written
                  down - something you meant to try - so it reads as a plan
                  rather than as a shortage. */}
              {blockers.length === resolved.length
                ? `Nothing for this is in yet. Shopping for ${servings}?`
                : `Short of ${blockers.length} ${
                    blockers.length === 1 ? "thing" : "things"
                  } for ${servings}.`}
            </p>
            <div className="mt-1.5">
              <AddShortfallButton recipeId={recipeId} servings={servings} />
            </div>
          </div>
        )}

      {hasKitchen && inCookbook ? (
        <div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="w-full rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            {pending
              ? "Cooking…"
              : skippedIds.length > 0
                ? `Done — cooked ${resolved.length - skippedIds.length} of ${resolved.length}`
                : `Done — cooked for ${servings}`}
          </button>
          <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
            Stock moves when you press this, not before. Untick anything you did
            not use.
          </p>
        </div>
      ) : hasKitchen ? (
        <p className="rounded-[14px] bg-chip px-4 py-3.5 text-center text-sm font-semibold text-muted-foreground">
          Add it to your cookbook below and this becomes Cook. That is where the
          ingredients get linked to your shelves.
        </p>
      ) : (
        <p className="rounded-[14px] bg-chip px-4 py-3.5 text-center text-sm font-semibold text-muted-foreground">
          Cooking takes things off a shelf, so it needs{" "}
          <Link href="/kitchens" className="font-bold text-primary underline underline-offset-2">
            a kitchen
          </Link>
          . You can still read the recipe.
        </p>
      )}

      <Sheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={
          asking?.length === 1
            ? "One thing you did not tick"
            : `${asking?.length ?? 0} things you did not tick`
        }
        description="Leave them on the shelf, or take them off anyway?"
        footer={
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => cook(skippedIds)}
              className="w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
            >
              Did not use {asking?.length === 1 ? "it" : "them"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => cook([])}
              className="mt-2 w-full rounded-[14px] bg-chip px-4 py-3 text-sm font-bold disabled:opacity-60"
            >
              Used everything after all
            </button>
          </>
        }
      >
        <ul className="space-y-1">
          {(asking ?? []).map((name) => (
            <li key={name} className="text-sm font-bold break-words">
              {name}
            </li>
          ))}
        </ul>
      </Sheet>

      <RecipeMethod steps={steps} labels={labels} />


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
              {/* Said plainly, because a cook that left things out is a
                  different cook and the log records it as one. */}
              {result.skipped.length > 0 && (
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  Left on the shelf: {result.skipped.join(", ")}.
                </p>
              )}

              {/* Before the shortfalls: a packet in your hand is a question
                  with a short shelf life, and it should not be below a list. */}
              <NewPackDates opened={result.opened} />

              {result.flagged.length > 0 && (
                <div className="mt-4">
                  <div className="mb-3">
                    <AddShortfallButton recipeId={recipeId} servings={servings} />
                  </div>
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
