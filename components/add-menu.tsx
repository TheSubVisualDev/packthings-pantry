"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Barcode glyph from the artboards - five bars of varying width. */
function BarcodeIcon() {
  return (
    <span className="flex h-[15px] w-5 items-center gap-[1.5px]" aria-hidden>
      {[2, 1, 3, 1, 2].map((width, i) => (
        <span
          key={i}
          className="h-full bg-ink"
          style={{ width: `${width}px` }}
        />
      ))}
    </span>
  );
}

const actions = [
  { key: "scan", label: "Scan barcode", icon: <BarcodeIcon />, href: "/pantry/scan" },
  { key: "add", label: "Add item", icon: "+", href: "/pantry/add" },
  { key: "recipe", label: "New recipe", icon: "✎", href: "/recipes/new" },
  { key: "adjust", label: "Quick adjust", icon: "↕", href: "/pantry/adjust" },
  { key: "list", label: "Shopping list", icon: "≡", href: "/pantry/list" },
] as const;

/**
 * Floating add menu from artboards 2a/2b. All four actions go somewhere now.
 */
export function AddMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The layout renders this on every route, including the signed-out login
  // screen, where an add button has nothing to add to.
  if (pathname === "/login") return null;

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-[rgba(28,26,23,0.28)] sm:bg-transparent"
        />
      )}

      {open && (
        <div
          data-fab
          className="fixed right-5 bottom-24 z-50 w-58 rounded-[18px] border border-border bg-white p-2 shadow-[0_18px_40px_-18px_rgba(60,44,30,0.5)] sm:right-8 sm:bottom-26">
          {actions.map((action) => (
            <Link
              key={action.key}
              href={action.href}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold transition-colors hover:bg-chip"
            >
              <span className="flex w-5 justify-center font-extrabold text-primary">
                {action.icon}
              </span>
              {action.label}
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Close add menu" : "Open add menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-fab
        className="fixed right-5 bottom-6 z-50 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-primary text-3xl leading-none text-primary-foreground shadow-[0_12px_28px_-8px_oklch(0.55_0.13_35/0.7)] transition-transform hover:scale-105 sm:right-8 sm:bottom-8 sm:h-15 sm:w-15"
      >
        <span className={open ? "rotate-45 transition-transform" : "transition-transform"}>
          +
        </span>
      </button>
    </>
  );
}
