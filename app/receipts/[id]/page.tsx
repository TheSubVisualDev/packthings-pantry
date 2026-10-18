import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ReceiptEditor } from "@/components/receipt-editor";
import { SiteHeader } from "@/components/site-header";
import { Page } from "@/components/ui/page";
import {
  getCategories,
  getHousehold,
  getMeals,
  getReceipt,
  getShopsFor,
} from "@/lib/receipt-db";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Receipt · Pantry",
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  const context = await currentKitchen();
  if (!context.ok) redirect(`/login?next=${encodeURIComponent(`/receipts/${raw}`)}`);
  if (!context.kitchen) redirect("/kitchens");
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const kitchenId = context.kitchen.id;
  const [found, household, categories, meals, shops] = await Promise.all([
    getReceipt(kitchenId, id),
    getHousehold(kitchenId),
    getCategories(kitchenId),
    getMeals(kitchenId),
    getShopsFor(kitchenId),
  ]);
  // Another kitchen's receipt and no receipt at all look the same from here,
  // which is the point: the id says nothing about whether it exists.
  if (!found) notFound();

  return (
    <>
      <SiteHeader active="receipts" />
      <Page width="read">
        <BackLink
          href="/receipts"
          label="Receipts"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        />
        <ReceiptEditor
          receipt={found.receipt}
          lines={found.lines}
          household={household}
          categories={categories}
          meals={meals.map(({ id, name, kind }) => ({ id, name, kind }))}
          shops={shops.map((shop) => shop.name)}
          canEdit={context.kitchen.role !== "viewer"}
          me={context.user.id}
        />
      </Page>
    </>
  );
}
