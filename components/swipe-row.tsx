"use client";

import { useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { track } from "./usage-tracker";

/**
 * Swipe a stock row left to say it is gone.
 *
 * Marking two things as used up costs four taps today: Select, then a circle,
 * then another circle, then the action. That is a state machine for what is
 * almost always a single row, and Select mode earns its place for genuinely
 * bulk work - retagging nine things - rather than for this.
 *
 * Both ways, and they are opposites: left says it is gone, right says you
 * bought more. Right is deliberately NOT a stepper - tapping the row already
 * opens one of those, and a gesture that duplicates a tap is a gesture nobody
 * learns. It adds one step of whatever the row is measured in, which is the
 * single commonest correction and the only one worth doing without looking.
 *
 * The tap still works. This wraps the row rather than replacing it, and Motion
 * only swallows the click when a drag actually happened, so everything that
 * worked before still does - including Select mode, which is how this action
 * stays reachable for anybody who cannot swipe at all.
 */
export function SwipeRow({
  enabled,
  label,
  addLabel,
  onUsedUp,
  onAddOne,
  children,
}: {
  /** Off in select mode and for read-only kitchens. */
  enabled: boolean;
  /** What is being changed, for the announcement. */
  label: string;
  /** "+100g", "+1" - what a swipe right will actually do, said on the panel. */
  addLabel: string;
  /** Absent when there is nothing to use up, which leaves only the right half. */
  onUsedUp: (() => void) | null;
  onAddOne: () => void;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const [committing, setCommitting] = useState<"left" | "right" | null>(null);

  /**
   * How far is far enough.
   *
   * Tuned up after the first version was reported as too sensitive in the
   * hand. Everything here was originally guessed with a mouse, and a mouse
   * drags in a straight line at a steady speed; a thumb scrolling a long list
   * one-handed does neither, and it throws off quite a lot of sideways
   * velocity on the way past.
   *
   * The flick was the loose one. Committing on 32px at 520px/s meant a fast
   * scroll with any diagonal in it could empty a shelf - so the distance now
   * wants four fifths of the panel, and the flick wants to be both fast AND
   * already most of the way there, which a scroll is not.
   *
   * These are the numbers to change if it is still wrong. Raising COMMIT
   * makes it harder to trigger by accident and harder to trigger on purpose,
   * in that order.
   */
  const REVEAL = 120;
  const COMMIT = 96;
  /** A flick still counts, but it has to be a flick and not a fast scroll. */
  const FLICK_SPEED = 1000;
  const FLICK_DISTANCE = 64;

  // The panels behind only show once the row has actually started moving, so a
  // stationary list carries no coloured edges waiting to be noticed.
  const leftPanel = useTransform(x, [-REVEAL, -12, 0], [1, 0.55, 0]);
  const rightPanel = useTransform(x, [0, 12, REVEAL], [0, 0.55, 1]);

  if (!enabled || reduceMotion) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {/* Right of the row, revealed by dragging left. */}
      {onUsedUp && (
        <motion.div
          aria-hidden
          style={{ opacity: leftPanel }}
          className="absolute inset-y-0 right-0 flex w-[120px] items-center justify-center gap-1.5 bg-destructive text-xs font-extrabold text-white"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.75} />
          Used up
        </motion.div>
      )}

      {/* Left of the row, revealed by dragging right. */}
      <motion.div
        aria-hidden
        style={{ opacity: rightPanel }}
        className="absolute inset-y-0 left-0 flex w-[120px] items-center justify-center gap-1.5 bg-primary text-xs font-extrabold text-primary-foreground"
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
        {addLabel}
      </motion.div>

      <motion.div
        drag="x"
        style={{ x }}
        /**
         * Locked to one axis, so a swipe that starts as a scroll stays a
         * scroll. Without this the list fights the gesture and neither wins.
         */
        dragDirectionLock
        // No coasting: the row should stop where the thumb stopped, so what
        // you saw when you let go is what gets judged.
        dragMomentum={false}
        dragConstraints={{ left: onUsedUp ? -REVEAL : 0, right: REVEAL }}
        dragElastic={{ left: onUsedUp ? 0.05 : 0, right: 0.05 }}
        onDragEnd={(_, info) => {
          /**
           * A gesture that went sideways more than it went up.
           *
           * The axis lock decides which way to MOVE the row, and it decides
           * early - so a scroll with a bit of lean can lock to x and then be
           * judged as a swipe. This checks the whole gesture after the fact:
           * if it travelled further vertically than horizontally, it was
           * somebody scrolling past and nothing should happen.
           */
          if (Math.abs(info.offset.y) > Math.abs(info.offset.x)) return;

          // Distance OR a decisive flick - a short fast swipe is as deliberate
          // as a long slow one, and only accepting length punishes the people
          // who are quickest with it. The flick has to be both fast and most
          // of the way there, or a fast scroll qualifies.
          const left =
            info.offset.x < -COMMIT ||
            (info.velocity.x < -FLICK_SPEED && info.offset.x < -FLICK_DISTANCE);
          const right =
            info.offset.x > COMMIT ||
            (info.velocity.x > FLICK_SPEED && info.offset.x > FLICK_DISTANCE);

          // Counted on the commit, not the drag: the adjust it causes is
          // already recorded, and this answers the separate question of
          // whether anybody reaches the number by swiping rather than by
          // opening the row and tapping.
          if (left && onUsedUp) {
            track("stock.swipe");
            setCommitting("left");
            onUsedUp();
            return;
          }
          if (right) {
            /**
             * Adding snaps back rather than sliding away.
             *
             * Using something up takes the row off the shelf, so letting it
             * leave reads correctly. Adding one leaves the row exactly where
             * it was with a bigger number on it, and animating it out would
             * promise a disappearance that never comes.
             */
            track("stock.swipe");
            setCommitting(null);
            onAddOne();
          }
        }}
        animate={committing === "left" ? { x: -REVEAL, opacity: 0.4 } : { x: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
        className="relative touch-pan-y bg-card"
      >
        {children}
      </motion.div>

      {/* Announced rather than only drawn, because the row itself is what
          changes and a screen reader would otherwise get no news of it. */}
      <span role="status" aria-live="polite" className="sr-only">
        {committing === "left" ? `${label} marked used up` : ""}
      </span>
    </div>
  );
}
