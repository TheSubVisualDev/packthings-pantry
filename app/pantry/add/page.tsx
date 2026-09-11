import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddItemForm } from "@/components/add-item-form";
import { SiteHeader } from "@/components/site-header";
import { getItems } from "@/lib/queries";
import { getLocations } from "@/lib/kitchens";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add item · Pantry",
};

/**
 * Its own route rather than a modal so the barcode scanner has somewhere to
 * send a decoded product: the query string is the prefill.
 */
export default async function AddItemPage({
  searchParams,
}: {
  searchParams: Promise<{
    name?: string;
    quantity?: string;
    unit?: string;
    category?: string;
    location?: string;
    barcode?: string;
  }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const [prefill, items, places] = await Promise.all([
    searchParams,
    getItems(kitchen.id),
    getLocations(kitchen.id),
  ]);

  const categories = [
    ...new Set(items.map((item) => item.category).filter((c): c is string => !!c)),
  ].sort();

  return (
    <>
      <SiteHeader active="stock" />
      <main className="mx-auto w-full max-w-[520px] px-5 py-7 pb-32">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Stock
        </Link>
        <h1 className="mt-2 mb-6 text-[26px] font-extrabold tracking-[-0.02em]">
          Add item
        </h1>
        <AddItemForm prefill={prefill} categories={categories} locations={places} />
      </main>
    </>
  );
}
