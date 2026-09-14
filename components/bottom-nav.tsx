"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
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

const SECTIONS = [
  { key: "stock", label: "Stock", href: "/pantry", Icon: Boxes },
  { key: "tonight", label: "Tonight", href: "/tonight", Icon: UtensilsCrossed },
  { key: "recipes", label: "Cookbook", href: "/recipes", Icon: BookOpen },
  { key: "discover", label: "Discover", href: "/discover", Icon: Compass },
] as const;

export function BottomNav({ onAdd }: { onAdd: () => void }) {
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

  // Split either side of the add button, which is not a section and should not
  // look like one.
  const [left, right] = [SECTIONS.slice(0, 2), SECTIONS.slice(2)];

  return (
    <nav
      aria-label="Sections"
      data-nav
      // pb for the home indicator, which only reports a height once the
      // viewport is fit to cover - before that this padding was always zero
      // and the labels sat in the swipe area.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur select-none sm:hidden print:hidden"
    >
      <div className="flex items-stretch justify-around">
        {left.map(({ key, ...section }) => (
          <Tab key={key} {...section} current={active(section.href)} />
        ))}

        {/* Raised out of the bar so it reads as an action rather than a fifth
            place to go, and kept dead centre because that is where a thumb
            sits when a phone is held in one hand. */}
        {/* The most-pressed control in the app, so it gets the most obvious
            give: down hard under the thumb, and a real spring back. */}
        <motion.button
          type="button"
          onClick={onAdd}
          aria-label="Add"
          whileTap={{ scale: 0.86 }}
          transition={{ type: "spring", stiffness: 500, damping: 17 }}
          className="no-squish relative -top-3 mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_18px_-6px_rgba(60,44,30,0.6)]"
        >
          <Plus className="h-6 w-6" strokeWidth={3} />
        </motion.button>

        {right.map(({ key, ...section }) => (
          <Tab key={key} {...section} current={active(section.href)} />
        ))}
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
