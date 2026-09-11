import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { QuickAdjust } from "@/components/quick-adjust";
import { SiteHeader } from "@/components/site-header";
import { getItems } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quick adjust · Pantry",
};

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const [{ ids }, all] = await Promise.all([searchParams, getItems(kitchen.id)]);

  /**
   * A selection made on the stock page, narrowed to what this kitchen holds.
   *
   * Filtered here rather than queried by id, because getItems is already scoped
   * to the kitchen - so an id borrowed from somewhere else simply is not in the
   * list, and there is no second place for that rule to be got wrong.
   */
  const wanted = new Set(
    (ids ?? "")
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
  const items = wanted.size > 0 ? all.filter((item) => wanted.has(item.id)) : all;
  const narrowed = wanted.size > 0 && items.length > 0;

  return (
    <>
      <SiteHeader active="stock" meta={`${items.length} items`} />
      <main className="mx-auto w-full max-w-[640px] px-5 py-7 pb-32">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Stock
        </Link>
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          {narrowed ? "Adjust these" : "Quick adjust"}
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          {narrowed ? (
            <>
              The {items.length} you picked.{" "}
              <Link
                href="/pantry/adjust"
                className="font-bold text-primary underline underline-offset-2"
              >
                Show everything
              </Link>
            </>
          ) : (
            "Used something, or brought some home? Nudge it here."
          )}
        </p>
        <QuickAdjust items={items} />
      </main>
    </>
  );
}
