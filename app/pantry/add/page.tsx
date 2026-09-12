import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddItemForm } from "@/components/add-item-form";
import { SiteHeader } from "@/components/site-header";
import { getTags } from "@/lib/tags";
import { getShops } from "@/lib/shops";
import { getLocations } from "@/lib/kitchens";
import { getItemProfiles } from "@/lib/queries";
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
    tags?: string;
    shops?: string;
    pack_size?: string;
    sealed_count?: string;
    location?: string;
    barcode?: string;
  }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const [prefill, tags, shops, places, profiles] = await Promise.all([
    searchParams,
    getTags(kitchen.id),
    getShops(kitchen.id),
    getLocations(kitchen.id),
    getItemProfiles(kitchen.id),
  ]);

  const tagNames = tags.map((tag) => tag.name);

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
        <AddItemForm
          prefill={prefill}
          profiles={profiles}
          tags={tagNames}
          shops={shops.map((shop) => shop.name)}
          locations={places}
        />
      </main>
    </>
  );
}
