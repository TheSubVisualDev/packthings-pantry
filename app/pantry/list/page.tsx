import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingList } from "@/components/shopping-list";
import { SiteHeader } from "@/components/site-header";
import { currentKitchen } from "@/lib/session";
import { getList } from "@/lib/shopping";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping · Pantry",
};

export default async function ShoppingPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fpantry%2Flist");
  if (!context.kitchen) redirect("/kitchens?need=stock");

  const lines = await getList(context.kitchen.id);
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
          Shared with everyone in {context.kitchen.name}.
        </p>

        <ShoppingList lines={lines} />
      </main>
    </>
  );
}
