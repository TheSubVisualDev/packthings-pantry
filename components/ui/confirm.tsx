"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

/**
 * The tick that says it worked.
 *
 * Every confirmation in this app was a sentence appearing - "4 things added",
 * "Saved" - which is information arriving with no acknowledgement that
 * anything happened. A tick that draws itself is the acknowledgement, and it
 * is the one place a bit of whimsy costs nothing: nobody is reading this, they
 * are checking it.
 *
 * The circle pops past its size and settles, and the stroke draws in after it
 * rather than with it - the order is the whole effect. Both at once is a badge
 * appearing; one then the other is a thing being ticked off.
 */
export function Confirm({
  show,
  label,
  children,
}: {
  show: boolean;
  /** Read out when it appears, since the tick itself says nothing aloud. */
  label: string;
  /** What to say beside it, if anything. */
  children?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2.5"
        >
          <motion.span
            aria-hidden
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 15, delay: 0.04 }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            {/*
              The stroke draws rather than appearing. pathLength is Motion
              doing the dasharray arithmetic, which is the only reason this is
              two lines instead of twenty.
            */}
            <motion.svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <motion.path
                d="M4 12.5 L9.5 18 L20 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.28, ease: "easeOut", delay: 0.14 }}
              />
            </motion.svg>
          </motion.span>

          <p role="status" className="text-sm font-bold">
            <span className="sr-only">{label}. </span>
            {children}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A one-shot tick, for a button that has just done something.
 *
 * Same drawing, no layout of its own, so it can sit inside a row that already
 * has its own words.
 */
export function TickBurst({ size = 18 }: { size?: number }) {
  return (
    <motion.span
      aria-hidden
      initial={{ scale: 0, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 600, damping: 14 }}
      className="inline-flex shrink-0"
    >
      <Check style={{ width: size, height: size }} strokeWidth={3.5} />
    </motion.span>
  );
}
