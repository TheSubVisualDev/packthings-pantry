"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlarmClock, ArrowLeft, Check, PartyPopper, X, Zap } from "lucide-react";
import {
  cookAndList,
  undoCookAndList,
  type CookAndListResult,
  type UndoResult,
} from "@/app/recipes/[id]/actions";
import { NewPackDates } from "@/components/new-pack-dates";
import { useCookTimers } from "@/components/cook-timers";
import { clock, splitStep } from "@/lib/step-timers";
import { formatQuantity } from "@/lib/units";

export interface StoryStep {
  id: number;
  section: string | null;
  body: string;
  minutes: number | null;
  photo_url: string | null;
  /** What this step needs, already scaled and worded. */
  needs: string[];
}

/** How long the undo stays the loud button. It never stops being possible. */
const UNDO_WINDOW_SECONDS = 10;

/**
 * One step at a time, on a dark screen, at the size a propped-up phone can be
 * read from.
 *
 * The method on the recipe page is for reading a recipe; this is for cooking
 * one. The difference is not decoration: standing at the hob you want the one
 * instruction you are on, the things it needs, and the timer it wants, at a
 * size that survives steam and a metre of distance - and you want the other
 * eight steps out of the way, because scrolling to find your place with a
 * wooden spoon in one hand is the thing that goes wrong.
 *
 * Dark because a kitchen at dinner time usually is, and because it makes this
 * unmistakably a different mode from the page it came from.
 */
export function CookStory({
  recipeId,
  name,
  servings,
  steps,
}: {
  recipeId: number;
  name: string;
  servings: number;
  steps: StoryStep[];
}) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<CookAndListResult | null>(null);
  const [undone, setUndone] = useState<UndoResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startCook] = useTransition();
  const [undoPending, startUndo] = useTransition();
  const { timers, now, start, stop } = useCookTimers();

  /** Keeps the screen awake for as long as the cook lasts, not longer. */
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let dropped = false;

    const take = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Refused, usually because the tab is not visible. Nothing to do.
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
      sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const step = steps[at];
  const last = at === steps.length - 1;
  // Nothing until the clock has been read, so no countdown is painted from a
  // placeholder - the same rule the timer tray follows. Rung timers stay in
  // the list: an alarm nobody acknowledged is exactly the one to keep showing.
  const running = now === 0 ? [] : timers;

  function cook() {
    startCook(async () => {
      const cooked = await cookAndList(recipeId, servings);
      setResult(cooked);
      if (cooked.eventId !== undefined) setSecondsLeft(UNDO_WINDOW_SECONDS);
    });
  }

  function undo() {
    if (result?.eventId === undefined) return;
    const eventId = result.eventId;
    const lineIds = result.listed.map((line) => line.id);
    startUndo(async () => {
      const put = await undoCookAndList(eventId, lineIds);
      setUndone(put);
      if (put.ok) router.refresh();
    });
  }

  if (result?.ok && !undone?.ok) {
    return (
      <Done
        recipeId={recipeId}
        name={name}
        result={result}
        secondsLeft={secondsLeft}
        undoPending={undoPending}
        undoFailed={undone && !undone.ok ? (undone.error ?? "Undo failed") : null}
        onUndo={undo}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.22_0.012_55)] text-[oklch(0.96_0.008_60)]">
      <header className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[oklch(0.72_0.02_65)]">
            Step {at + 1} of {steps.length}
          </p>
          <Link
            href={`/recipes/${recipeId}`}
            aria-label="Stop cooking"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </div>

        {/* One segment per step rather than a bar: a recipe is a countable
            number of things to do, and seeing that there are three left is
            more use than seeing that you are 67% through. */}
        <div className="mt-3 flex gap-1">
          {steps.map((each, index) => (
            <span
              key={each.id}
              className={`h-1 flex-1 rounded-full ${
                index < at ? "bg-primary" : index === at ? "bg-white" : "bg-white/20"
              }`}
            />
          ))}
        </div>
      </header>

      <div className="flex-1 px-5 pt-6 pb-6">
        {step.section && (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-[oklch(0.72_0.02_65)]">
            {step.section}
          </p>
        )}

        {step.needs.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {step.needs.map((need) => (
              <span
                key={need}
                className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-bold"
              >
                {need}
              </span>
            ))}
          </div>
        )}

        {step.photo_url && (
          <div className="relative mb-4 aspect-[16/10] w-full overflow-hidden rounded-[20px]">
            <Image
              src={step.photo_url}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 620px"
              className="object-cover"
            />
          </div>
        )}

        <p className="text-[20px] leading-relaxed font-semibold">
          {splitStep(step.body).map((piece, index) =>
            piece.kind === "text" ? (
              <span key={index}>{piece.text}</span>
            ) : (
              <button
                key={index}
                type="button"
                onClick={() => start(shorten(step.body), piece.seconds)}
                className="mx-0.5 inline-flex items-baseline rounded-full bg-primary px-2.5 py-0.5 text-[19px] font-extrabold text-primary-foreground"
              >
                {piece.text}
              </button>
            ),
          )}
        </p>

        {/* Only when the words did not already offer one, the same rule the
            method list follows: a step reading "simmer for 20 minutes" with
            minutes also set would otherwise show the timer twice. */}
        {step.minutes !== null && !splitStep(step.body).some((p) => p.kind === "timing") && (
          <button
            type="button"
            onClick={() => start(shorten(step.body), step.minutes! * 60)}
            className="mt-4 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground"
          >
            <AlarmClock className="h-4 w-4" strokeWidth={3} />
            Start {step.minutes} min
          </button>
        )}

        {/*
          Meanwhile: what is already on, while you do this.

          The design asked for a parallel-task callout, and nothing in the
          schema says which steps run in parallel - so rather than invent a
          field and guess at it, this says the true thing it can see. A timer
          you started two steps ago IS the parallel task, and it is the one
          you will otherwise forget.
        */}
        {running.length > 0 && (
          <div className="mt-6 rounded-[16px] border border-white/15 bg-white/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[oklch(0.78_0.09_60)]">
              <Zap className="h-3.5 w-3.5" strokeWidth={3} />
              Meanwhile
            </p>
            <ul className="mt-2 space-y-2">
              {running.map((timer) => (
                <li key={timer.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {timer.label}
                  </span>
                  <span
                    className={`font-mono text-sm font-bold tabular-nums ${
                      timer.endsAt <= now ? "text-[oklch(0.86_0.12_60)]" : ""
                    }`}
                  >
                    {timer.endsAt <= now
                      ? "ready"
                      : clock((timer.endsAt - now) / 1000)}
                  </span>
                  <button
                    type="button"
                    onClick={() => stop(timer.id)}
                    aria-label={`Stop ${timer.label}`}
                    className="text-xs font-bold text-[oklch(0.72_0.02_65)] underline underline-offset-2"
                  >
                    Stop
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 flex items-center gap-3 border-t border-white/10 bg-[oklch(0.22_0.012_55)] px-5 py-4">
        <button
          type="button"
          onClick={() => setAt((n) => Math.max(0, n - 1))}
          disabled={at === 0}
          aria-label="Previous step"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>

        {last ? (
          <button
            type="button"
            onClick={cook}
            disabled={pending}
            className="h-12 flex-1 rounded-[14px] bg-primary text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {pending
              ? "Taking it off the shelves…"
              : `Done — cooked for ${servings}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAt((n) => Math.min(steps.length - 1, n + 1))}
            className="h-12 flex-1 rounded-[14px] bg-white text-[15px] font-extrabold text-[oklch(0.22_0.012_55)]"
          >
            Next
          </button>
        )}
      </footer>

      {result && !result.ok && (
        <p role="alert" className="px-5 pb-5 text-sm font-bold text-[oklch(0.8_0.12_40)]">
          {result.error ?? "Cook failed"}
        </p>
      )}
    </div>
  );
}

/**
 * What a running timer calls itself: the opening words of its step.
 *
 * By the time it rings, the step that started it is two screens back, and
 * "20:00" on its own says nothing about which pan.
 */
function shorten(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 44 ? `${trimmed.slice(0, 44)}…` : trimmed;
}

/** The end of the cook: what left the kitchen, and the way back out. */
function Done({
  recipeId,
  name,
  result,
  secondsLeft,
  undoPending,
  undoFailed,
  onUndo,
}: {
  recipeId: number;
  name: string;
  result: CookAndListResult;
  secondsLeft: number;
  undoPending: boolean;
  undoFailed: string | null;
  onUndo: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-center bg-primary px-5 py-10 text-primary-foreground">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em]">
        <PartyPopper className="h-4 w-4" strokeWidth={3} />
        Cooked
      </div>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.02em] break-words">
        {name}
      </h1>

      {result.applied.length > 0 && (
        <>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.08em] opacity-80">
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

      {result.listed.length > 0 && (
        <p className="mt-3 text-sm font-semibold opacity-90">
          {result.listed.map((line) => line.name).join(", ")} ran out &mdash; added
          to your list.
        </p>
      )}

      {result.flagged.length > 0 && (
        <p className="mt-3 text-sm font-semibold opacity-90">
          {result.flagged.map((line) => line.item_name).join(", ")} could not be
          worked out from the recipe.
        </p>
      )}

      {result.opened.length > 0 && (
        <div className="text-foreground">
          <NewPackDates opened={result.opened} />
        </div>
      )}

      <div className="mt-8 flex items-center gap-3">
        <Link
          href={`/recipes/${recipeId}`}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-card text-[15px] font-extrabold text-foreground"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
          Done
        </Link>
        {result.eventId !== undefined && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoPending}
            className="h-12 rounded-[14px] border border-primary-foreground/40 px-4 text-[15px] font-extrabold disabled:opacity-60"
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
    </div>
  );
}
