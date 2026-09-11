"use client";

import Link from "next/link";
import type { ShopInUse } from "@/lib/shops";

/**
 * Narrows the shopping list to one shop.
 *
 * Links rather than buttons, so a filtered list is a URL you can keep open on
 * your phone while you walk round - and so the back button does what a back
 * button should.
 *
 * What it does NOT do is hide things with no shop set. Those survive every
 * filter, because "kitchen roll" can be got here as much as anywhere and the
 * point of the filter is to leave with everything, not to leave with less.
 */
export function ShopFilter({
  shops,
  active,
}: {
  shops: ShopInUse[];
  /** The shop currently filtered to, or null for everything. */
  active: string | null;
}) {
  if (shops.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      <Chip href="/pantry/list" label="Everywhere" active={active === null} />
      {shops.map((shop) => (
        <Chip
          key={shop.id}
          href={`/pantry/list?shop=${encodeURIComponent(shop.name)}`}
          label={shop.name}
          active={active !== null && active.toLowerCase() === shop.name.toLowerCase()}
        />
      ))}
    </div>
  );
}

function Chip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
        active ? "bg-ink text-background" : "bg-chip text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
