import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShopFilter } from "@/components/shop-filter";
import { RestockPanel } from "@/components/restock-panel";
import { ShoppingList } from "@/components/shopping-list";
import { SiteHeader } from "@/components/site-header";
import { currentKitchen } from "@/lib/session";
import { getList, getRestockSuggestions } from "@/lib/shopping";
import { getShops } from "@/lib/shops";

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

  const [lines, restock, shops] = await Promise.all([
    getList(context.kitchen.id, filter),
    getRestockSuggestions(context.kitchen.id),
    getShops(context.kitchen.id),
  ]);
  const todo = lines.filter((line) => !line.bought_at).length;

  return (
    <>
      <SiteHeader active="stock" meta={`${todo} to buy`} />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Stock
        </Link>
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Shopping
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          {filter
            ? `What ${filter} has, plus anything you can get anywhere.`
            : `Shared with everyone in ${context.kitchen.name}.`}
        </p>

        <ShopFilter shops={shops} active={filter} />
        <RestockPanel suggestions={restock} />
        <ShoppingList lines={lines} filter={filter} />
      </main>
    </>
  );
}
