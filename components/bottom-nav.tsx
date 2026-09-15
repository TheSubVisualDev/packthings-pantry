"use client";

import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Boxes, BookOpen, Compass, Plus, UtensilsCrossed } from "lucide-react";

/**
 * Primary navigation, on a phone, where a thumb is.
 *
 * It was a row of tabs across the top of the screen - the one part of a phone
 * a thumb cannot reach without shifting your grip - and adding a fourth
 * section made it start scrolling sideways, so the sections were both far away
 * and no longer all visible at once. Meanwhile the most-pressed control in the
 * app, the add button, floated alone at the bottom right.
 *
 * So the two swap. Sections live along the bottom, add sits in the middle of
 * them where the thumb rests, and the top of the screen goes back to being
 * content.
 *
 * **Phones only.** On a desktop this would be a long way from the pointer and
 * a long way from the page, so the header keeps its tabs there and this hides
 * itself. That is the whole of "mobile first, desktop serviceable": the phone
 * gets the shape that suits it and the desktop gets the shape that suits it,
 * rather than one of them getting the other's leftovers.
 */

/**
 * Three, since the shelf moved.
 *
 * Stock stopped being a place to go when the shelf moved under Tonight - what
 * is in the kitchen is part of deciding what to cook, not a separate errand.
 * /pantry is still a route and still holds the list, the groupings and the
 * bulk actions; it is reached from the shelf rather than from here.
 */
const SECTIONS = [
  { key: "tonight", label: "Tonight", href: "/tonight", Icon: UtensilsCrossed },
  { key: "recipes", label: "Cookbook", href: "/recipes", Icon: BookOpen },
  { key: "discover", label: "Discover", href: "/discover", Icon: Compass },
] as const;

export function BottomNav({
  onAdd,
  open = false,
}: {
  onAdd: () => void;
  /** Whether the add sheet is showing, so the button can become its own close. */
  open?: boolean;
}) {
  const pathname = usePathname();

  // Nothing to navigate before you are in.
  if (pathname === "/login" || pathname === "/setup") return null;

  /**
   * Nor during a cook.
   *
   * The step-by-step screen is the one place in the app that is a mode rather
   * than a page: it is full-bleed, it holds the screen awake, and its Next
   * button wants the bottom of the phone. A tab bar over it is both a way to
   * lose your place and thirty pixels of the instruction.
   */
  if (/^\/recipes\/\d+\/cook$/.test(pathname)) return null;

  const active = (href: string) =>
    href === "/pantry" ? pathname.startsWith("/pantry") : pathname.startsWith(href);


  return (
    <nav
      aria-label="Sections"
      data-nav
      // pb for the home indicator, which only reports a height once the
      // viewport is fit to cover - before that this padding was always zero
      // and the labels sat in the swipe area.
      className="fixed inset-x-0 bottom-0 z-40 overflow-visible border-t border-border bg-surface-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur select-none sm:hidden print:hidden"
    >
      {/*
        Four things in four equal columns, the button included.

        It used to be split two-and-two around a centred button, which only
        works with an even number of sections. With three the button had no
        middle to sit in: putting it at the end balanced the two ends and left
        the gaps uneven. A grid makes every gap identical by construction, at
        any width, and the button simply takes the fourth column.
      */}
      <div className="grid grid-cols-4 items-center">
        {SECTIONS.map(({ key, ...section }) => (
          <Tab key={key} {...section} current={active(section.href)} />
        ))}

        <div className="flex items-center justify-center">
          {/*
            Bigger than a tab, and standing proud of the bar.

            It is the only thing down here that DOES something rather than
            going somewhere, so it should not look like a fourth place to go.
            Overhanging the top edge, with a ring of the bar's own colour
            behind it, is what separates "sits on top of the app" from "tab
            somebody has coloured in".
          */}
          <motion.button
            type="button"
            onClick={onAdd}
            aria-label="Add"
            whileTap={{ scale: 0.86 }}
            /* A plus turning into a cross, because it is the same button doing
               the same job in reverse and they are the same two strokes at
               forty-five degrees. Cheap, and it is the bit people notice. */
            animate={{ rotate: open ? 135 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 17 }}
            className="no-squish relative -top-4 flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border-4 border-surface-raised bg-primary text-primary-foreground shadow-[0_6px_18px_-6px_rgba(60,44,30,0.6)]"
          >
            <Plus className="h-6 w-6" strokeWidth={3} />
          </motion.button>
        </div>
      </div>
    </nav>
  );
}

function Tab({
  label,
  href,
  Icon,
  current,
}: {
  label: string;
  href: string;
  Icon: typeof Boxes;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${
        current ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {/*
        The pill slides between tabs rather than blinking on under the new one.

        layoutId is the whole trick: two elements in different places sharing
        one id are one object to Motion, so it animates the gap between them.
        This is the thing CSS cannot do - there is no transition between an
        element that was removed over there and a different one added here.
      */}
      {current && (
        <motion.span
          layoutId="nav-here"
          aria-hidden
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-primary"
        />
      )}
      <motion.span
        animate={{ scale: current ? 1.1 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
      >
        <Icon className="h-5 w-5" strokeWidth={current ? 2.75 : 2.25} />
      </motion.span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
