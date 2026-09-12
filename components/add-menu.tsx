"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpDown,
  Barcode,
  ListChecks,
  NotebookPen,
  Plus,
  Receipt,
  ShoppingBasket,
} from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { Sheet } from "@/components/ui/sheet";

/**
 * Everything you can add, and the two ways to reach it.
 *
 * On a phone the opener is the raised button in the middle of the bottom bar,
 * because that is where a thumb rests and this is the most-pressed control in
 * the app. On a desktop it stays a floating button in the corner, which is
 * where a pointer expects one.
 *
 * The menu itself was a small panel hanging off the button, which on a phone
 * meant a 230px-wide list of six things sitting over the page in the corner
 * furthest from anywhere. It is a sheet now - the same sheet as everywhere
 * else, so it closes on Escape, traps focus and does not scroll the page
 * behind it - and the actions are two across rather than six down, which fits
 * without scrolling and makes each one a square you can hit rather than a
 * 40px-tall strip.
 */

const actions = [
  { key: "add", label: "Add item", Icon: Plus, href: "/pantry/add" },
  { key: "adjust", label: "Quick adjust", Icon: ArrowUpDown, href: "/pantry/adjust" },
  { key: "scan", label: "Scan barcode", Icon: Barcode, href: "/pantry/scan" },
  { key: "receipt", label: "Scan receipt", Icon: Receipt, href: "/pantry/receipt" },
  { key: "list", label: "Shopping list", Icon: ShoppingBasket, href: "/pantry/list" },
  { key: "recipe", label: "New recipe", Icon: NotebookPen, href: "/recipes/new" },
  { key: "cooked", label: "Cooked log", Icon: ListChecks, href: "/cooked" },
] as const;

export function AddMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Rendered on every route, including the signed-out screens, where an add
  // button has nothing to add to.
  if (pathname === "/login" || pathname === "/setup") return null;

  return (
    <>
      <BottomNav onAdd={() => setOpen(true)} />

      {/* Desktop keeps a corner button: the bottom bar is a phone answer, and
          a wide screen has neither the thumb nor the shortage of room that
          makes it the right one. */}
      <button
        type="button"
        aria-label="Open add menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed right-8 bottom-8 z-40 hidden h-15 w-15 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_28px_-8px_oklch(0.55_0.13_35/0.7)] transition-transform hover:scale-105 sm:flex"
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add"
        description="Everything that puts something into the pantry."
      >
        <div className="grid grid-cols-2 gap-2">
          {actions.map(({ key, label, Icon, href }) => (
            <Link
              key={key}
              href={href}
              onClick={() => setOpen(false)}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[16px] bg-chip px-3 py-4 text-center text-[13px] font-bold transition-colors hover:bg-border"
            >
              <Icon className="h-5 w-5 text-primary" strokeWidth={2.5} />
              {label}
            </Link>
          ))}
        </div>
      </Sheet>
    </>
  );
}
