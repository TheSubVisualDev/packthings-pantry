import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ItemDetail } from "@/components/item-detail";
import { SiteHeader } from "@/components/site-header";
import { getLocations } from "@/lib/kitchens";
import { getItem, getItems } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Item · Pantry",
};

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  if (!context.kitchen) redirect("/kitchens?need=stock");

  const itemId = Number((await params).id);
  if (!Number.isInteger(itemId)) notFound();

  const [item, locations, all] = await Promise.all([
    getItem(context.kitchen.id, itemId),
    getLocations(context.kitchen.id),
    getItems(context.kitchen.id),
  ]);

  // getItem scopes by kitchen, so an id from somebody else's shelves is
  // indistinguishable from one that doesn't exist.
  if (!item) notFound();

  const categories = [
    ...new Set(all.map((entry) => entry.category).filter((c): c is string => !!c)),
  ].sort();

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Stock
        </Link>

        <div className="mt-3">
          <ItemDetail
            item={item}
            locations={locations}
            categories={categories}
            canEdit={context.kitchen.role !== "viewer"}
          />
        </div>
      </main>
    </>
  );
}
