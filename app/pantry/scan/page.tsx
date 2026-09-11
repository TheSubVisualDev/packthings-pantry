import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanPanel } from "@/components/scan-panel";
import { SiteHeader } from "@/components/site-header";
import { getItems } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scan · Pantry",
};

export default async function ScanPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const items = await getItems(kitchen.id);

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
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Scan a barcode
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          Point the camera at the bars. Browsers only hand over a camera on an
          https:// address, so this won&apos;t work from a plain-http preview.
        </p>
        <ScanPanel items={items} />
      </main>
    </>
  );
}
