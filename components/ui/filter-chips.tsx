import Link from "next/link";

/**
 * A row of things to narrow a list by.
 *
 * Kept apart from Segmented on purpose, because they answer different
 * questions and looking alike would be a lie. A segmented control switches
 * between views that are all of the same list - group by tag, or by location -
 * and exactly one is always chosen. These take a long list and make it
 * shorter, several can be on at once in principle, and "none of them" is the
 * normal state rather than an empty one.
 *
 * Tapping the one that is already on turns it off. That is the whole
 * interaction, it is what everybody already expects from a filter chip, and it
 * saves a "clear" button that would otherwise sit there greyed out most of the
 * time.
 *
 * **Mobile first.** Thumb-height by default and tighter on a desktop, and the
 * row scrolls sideways rather than wrapping - a filter row that grows to three
 * lines pushes the thing you are filtering off the screen, which is the
 * opposite of helping.
 */

export interface FilterChip {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /** Drawn as an outline rather than a solid, for a fact rather than a choice. */
  quiet?: boolean;
}

export function FilterChips({
  chips,
  label,
  className = "",
}: {
  chips: readonly FilterChip[];
  label: string;
  className?: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={label}
      /**
       * The row has always scrolled; nothing ever said so.
       *
       * On a phone the chips run off the edge and the last one is cut through
       * the middle of a word - "under 30 min · und" - which reads as text that
       * did not fit rather than as a row you can push. The scrollbar is hidden
       * on purpose (it sits over the chips on a touch device), so the fade is
       * what is left to say it.
       *
       * Only below sm, where it actually scrolls - above that the row wraps
       * and there is nothing to hint at. The fade is 28px against the 20px of
       * trailing padding the row already carries, so when everything fits it
       * lands on empty background and cannot dim a chip nobody is cutting off.
       */
      className={`-mx-5 flex snap-x items-center gap-1.5 overflow-x-auto px-5 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-pressed={chip.active}
          className={`flex h-9 shrink-0 snap-start items-center rounded-full px-3.5 text-xs font-bold whitespace-nowrap transition-colors sm:h-8 ${
            chip.active
              ? "bg-primary text-primary-foreground"
              : chip.quiet
                ? "border border-border text-muted-foreground hover:text-foreground"
                : "bg-chip text-foreground hover:bg-border"
          }`}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}
