"use client";

import Link from "next/link";

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

  return (
    <div
      role="group"
      aria-label={label}
      // `-mx-1 px-1` so the focus ring of the first and last segments is not
      // clipped by the scroll container they live in.
      className="-mx-1 flex max-w-full snap-x items-center gap-0.5 overflow-x-auto rounded-full px-1 font-bold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-0.5 rounded-full bg-[oklch(0.93_0.02_60)] p-1">
        {options.map((option) => {
          const on = option.key === active;
          return (
            <Link
              key={option.key}
              href={option.href}
              aria-current={on ? "page" : undefined}
              className={`relative flex h-9 snap-start items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors sm:h-8 sm:px-3.5 sm:text-[13px] ${
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {/*
                The white pill travels rather than teleporting.

                Not Motion's layoutId, which was the obvious answer and the
                wrong one: these segments are LINKS, so picking one navigates
                and the whole tree remounts - there is no shared React state
                for a layout animation to span, and it jumped 24px to 178px
                with nothing in between when measured.

                A view-transition name does span it. The browser sees the same
                named box in the before and after pictures and morphs one into
                the other, which is exactly the job, and it is the only thing
                that works across a navigation.

                Behind the label via a negative z-index on the pill rather than
                a positive one on the text, so a segment with a meta count does
                not need its own stacking context to stay readable.
              */}
              {on && (
                <span
                  aria-hidden
                  style={{
                    viewTransitionName: `pill-${group}`,
                    viewTransitionClass: "pill",
                  }}
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                />
              )}
              {option.label}
              {option.meta && (
                <span className="ml-1.5 font-semibold opacity-60">{option.meta}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
