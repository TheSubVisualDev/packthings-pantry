"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { Bug, Check, Lightbulb, Undo2, X } from "lucide-react";
import { decide, putBack } from "@/app/report/actions";
import type { ReportWithAuthor } from "@/lib/reports";

/**
 * Going through what has come in, one card at a time.
 *
 * A list of twenty reports with a pair of buttons on each row is a screen you
 * close without deciding anything, because nothing on it is asking you a
 * question. One card, two answers, and the next one arrives - which is the
 * whole trick, and is why this shape gets used for choosing things.
 *
 * Nothing is deleted either way. A turned-down idea that keeps being asked for
 * is itself worth knowing, and a deleted row cannot tell you that.
 */
export function ReportTriage({ queue }: { queue: ReportWithAuthor[] }) {
  /**
   * The pile, as it was when you sat down.
   *
   * Frozen on purpose. `queue` is a server prop of everything still undecided,
   * so deciding one revalidated the page, dropped it out of the list, and left
   * the index pointing one past where it had been - which skipped the next
   * card every single time. Reported as "confirming one gets rid of the next",
   * which is exactly what it did.
   *
   * The same bug, in the same shape, as the onboarding steps: an index into a
   * list that changes length underneath it. Walking a frozen copy is the only
   * version of this that cannot drift.
   */
  const [cards] = useState(() => queue);
  const [at, setAt] = useState(0);
  const [decided, setDecided] = useState<Record<number, "approved" | "rejected">>({});
  const [pending, startDeciding] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * How far the card has been dragged, in pixels from where it started.
   *
   * Held here rather than left to CSS because the same number does three
   * things: it moves the card, tilts it, and fades in whichever answer the
   * drag is heading towards.
   */
  const [dragged, setDragged] = useState(0);
  const [from, setFrom] = useState<number | null>(null);

  const card = cards[at];
  const left = cards.length - at;

  function answer(id: number, status: "approved" | "rejected") {
    setError(null);
    setDecided((current) => ({ ...current, [id]: status }));
    setDragged(0);
    setFrom(null);
    setAt((n) => n + 1);

    startDeciding(async () => {
      const done = await decide(id, status);
      if (!done.ok) {
        // Put the card back rather than leaving a lie on the screen.
        setError(done.error ?? "That did not save.");
        setDecided((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        setAt((n) => Math.max(0, n - 1));
      }
    });
  }

  function undo() {
    const previous = cards[at - 1];
    if (!previous) return;
    setError(null);
    setAt((n) => Math.max(0, n - 1));
    setDecided((current) => {
      const next = { ...current };
      delete next[previous.id];
      return next;
    });
    startDeciding(async () => {
      await putBack(previous.id);
    });
  }

  /**
   * Arrow keys, because this is a thing you do sitting down with a lot of them
   * to get through. Left turns down, right approves - the same directions the
   * drag uses, so there is one story about which way means yes.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!card) return;
      if (event.key === "ArrowRight") answer(card.id, "approved");
      if (event.key === "ArrowLeft") answer(card.id, "rejected");
      if (event.key === "z" && (event.metaKey || event.ctrlKey)) undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, at]);

  if (!card) {
    return (
      <div className="rounded-[20px] bg-card p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-6 w-6" strokeWidth={3} />
        </div>
        <h2 className="mt-3 text-[17px] font-extrabold">
          {cards.length === 0 ? "Nothing waiting." : "That is the lot."}
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {cards.length === 0
            ? "Reports land here as people send them."
            : `${cards.length} decided. Ask Claude to collate the approved ones.`}
        </p>
        {at > 0 && (
          <button
            type="button"
            onClick={undo}
            disabled={pending}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[12px] bg-chip px-4 py-2.5 text-sm font-extrabold disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" strokeWidth={2.8} />
            Put the last one back
          </button>
        )}
      </div>
    );
  }

  // Past this many pixels the drag counts as an answer. Below it the card
  // springs back, so a scroll that started sideways does not decide anything.
  const THRESHOLD = 90;
  const leaning = Math.abs(dragged) > 20 ? (dragged > 0 ? "yes" : "no") : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-[0.08em] text-label uppercase">
          {left} to go
        </p>
        {at > 0 && (
          <button
            type="button"
            onClick={undo}
            disabled={pending}
            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={2.8} />
            Undo
          </button>
        )}
      </div>

      <div
        // touchAction so a vertical scroll still scrolls: only horizontal
        // movement is taken, which is the difference between a card you can
        // swipe and a page you cannot read.
        style={{
          touchAction: "pan-y",
          transform: `translateX(${dragged}px) rotate(${dragged / 28}deg)`,
          transition: from === null ? "transform 180ms ease-out" : "none",
        }}
        onPointerDown={(event) => {
          setFrom(event.clientX);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (from === null) return;
          setDragged(event.clientX - from);
        }}
        onPointerUp={() => {
          if (dragged > THRESHOLD) answer(card.id, "approved");
          else if (dragged < -THRESHOLD) answer(card.id, "rejected");
          else {
            setDragged(0);
            setFrom(null);
          }
        }}
        onPointerCancel={() => {
          setDragged(0);
          setFrom(null);
        }}
        className="relative touch-pan-y overflow-hidden rounded-[20px] bg-card shadow-[0_2px_10px_rgba(0,0,0,0.08)] select-none"
      >
        {/* Which way this is heading, shown while it is still reversible. */}
        {leaning && (
          <div
            className={`absolute top-4 z-10 rounded-[10px] border-2 px-3 py-1 text-sm font-extrabold ${
              leaning === "yes"
                ? "right-4 rotate-12 border-primary text-primary"
                : "left-4 -rotate-12 border-destructive text-destructive"
            }`}
            style={{ opacity: Math.min(1, Math.abs(dragged) / THRESHOLD) }}
          >
            {leaning === "yes" ? "ON THE LIST" : "NOT FOR NOW"}
          </div>
        )}

        <div className="p-5">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                card.kind === "bug"
                  ? "bg-[oklch(0.94_0.05_35)] text-destructive"
                  : "bg-[oklch(0.94_0.06_75)] text-[oklch(0.42_0.1_60)]"
              }`}
            >
              {card.kind === "bug" ? (
                <Bug className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Lightbulb className="h-3 w-3" strokeWidth={3} />
              )}
              {card.kind === "bug" ? "Bug" : "Request"}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {card.author_handle ? `@${card.author_handle}` : "someone"} ·{" "}
              {new Date(card.created_at + "Z").toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>

          <h2 className="mt-2.5 text-[19px] leading-snug font-extrabold break-words">
            {card.title}
          </h2>

          {card.body && (
            <p className="mt-2 text-sm leading-relaxed font-medium whitespace-pre-wrap">
              {card.body}
            </p>
          )}

          {card.photos.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {card.photos.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  // draggable off, or dragging the picture fights the card.
                  draggable={false}
                  className="relative h-44 w-32 shrink-0 overflow-hidden rounded-[12px] bg-chip"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="128px"
                    draggable={false}
                    className="object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {card.page && (
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              on{" "}
              <code className="font-[family-name:var(--font-plex-mono)]">
                {card.page}
              </code>
            </p>
          )}
          {card.agent && (
            <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
              {card.agent}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {/* The buttons stay. A swipe is a thing you learn, and the person who has
          not learnt it yet still has to be able to decide. */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => answer(card.id, "rejected")}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[16px] bg-card text-sm font-extrabold text-destructive shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        >
          <X className="h-5 w-5" strokeWidth={3} />
          Not for now
        </button>
        <button
          type="button"
          onClick={() => answer(card.id, "approved")}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[16px] bg-primary text-sm font-extrabold text-primary-foreground"
        >
          <Check className="h-5 w-5" strokeWidth={3} />
          On the list
        </button>
      </div>

      <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
        Swipe the card, or use the arrow keys. Nothing is deleted either way.
      </p>

      {Object.keys(decided).length > 0 && (
        <p className="mt-1 text-center text-xs font-semibold text-muted-foreground">
          {Object.values(decided).filter((v) => v === "approved").length} on the
          list, {Object.values(decided).filter((v) => v === "rejected").length}{" "}
          not for now.
        </p>
      )}
    </div>
  );
}
