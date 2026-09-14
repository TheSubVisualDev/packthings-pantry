"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState } from "react";

/**
 * One segmented control, for the four places that had invented their own.
 *
 * The header's nav, the stock page's group-by, the shop filter and the recipe
 * filters were four answers to the same question, in three different shapes
 * and two different colour treatments. Learning the same control four times is
 * the cheapest kind of friction to delete.
 *
 * **Mobile first.** The base size is a thumb target - 44px tall, which is the
 * floor below which people miss - and the desktop rule makes it *smaller*,
 * because a mouse is precise and a dense toolbar reads better on a wide
 * screen. That is the direction this whole app is built in: the phone is the
 * design, the desktop is the accommodation.
 *
 * It scrolls sideways rather than wrapping or squashing. Four segments plus a
 * logo plus an account button does not fit across a 360px phone, and the two
 * usual answers are both worse - wrapping moves the page around as you change
 * tab, and shrinking the text makes every segment harder to hit at once.
 *
 * Links rather than buttons, because every one of these selects a view of the
 * page and a view of a page is a URL: shareable, back-buttonable, and working
 * before any JavaScript arrives.
 */

export interface SegmentedOption {
  key: string;
  label: string;
  href: string;
  /** Shown after the label, quietly - a count, usually. */
  meta?: string;
}

export function Segmented({
  options,
  active,
  label,
}: {
  options: readonly SegmentedOption[];
  active: string;
  /** What the group is for, since a row of nouns does not say so on its own. */
  label: string;
}) {
  /**
   * Which set of segments this is.
   *
   * layoutId is global, so two segmented controls on one page - the stock
   * page has the group-by and the header has the sections - would share one
   * pill and fling it across the screen between them. The label is already
   * unique per control and already required.
   */
  const group = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  /**
   * Where the pill should be, before the server has agreed.
   *
   * These segments are links, so the real answer arrives with the next render
   * - and waiting for it meant the pill sat still for the length of a round
   * trip and then moved, which reads as the control hesitating rather than
   * responding. It moves on the tap and the navigation catches up behind it.
   *
   * Cleared whenever `active` agrees, so a navigation that fails or is
   * cancelled leaves the pill where the URL actually says it is rather than
   * where somebody hoped it would be.
   */
  const [tapped, setTapped] = useState<{ key: string; from: string } | null>(null);

  /**
   * Derived, not reset in an effect.
   *
   * The guess is stored alongside the `active` it was made against, so it
   * expires by simply no longer matching once the navigation lands - no effect
   * watching a prop to clear state, which is a render that exists only to
   * undo a previous one. A navigation that fails or is cancelled expires it
   * the same way.
   */
  const showing = tapped && tapped.from === active ? tapped.key : active;

  return (
    <div
      role="group"
      aria-label={label}
      // `-mx-1 px-1` so the focus ring of the first and last segments is not
      // clipped by the scroll container they live in.
      /*
        The CONTROL waits for the page, not the pill inside it.

        A page transition is a picture of the old page over the new one, and a
        white lozenge fading up through both is the sort of thing you cannot
        un-see. Delaying the whole control keeps it off that, and costs the
        pill nothing: changing a filter is not a navigation, so the group is
        never remounted for it and this never replays mid-move.
      */
      className="segmented -mx-1 flex max-w-full snap-x items-center gap-0.5 overflow-x-auto rounded-full px-1 font-bold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-0.5 rounded-full bg-[oklch(0.93_0.02_60)] p-1">
        {options.map((option) => {
          const on = option.key === showing;
          return (
            <Link
              key={option.key}
              href={option.href}
              onClick={() => setTapped({ key: option.key, from: active })}
              // aria-current follows the URL, never the optimistic guess: a
              // screen reader should not be told you are somewhere you are
              // still on your way to.
              aria-current={option.key === active ? "page" : undefined}
              className={`relative flex h-9 snap-start items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors sm:h-8 sm:px-3.5 sm:text-[13px] ${
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {/*
                The white pill.

                It is painted BEFORE the label and the label is given its own
                stacking position, rather than the pill being pushed behind
                with a negative z-index. That version put it behind the group's
                own background, so it was invisible at rest and only appeared
                while a transition had lifted it into a layer of its own -
                which is exactly how it was reported: "only appears during
                animation, disappears before and after".

                layoutId, not a view-transition name. Motion interpolates from
                wherever the pill actually is, so tapping a third segment
                while it is still travelling redirects it from its current
                position instead of restarting. View transitions cannot be
                interrupted - a second one mid-flight is dropped - and being
                able to change your mind halfway is the whole ask.
              */}
              {on && (
                <motion.span
                  layoutId={`pill-${group}`}
                  aria-hidden
                  /*
                    No entrance of its own, ever.

                    A layoutId pill moving between segments is not one element
                    sliding - it unmounts from the segment it was on and mounts
                    on the one it is going to, and Motion animates the gap. So
                    an `initial` opacity applies to the ARRIVING one, and a
                    fade-in delayed to keep it off a page transition also made
                    it vanish for the length of every segment change. Which is
                    the one thing it is there to do.
                    
                    `initial={false}` means it starts where it is told and only
                    ever moves. The page-entrance problem it was trying to
                    solve belongs to the whole control, and is handled on the
                    group below.
                  */
                  initial={false}
                  transition={{ type: "spring", stiffness: 700, damping: 42, mass: 0.6 }}
                  className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                />
              )}
              {/* Above the pill by being positioned at all, which is cheaper
                  than giving either of them a z-index to argue about. */}
              <span className="relative">{option.label}</span>
              {option.meta && (
                <span className="relative ml-1.5 font-semibold opacity-60">
                  {option.meta}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
