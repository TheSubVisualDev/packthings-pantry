import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { SiteHeader } from "@/components/site-header";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scan a receipt · Pantry",
};

export default async function ReceiptPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fpantry%2Freceipt");
  if (!context.kitchen) redirect("/kitchens?need=stock");
  if (context.kitchen.role === "viewer") redirect("/pantry");

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
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Scan a receipt
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          Put a whole shop away at once, instead of one thing at a time.
        </p>

        <ReceiptScanner />
      </main>
    </>
  );
}
