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
      className={`-mx-5 flex snap-x items-center gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden ${className}`}
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
