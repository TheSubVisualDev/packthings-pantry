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
              className={`flex h-9 snap-start items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors sm:h-8 sm:px-3.5 sm:text-[13px] ${
                on
                  ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
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
