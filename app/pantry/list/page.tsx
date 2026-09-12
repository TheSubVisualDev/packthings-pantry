import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShopFilter } from "@/components/shop-filter";
import { RestockPanel } from "@/components/restock-panel";
import { ShoppingList } from "@/components/shopping-list";
import { SiteHeader } from "@/components/site-header";
import { currentKitchen } from "@/lib/session";
import { getList, getRestockSuggestions } from "@/lib/shopping";
import { getItemProfiles } from "@/lib/queries";
import { getShops } from "@/lib/shops";
import { getTrip } from "@/lib/trip";
import { TripStrip } from "@/components/trip-strip";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping · Pantry",
};

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fpantry%2Flist");
  if (!context.kitchen) redirect("/kitchens?need=stock");

  const { shop } = await searchParams;
  const filter = shop?.trim() || null;

  const [lines, restock, profiles, shops, trip] = await Promise.all([
    getList(context.kitchen.id, filter),
    getRestockSuggestions(context.kitchen.id),
    getItemProfiles(context.kitchen.id),
    getShops(context.kitchen.id),
    getTrip(context.kitchen.id),
  ]);
  const todo = lines.filter((line) => !line.bought_at).length;

  return (
    <>
      <SiteHeader active="stock" meta={`${todo} to buy`} />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground print:hidden"
        >
          ← Stock
        </Link>
        <div className="mt-2 mb-1 flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Shopping</h1>
          <PrintButton label="On paper" />
        </div>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          {filter
            ? `What ${filter} has, plus anything you can get anywhere.`
            : `Shared with everyone in ${context.kitchen.name}.`}
        </p>

        {/* What the trip is for, at the top of the list that is for it. */}
        {trip && (
          <div className="mb-4">
            <TripStrip trip={trip} />
          </div>
        )}

        <ShopFilter shops={shops} active={filter} />
        <RestockPanel suggestions={restock} />
        <ShoppingList lines={lines} filter={filter} profiles={profiles} />
      </main>
    </>
  );
}
