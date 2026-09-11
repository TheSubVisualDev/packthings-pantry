"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { switchKitchen } from "@/app/kitchens/actions";
import type { KitchenMembership } from "@/lib/kitchens";

/**
 * Which kitchen you're looking at, and a way to change it.
 *
 * Hidden entirely when there's only one, which is most people most of the time
 * - a picker with a single option is just noise in the header.
 */
export function KitchenSwitcher({
  current,
  kitchens,
}: {
  current: KitchenMembership;
  kitchens: KitchenMembership[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapper = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (kitchens.length <= 1) {
    return (
      <span className="hidden text-sm font-semibold text-muted-foreground sm:inline">
        {current.name}
      </span>
    );
  }

  function choose(id: number) {
    setOpen(false);
    startTransition(async () => {
      await switchKitchen(id);
      router.refresh();
    });
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-[13px] font-bold disabled:opacity-50 sm:text-sm"
      >
        {current.name}
        <span className="text-[10px] text-muted-foreground">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-[14px] border border-border bg-card py-1 shadow-[0_14px_32px_-14px_rgba(60,44,30,0.5)]">
          {kitchens.map((kitchen) => (
            <button
              key={kitchen.id}
              type="button"
              onClick={() => choose(kitchen.id)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-chip ${
                kitchen.id === current.id ? "text-primary" : ""
              }`}
            >
              <span className="min-w-0 truncate">
                {kitchen.name}
                {kitchen.role !== "owner" && (
                  <span className="ml-1.5 font-semibold text-muted-foreground">
                    @{kitchen.owner_handle}
                  </span>
                )}
              </span>
              {kitchen.role !== "owner" && (
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  {kitchen.role}
                </span>
              )}
            </button>
          ))}
          <Link
            href="/kitchens"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-chip"
          >
            Manage kitchens
          </Link>
        </div>
      )}
    </div>
  );
}
