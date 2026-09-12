"use client";

import { useRef, useState } from "react";
import { formatQuantity } from "@/lib/units";
import type { Dimension } from "@/lib/types";

/**
 * How much is in it, asked the way anybody would answer.
 *
 * Nobody knows they have 320ml of soy sauce. They know the bottle is about two
 * thirds full, and they know it by looking at it. Typing 320 requires reading a
 * label, doing arithmetic, and being wrong - so the number became the thing the
 * app asks for least well and the thing it needs most.
 *
 * So the number becomes the OUTPUT. You say how full the container is and the
 * app works out the amount, which is exactly the calculation a computer should
 * be doing instead of a person holding a bottle.
 *
 * The control is chosen from the item's own data rather than from what the food
 * is - there is no list of bottles anywhere in here:
 *
 *   mass or volume, with a pack size  ->  fill    (a container to be a fraction of)
 *   count                             ->  count   (a stepper; half an egg is not a thing)
 *   anything else                     ->  nothing (see the note on `rough` below)
 *
 * "Rough" is not a third mode, it is what this already does: dragging the
 * liquid to where it looks on the real bottle is an estimate by eye, so the
 * number it produces is snapped to something a person would actually say -
 * 25ml, 25g - and the readout admits as much. A row that has said its amount
 * is unspecified still gets no control, because there is no container there to
 * be a fraction of and inventing one would be inventing a measurement.
 */

export type VesselKind = "bottle" | "jar" | "tin" | "bag";

export type VesselMode = "fill" | "count" | "none";

/** What kind of control the item's own data calls for. */
export function vesselModeFor(item: {
  dimension: Dimension;
  packSize: number | null;
  unspecified?: boolean;
}): VesselMode {
  if (item.unspecified) return "none";
  if (item.dimension === "count") return "count";
  if (item.packSize !== null && item.packSize > 0) return "fill";
  return "none";
}

/**
 * Which glyph to draw, from the words already on the item.
 *
 * A lookup over the pack unit, the tags and the name - never a table of foods.
 * A new food should never need a line of code here, and if nothing matches, a
 * jar is the shape that reads as "container" without claiming anything.
 */
export function vesselKindFor(item: {
  packUnit?: string | null;
  tags?: string[];
  name?: string;
  dimension: Dimension;
}): VesselKind {
  const words = [item.packUnit ?? "", item.name ?? "", ...(item.tags ?? [])]
    .join(" ")
    .toLowerCase();

  if (/\b(bottle|oil|sauce|milk|vinegar|juice|squash|wine)\b/.test(words)) {
    return "bottle";
  }
  if (/\b(tin|can|tinned|canned)\b/.test(words)) return "tin";
  if (/\b(bag|sack|packet|pack|flour|rice|pasta|sugar|lentils|oats)\b/.test(words)) {
    return "bag";
  }
  // Volume with nothing else said is more often poured than scooped.
  if (item.dimension === "volume") return "bottle";
  return "jar";
}

/** The levels a tap can set, which is how most people would answer anyway. */
const LEVELS: { label: string; at: number }[] = [
  { label: "Empty", at: 0 },
  { label: "¼", at: 0.25 },
  { label: "½", at: 0.5 },
  { label: "¾", at: 0.75 },
  { label: "Full", at: 1 },
];

/**
 * What a drag snaps to, in the item's own unit.
 *
 * Not a percentage. Dragging the liquid to where it looks on the actual bottle
 * is an estimate by eye, and an estimate should land on a number a person
 * would say: 325ml, not 318.7ml. 25 of whatever the unit is - 25ml, 25g - down
 * to a twentieth of the container for small ones, because 25g steps in a 60g
 * jar of chilli flakes is three positions.
 *
 * The chip levels (¼, ½, ¾) are exact, because those are claims about the
 * container rather than guesses about the contents.
 */
function stepFor(capacity: number, unit: string): number {
  if (unit === "count") return 1;
  const coarse = 25;
  return capacity >= coarse * 8 ? coarse : Math.max(1, Math.round(capacity / 20));
}

/** A fingertip is worth about this much of the vessel, before snapping. */
const SNAP = 0.05;

/**
 * The outline of each vessel, as a path in a 100x140 box.
 *
 * Drawn rather than photographed so it tints with the palette, and kept
 * deliberately crude: this is a diagram of "how full", not a picture of your
 * actual bottle.
 */
const SHAPES: Record<VesselKind, string> = {
  bottle:
    "M40 4 h20 v22 c0 6 14 16 14 30 v70 a10 10 0 0 1 -10 10 h-28 a10 10 0 0 1 -10 -10 v-70 c0 -14 14 -24 14 -30 z",
  jar: "M22 10 h56 a8 8 0 0 1 8 8 v108 a10 10 0 0 1 -10 10 h-52 a10 10 0 0 1 -10 -10 v-108 a8 8 0 0 1 8 -8 z",
  tin: "M24 24 h52 a6 6 0 0 1 6 6 v96 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 v-96 a6 6 0 0 1 6 -6 z",
  bag: "M28 18 h44 l10 18 v90 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 v-90 z",
};

export function Vessel({
  kind,
  level,
  onLevel,
  onCommit,
  capacity,
  unit,
  label,
}: {
  kind: VesselKind;
  /** How full, 0 to 1. */
  level: number;
  /**
   * Every change, including each frame of a drag. Cheap things only: this
   * fires many times a second.
   */
  onLevel: (level: number) => void;
  /**
   * The level somebody settled on - the finger lifting, a chip, a key press.
   *
   * Anything expensive belongs here rather than in onLevel. The item page
   * writes to a database in Nuremberg, and doing that per frame produced a
   * queue of round trips whose answers arrived out of order and fought each
   * other: the liquid jerked between empty and full and would not stay where
   * it was put. It is one write per drag now.
   */
  onCommit?: (level: number) => void;
  /** What a full one holds, in `unit`. */
  capacity: number;
  unit: string;
  /** What the control is asking about, for a screen reader. */
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const clipId = `vessel-${kind}`;

  /**
   * Where the liquid is drawn while a finger is on it.
   *
   * The snapping is right for the NUMBER and wrong for the picture: rounding
   * to 25ml mid-drag makes the surface hop from step to step, which is the
   * one thing a liquid does not do. So the drawing follows the finger exactly
   * and the number it reports is snapped - you get a smooth pour and a round
   * figure, and on release the surface settles onto the number that was
   * actually saved.
   */
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? level;

  /**
   * Where a pointer is, as a fraction of the vessel, upside down.
   *
   * The top of the box is 0 on a screen and full in a bottle, which is the
   * whole conversion: a drag is only ever measured against the box, never
   * accumulated, so letting go and grabbing again does not drift.
   */
  function rawAt(clientY: number): number {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return level;
    return Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
  }

  /** The same fraction, rounded to something a person would say. See stepFor. */
  function snap(fraction: number): number {
    if (capacity <= 0) return fraction;
    const to = stepFor(capacity, unit);
    return Math.max(0, Math.min(1, (Math.round((fraction * capacity) / to) * to) / capacity));
  }

  function track(clientY: number) {
    const raw = rawAt(clientY);
    setLive(raw);
    onLevel(snap(raw));
  }

  /** The finger has lifted: hand back the drawing, and save once. */
  function settle() {
    const last = live;
    setLive(null);
    onCommit?.(last === null ? level : snap(last));
  }

  /** A tap or a key: a level chosen outright, so it is both at once. */
  function choose(next: number) {
    onLevel(next);
    onCommit?.(next);
  }

  const amount = Math.round(level * capacity * 100) / 100;
  const step = stepFor(capacity, unit);

  const figure = (
    <>
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={amount}
        aria-valuetext={`${formatQuantity(amount)}${unit === "count" ? "" : unit} of ${formatQuantity(capacity)}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          track(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return;
          track(event.clientY);
        }}
        // Letting go hands the drawing back to the saved level, which is the
        // snapped one - so the surface glides the last few millilitres onto
        // the number the app has actually written down.
        onPointerUp={settle}
        onPointerCancel={settle}
        onKeyDown={(event) => {
          // One step per press, the same step a drag snaps to, so the keyboard
          // and the finger cannot disagree about what a nudge is worth.
          const by = capacity > 0 ? step / capacity : SNAP;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            choose(Math.min(1, level + by));
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            choose(Math.max(0, level - by));
          }
        }}
        className="h-[140px] w-[100px] shrink-0 touch-none select-none focus:outline-none"
      >
        <svg viewBox="0 0 100 140" className="h-full w-full overflow-visible">
          <defs>
            <clipPath id={clipId}>
              <path d={SHAPES[kind]} />
            </clipPath>
          </defs>

          <path d={SHAPES[kind]} className="fill-card" />

          {/* The contents. A rect clipped to the shape rather than a second
              path per level, so any fraction works and the animation is one
              number moving. */}
          {/*
            The contents, with a surface.

            A rect clipped to the shape would do the job and look like a
            progress bar stood on its end. This is a wide wavy path that slides
            sideways forever inside the clip, so the top of the liquid moves
            the way a liquid's does. Two crests, 60 units apart, over a shape
            100 wide: the loop translates by exactly one wavelength, so there
            is no seam to see.
          */}
          <g clipPath={`url(#${clipId})`}>
            <g
              style={{
                transform: `translateY(${(1 - shown) * 140}px)`,
                transition: live === null ? "transform .35s cubic-bezier(.34,1.3,.5,1)" : undefined,
              }}
            >
              <path
                className="vessel-wave fill-primary"
                d="M0 8 C 7.5 2, 22.5 2, 30 8 S 52.5 14, 60 8 S 82.5 2, 90 8 S 112.5 14, 120 8 S 142.5 2, 150 8 L 150 160 L 0 160 Z"
              />
            </g>
          </g>

          <path
            d={SHAPES[kind]}
            className="fill-none stroke-border"
            strokeWidth="3"
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[22px] font-semibold tabular-nums">
          {formatQuantity(amount)}
          <span className="text-[15px] text-muted-foreground">
            {unit === "count" ? "" : unit} of {formatQuantity(capacity)}
            {unit === "count" ? "" : unit}
          </span>
        </p>
        {/* Said out loud, because the number is a guess made by eye and
            pretending otherwise is how a measurement gets trusted that
            should not be. It is still the number that gets saved. */}
        {unit !== "count" && (
          <p className="text-xs font-semibold text-muted-foreground">
            about right, to the nearest {formatQuantity(step)}
            {unit}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div>
      <div className="flex items-center gap-4">{figure}</div>

      {/*
        The levels get the whole width, under the bottle.

        They were beside it, in a column about 180px wide, so a five-chip row
        scrolled sideways and "Full" was off the edge - which on a phone reads
        as a control with no options at all. There is a whole screen width
        here and the chips are the fast way to answer.
      */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {LEVELS.map((mark) => {
          const on = Math.abs(level - mark.at) < 0.02;
          return (
            <button
              key={mark.label}
              type="button"
              aria-pressed={on}
              onClick={() => choose(mark.at)}
              className={`min-h-11 min-w-14 flex-1 rounded-full px-3 text-sm font-bold whitespace-nowrap ${
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-chip text-muted-foreground"
              }`}
            >
              {mark.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How many there are, when they are things rather than an amount.
 *
 * A stepper rather than a fill, because half an egg is not a thing anybody has
 * and a slider that can express one is a slider that will.
 */
export function CountStepper({
  value,
  onValue,
  label,
}: {
  value: number;
  onValue: (value: number) => void;
  label: string;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-[14px] bg-card px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        aria-label="One fewer"
        onClick={() => onValue(Math.max(0, value - 1))}
        disabled={value <= 0}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-chip text-2xl leading-none font-extrabold disabled:opacity-30"
      >
        &minus;
      </button>
      <span className="font-mono text-[22px] font-semibold tabular-nums">
        {formatQuantity(value)}
      </span>
      <button
        type="button"
        aria-label="One more"
        onClick={() => onValue(value + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-2xl leading-none font-extrabold text-primary-foreground"
      >
        +
      </button>
    </div>
  );
}
