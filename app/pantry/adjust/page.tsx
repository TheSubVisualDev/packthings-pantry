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

export default async function AdjustPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const items = await getItems(kitchen.id);

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
          Quick adjust
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          Used something, or brought some home? Nudge it here.
        </p>
        <QuickAdjust items={items} />
      </main>
    </>
  );
}
