"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { switchKitchen } from "@/app/kitchens/actions";
import { logout } from "@/app/login/actions";
import type { KitchenMembership } from "@/lib/kitchens";

/**
 * Everything on the right of the header, behind one button.
 *
 * The header had grown a kitchen switcher, a settings link and a sign-out
 * button alongside three nav tabs, which on a phone left no room for any of
 * them. They're all things you touch rarely and none of them needs to be
 * permanently on screen, so they live in a menu - which also gives the kitchen
 * list somewhere to be without a second dropdown.
 */
export function AccountMenu({
  current,
  kitchens,
  handle,
}: {
  current: KitchenMembership | null;
  kitchens: KitchenMembership[];
  handle: string | null;
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        aria-label="Account and kitchens"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[9.5rem] items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-[13px] font-bold disabled:opacity-50 sm:max-w-none sm:text-sm"
      >
        {/* The kitchen name is the useful label when there's room for it; on a
            phone the handle is shorter and identifies the account instead. */}
        <span className="truncate sm:hidden">{handle ? `@${handle}` : "Account"}</span>
        <span className="hidden truncate sm:inline">
          {current?.name ?? "Account"}
        </span>
        <span className="text-[10px] text-muted-foreground">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 overflow-hidden rounded-[14px] border border-border bg-card py-1 shadow-[0_14px_32px_-14px_rgba(60,44,30,0.5)]">
          {kitchens.length > 1 && (
            <>
              <p className="px-4 pt-2 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-label">
                Kitchens
              </p>
              {kitchens.map((kitchen) => (
                <button
                  key={kitchen.id}
                  type="button"
                  onClick={() => choose(kitchen.id)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-chip ${
                    kitchen.id === current?.id ? "text-primary" : ""
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
              <div className="my-1 border-t border-border" />
            </>
          )}

          {handle && (
            <Link
              href={`/people/${handle}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-semibold hover:bg-chip"
            >
              Your profile
            </Link>
          )}
          <Link
            href="/kitchens"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold hover:bg-chip"
          >
            {kitchens.length > 1 ? "Manage kitchens" : "Your kitchen"}
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold hover:bg-chip"
          >
            Settings
          </Link>

          <div className="my-1 border-t border-border" />
          <form action={logout}>
            <button
              type="submit"
              className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground hover:bg-chip hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
