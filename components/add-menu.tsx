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

type ActionKey = (typeof actions)[number]["key"];

const STORAGE_KEY = "pantry.add-menu.v1";

/**
 * What this phone reaches for, counted on this phone.
 *
 * localStorage rather than a column: which two buttons somebody presses is a
 * per-device convenience, not a fact about the kitchen, and it must not cost a
 * round trip to Nuremberg to open a menu. Losing it - a new phone, cleared
 * data, private browsing - costs nothing, because the fallback is the same
 * order the menu has always had.
 */
function readUses(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function countUse(key: string) {
  try {
    const uses = readUses();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...uses, [key]: (uses[key] ?? 0) + 1 }));
  } catch {
    // Storage off. The menu still works, it just never learns.
  }
}

/**
 * What to offer before this phone has said anything, from where you are.
 *
 * Standing on the stock list, the thing you are about to do is change an
 * amount; on a recipe it is put something on the list. A sensible guess beats
 * an alphabetical one on the first day, and by the second week the counts have
 * taken over anyway.
 */
function contextPair(pathname: string): ActionKey[] {
  if (pathname.startsWith("/recipes")) return ["list", "recipe"];
  if (pathname.startsWith("/pantry/list")) return ["list", "add"];
  if (pathname.startsWith("/pantry")) return ["adjust", "add"];
  return ["add", "scan"];
}

export function AddMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /**
   * Read when the sheet is opened, not during render and not in an effect.
   *
   * The server has no localStorage and no business guessing what is in it, so
   * reading it while rendering would be a hydration mismatch - and opening the
   * menu is the only moment the answer is needed anyway.
   */
  const [uses, setUses] = useState<Record<string, number> | null>(null);

  function show() {
    setUses(readUses());
    setOpen(true);
  }

  const favourites: ActionKey[] = (() => {
    const counted = Object.entries(uses ?? {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key as ActionKey)
      .filter((key) => actions.some((action) => action.key === key));

    // Two presses of one thing is not a habit. Until there are, the context
    // guess is the better answer and this stays out of the way.
    if (counted.length < 2) return contextPair(pathname);
    return counted.slice(0, 2);
  })();

  const top = favourites
    .map((key) => actions.find((action) => action.key === key))
    .filter((action): action is (typeof actions)[number] => Boolean(action));
  const rest = actions.filter((action) => !favourites.includes(action.key));

  function go(key: string) {
    countUse(key);
    setOpen(false);
  }

  // Rendered on every route, including the signed-out screens, where an add
  // button has nothing to add to.
  if (pathname === "/login" || pathname === "/setup") return null;

  return (
    <>
      <BottomNav onAdd={show} />

      {/* Desktop keeps a corner button: the bottom bar is a phone answer, and
          a wide screen has neither the thumb nor the shortage of room that
          makes it the right one. */}
      <button
        type="button"
        aria-label="Open add menu"
        aria-expanded={open}
        onClick={show}
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
        {/*
          Two big ones, then the rest.

          Seven squares of identical size in a fixed order meant finding the
          same two every time, forever, in a menu that knows perfectly well
          which two they are. The pair is bigger because it is the answer; the
          others are still one tap away, which is what they were before.
        */}
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-label">
          {uses && Object.keys(uses).length >= 2 ? "What you use most" : "From here"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {top.map(({ key, label, Icon, href }) => (
            <Link
              key={key}
              href={href}
              onClick={() => go(key)}
              className="flex min-h-28 flex-col items-center justify-center gap-2.5 rounded-[16px] bg-primary px-3 py-4 text-center text-sm font-extrabold text-primary-foreground"
            >
              <Icon className="h-7 w-7" strokeWidth={2.5} />
              {label}
            </Link>
          ))}
        </div>

        <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-[0.08em] text-label">
          More
        </p>
        <div className="grid grid-cols-2 gap-2">
          {rest.map(({ key, label, Icon, href }) => (
            <Link
              key={key}
              href={href}
              onClick={() => go(key)}
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
