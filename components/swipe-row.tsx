"use client";

import { useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Trash2 } from "lucide-react";

/**
 * Swipe a stock row left to say it is gone.
 *
 * Marking two things as used up costs four taps today: Select, then a circle,
 * then another circle, then the action. That is a state machine for what is
 * almost always a single row, and Select mode earns its place for genuinely
 * bulk work - retagging nine things - rather than for this.
 *
 * Only left, and only this one action. Tapping a row already opens the
 * quantity stepper inline, so the swipe-right some designs use for that would
 * be a second way to do a thing that is already one tap. A gesture that
 * duplicates a tap is a gesture nobody learns.
 *
 * The tap still works. This wraps the row rather than replacing it, and Motion
 * only swallows the click when a drag actually happened, so everything that
 * worked before still does - including Select mode, which is how this action
 * stays reachable for anybody who cannot swipe at all.
 */
export function SwipeRow({
  enabled,
  label,
  onUsedUp,
  children,
}: {
  /** Off in select mode, for read-only kitchens, and for an empty row. */
  enabled: boolean;
  /** What is being used up, for the announcement. */
  label: string;
  onUsedUp: () => void;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const [committing, setCommitting] = useState(false);

  /**
   * How far is far enough.
   *
   * Deliberately past the point of an accidental brush. A list this long gets
   * scrolled one-handed with a thumb that does not travel in a straight line,
   * and the cost of a false positive here is somebody's shelf emptied without
   * them asking - so it wants most of the panel's width, not a flick.
   */
  const REVEAL = 104;
  const COMMIT = 72;

  // The panel behind only shows once the row has actually started moving, so a
  // stationary list carries no red edge waiting to be noticed.
  const panelOpacity = useTransform(x, [-REVEAL, -12, 0], [1, 0.55, 0]);

  if (!enabled || reduceMotion) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      <motion.div
        aria-hidden
        style={{ opacity: panelOpacity }}
        className="absolute inset-y-0 right-0 flex w-[104px] items-center justify-center gap-1.5 bg-destructive text-xs font-extrabold text-white"
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.75} />
        Used up
      </motion.div>

      <motion.div
        drag="x"
        style={{ x }}
        /**
         * Locked to one axis, so a swipe that starts as a scroll stays a
         * scroll. Without this the list fights the gesture and neither wins.
         */
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.05, right: 0 }}
        onDragEnd={(_, info) => {
          // Distance OR a decisive flick - a short fast swipe is as deliberate
          // as a long slow one, and only accepting length punishes the people
          // who are quickest with it.
          const far = info.offset.x < -COMMIT;
          const flicked = info.velocity.x < -520 && info.offset.x < -32;
          if (!far && !flicked) return;

          setCommitting(true);
          onUsedUp();
        }}
        animate={committing ? { x: -REVEAL, opacity: 0.4 } : { x: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
        className="relative touch-pan-y bg-card"
      >
        {children}
      </motion.div>

      {/* Announced rather than only drawn, because the row itself is what
          changes and a screen reader would otherwise get no news of it. */}
      <span role="status" aria-live="polite" className="sr-only">
        {committing ? `${label} marked used up` : ""}
      </span>
    </div>
  );
}
