"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlarmClock, PartyPopper, ShoppingBasket } from "lucide-react";
import { AddShortfallButton } from "@/components/add-shortfall-button";
import { NewPackDates } from "@/components/new-pack-dates";
import { cookTonight, undoTonightCook, type TonightCookResult } from "@/app/tonight/actions";
import type { UndoResult } from "@/app/recipes/[id]/actions";
import { formatQuantity } from "@/lib/units";
import type { Suggestion } from "@/lib/tonight";

/** How long the undo stays the loud button. It never stops being possible. */
const UNDO_WINDOW_SECONDS = 10;

/**
 * The answer, with its reasoning on it.
 *
 * One card rather than a list, because a list is the app declining to decide
 * and that is exactly what it has been doing. The reason is not decoration:
 * a recommendation nobody can check is a magic trick, and magic tricks are not
 * trusted twice.
 */
export function TonightCard({
  suggestion,
  servings,
}: {
  suggestion: Suggestion;
  /** What the shortfall button should buy for, when there is a shortfall. */
  servings: number;
}) {
  const router = useRouter();
  const [result, setResult] = useState<TonightCookResult | null>(null);
  const [undone, setUndone] = useState<UndoResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startCook] = useTransition();
  const [undoPending, startUndo] = useTransition();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const urgent = suggestion.rescues.length > 0;
  const canCookHere = suggestion.missing.length === 0;

  function cook() {
    startCook(async () => {
      const cooked = await cookTonight(suggestion.id, servings);
      setResult(cooked);
      if (cooked.eventId !== undefined) setSecondsLeft(UNDO_WINDOW_SECONDS);
    });
  }

  function undo(eventId: number, lineIds: number[]) {
    startUndo(async () => {
      const put = await undoTonightCook(eventId, lineIds);
      setUndone(put);
      if (put.ok) router.refresh();
    });
  }

  /**
   * Cooking moves on to the next answer.
   *
   * The suggestion that has just been eaten is no longer the suggestion, and
   * leaving it on screen is the app arguing with something it was told.
   */
  function done() {
    setResult(null);
    setUndone(null);
    router.refresh();
  }

  if (result?.ok && !undone?.ok) {
    return (
      <CookedCard
        suggestion={suggestion}
        result={result}
        servings={servings}
        secondsLeft={secondsLeft}
        undoPending={undoPending}
        undoFailed={undone && !undone.ok ? (undone.error ?? "Undo failed") : null}
        onUndo={undo}
        onDone={done}
      />
    );
  }

  return (
    <article className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-label">
          Tonight
        </span>
        {urgent && (
          <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            <AlarmClock className="h-3 w-3" strokeWidth={3} />
            use it up
          </span>
        )}
      </div>

      <Link
        href={`/recipes/${suggestion.id}`}
        className="text-[22px] font-extrabold tracking-[-0.02em] break-words hover:underline"
      >
        {suggestion.name}
      </Link>

      <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
        {suggestion.reason}
      </p>

      {/*
        Cooking happens here rather than three taps into the recipe - but only
        when the app knows what would come off the shelf.

        A recipe you have seven of nineteen lines for is still the best thing
        going, and it can still be the answer, but spending stock on it blind
        would decrement seven things and flag twelve without anybody being
        asked. Short recipes go to the checklist on the recipe page, which is
        what the checklist is for.
      */}
      {canCookHere ? (
        <button
          type="button"
          onClick={cook}
          disabled={pending}
          className="mt-4 block w-full rounded-[14px] bg-primary px-4 py-3.5 text-center text-[15px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
        >
          {pending ? "Taking it off the shelves…" : "Cook it"}
        </button>
      ) : (
        <Link
          href={`/recipes/${suggestion.id}`}
          className="mt-4 block w-full rounded-[14px] bg-primary px-4 py-3.5 text-center text-[15px] font-extrabold text-primary-foreground"
        >
          Cook it
        </Link>
      )}

      {result && !result.ok && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {result.error ?? "Cook failed"}
        </p>
      )}

      {canCookHere && (
        <Link
          href={`/recipes/${suggestion.id}`}
          className="mt-2 block text-center text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Read it first
        </Link>
      )}

      {suggestion.missing.length > 0 && (
        <div className="mt-2">
          <AddShortfallButton recipeId={suggestion.id} servings={servings} />
        </div>
      )}
    </article>
  );
}

/**
 * What just left the kitchen.
 *
 * The confirmation is the receipt for a decision the app made on your behalf:
 * every number it moved, named, with one button to put them all back. It is
 * the loud moment in the app because coming home to a cooked meal and a shelf
 * that already knows is the thing the whole thing is for.
 */
function CookedCard({
  suggestion,
  result,
  servings,
  secondsLeft,
  undoPending,
  undoFailed,
  onUndo,
  onDone,
}: {
  suggestion: Suggestion;
  result: TonightCookResult;
  servings: number;
  secondsLeft: number;
  undoPending: boolean;
  undoFailed: string | null;
  onUndo: (eventId: number, lineIds: number[]) => void;
  onDone: () => void;
}) {
  const lineIds = result.listed.map((line) => line.id);

  return (
    <article className="rounded-[20px] bg-primary p-5 text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em]">
        <PartyPopper className="h-4 w-4" strokeWidth={3} />
        Cooked
      </div>

      <p className="text-[22px] font-extrabold tracking-[-0.02em] break-words">
        {suggestion.name}
      </p>

      {result.applied.length > 0 && (
        <>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.08em] opacity-80">
            Taken off your shelves
          </p>
          <ul className="mt-1.5 space-y-1 text-sm font-semibold">
            {result.applied.map((line) => (
              <li key={line.item_name} className="flex justify-between gap-3">
                <span className="break-words">{line.item_name}</span>
                <span className="font-mono text-[13px] whitespace-nowrap opacity-90">
                  &minus;{formatQuantity(line.decremented ?? 0)}
                  {line.unit === "count" ? "" : line.unit} &rarr;{" "}
                  {formatQuantity(line.remaining_total ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Running out is not a failure, so it is said in the same voice as the
          rest: it happened, and the list already knows. */}
      {result.listed.length > 0 && (
        <p className="mt-3 text-sm font-semibold opacity-90">
          {result.listed.map((line) => line.name).join(", ")} ran out &mdash;
          added to your list.
        </p>
      )}

      {result.flagged.length > 0 && (
        <p className="mt-3 text-sm font-semibold opacity-90">
          {result.flagged.map((line) => line.item_name).join(", ")} could not be
          worked out from the recipe.
        </p>
      )}

      {/* Both bring their own panel, and both are questions rather than part of
          the celebration - so they keep the ink they were drawn in. */}
      {result.opened.length > 0 && (
        <div className="text-foreground">
          <NewPackDates opened={result.opened} />
        </div>
      )}

      {result.flagged.length > 0 && (
        <div className="mt-4 rounded-[16px] bg-chip p-4 text-foreground">
          <AddShortfallButton recipeId={suggestion.id} servings={servings} />
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-[14px] bg-card px-4 py-3 text-[15px] font-extrabold text-foreground"
        >
          Done
        </button>
        {result.eventId !== undefined && (
          <button
            type="button"
            onClick={() => onUndo(result.eventId as number, lineIds)}
            disabled={undoPending}
            className="rounded-[14px] border border-primary-foreground/40 px-4 py-3 text-[15px] font-extrabold transition-opacity disabled:opacity-60"
          >
            {undoPending
              ? "Undoing…"
              : secondsLeft > 0
                ? `Undo · ${secondsLeft}s`
                : "Undo"}
          </button>
        )}
      </div>

      {undoFailed && (
        <p role="alert" className="mt-2 text-sm font-bold">
          {undoFailed}
        </p>
      )}
    </article>
  );
}

/**
 * The best thing you are one ingredient short of.
 *
 * Its own card rather than second place, because "one shop away" is a
 * different kind of answer from "cook this now" and putting it in the list
 * makes it read as a worse version of the winner. Names the single item, so
 * the decision is "do I want to buy tahini" rather than "what am I missing".
 */
export function NearlyCard({
  suggestion,
  servings,
}: {
  suggestion: Suggestion;
  servings: number;
}) {
  return (
    <article className="rounded-[20px] border border-dashed border-border p-5">
      <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-label">
        <ShoppingBasket className="h-3.5 w-3.5" strokeWidth={3} />
        One thing away
      </div>

      <Link
        href={`/recipes/${suggestion.id}`}
        className="text-[17px] font-extrabold tracking-[-0.01em] break-words hover:underline"
      >
        {suggestion.name}
      </Link>

      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        {suggestion.reason}
      </p>

      <div className="mt-3">
        <AddShortfallButton recipeId={suggestion.id} servings={servings} />
      </div>
    </article>
  );
}

/** A runner-up, for the list behind the tap. */
export function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  return (
    <Link
      href={`/recipes/${suggestion.id}`}
      className="block rounded-[16px] bg-card px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_22px_-10px_rgba(60,44,30,0.45)]"
    >
      <p className="text-[15px] font-extrabold tracking-[-0.01em] break-words">
        {suggestion.name}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
        {suggestion.reason}
      </p>
    </Link>
  );
}
