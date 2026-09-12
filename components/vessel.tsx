"use client";

import { useRef } from "react";
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
  capacity,
  unit,
  label,
}: {
  kind: VesselKind;
  /** How full, 0 to 1. */
  level: number;
  onLevel: (level: number) => void;
  /** What a full one holds, in `unit`. */
  capacity: number;
  unit: string;
  /** What the control is asking about, for a screen reader. */
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const clipId = `vessel-${kind}`;

  /**
   * Where a pointer is, as a fraction of the vessel, upside down.
   *
   * The top of the box is 0 on a screen and full in a bottle, which is the
   * whole conversion: a drag is only ever measured against the box, never
   * accumulated, so letting go and grabbing again does not drift.
   */
  function levelAt(clientY: number): number {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return level;
    const fraction = 1 - (clientY - rect.top) / rect.height;
    const clamped = Math.max(0, Math.min(1, fraction));

    // Snapped in the unit rather than in percent, so what comes out is a
    // number somebody would say out loud. See stepFor.
    if (capacity <= 0) return clamped;
    const step = stepFor(capacity, unit);
    const snapped = Math.round((clamped * capacity) / step) * step;
    return Math.max(0, Math.min(1, snapped / capacity));
  }

  const amount = Math.round(level * capacity * 100) / 100;
  const step = stepFor(capacity, unit);

  return (
    <div className="flex items-center gap-4">
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
          onLevel(levelAt(event.clientY));
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return;
          onLevel(levelAt(event.clientY));
        }}
        onKeyDown={(event) => {
          // One step per press, the same step a drag snaps to, so the keyboard
          // and the finger cannot disagree about what a nudge is worth.
          const by = capacity > 0 ? step / capacity : SNAP;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            onLevel(Math.min(1, level + by));
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            onLevel(Math.max(0, level - by));
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
          <rect
            x="0"
            width="100"
            y={140 - level * 140}
            height={level * 140}
            clipPath={`url(#${clipId})`}
            className="fill-primary"
            style={{ transition: "y .35s cubic-bezier(.34,1.3,.5,1), height .35s cubic-bezier(.34,1.3,.5,1)" }}
          />

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

        {/* Sideways rather than wrapped: five chips and a number do not fit
            across a narrow phone, and a row that reflows moves the one you
            were aiming at. */}
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LEVELS.map((step) => {
            const on = Math.abs(level - step.at) < SNAP / 2;
            return (
              <button
                key={step.label}
                type="button"
                aria-pressed={on}
                onClick={() => onLevel(step.at)}
                className={`min-h-9 shrink-0 rounded-full px-3 text-sm font-bold whitespace-nowrap ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-chip text-muted-foreground hover:text-foreground"
                }`}
              >
                {step.label}
              </button>
            );
          })}
        </div>
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
