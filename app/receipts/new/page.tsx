import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ReceiptCapture } from "@/components/receipt-capture";
import { SiteHeader } from "@/components/site-header";
import { Page, PageTitle } from "@/components/ui/page";
import { visionAvailable } from "@/lib/receipt-vision";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add a receipt · Pantry",
};

export default async function NewReceiptPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Freceipts%2Fnew");
  if (!context.kitchen) redirect("/kitchens");
  if (context.kitchen.role === "viewer") redirect("/receipts");

  return (
    <>
      <SiteHeader active="none" />
      <Page width="form">
        <BackLink
          href="/receipts"
          label="Receipts"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        />
        <PageTitle
          title="Add a receipt"
          subtitle="It's saved straight away. Anything it couldn't read is asked about after."
        />
        <ReceiptCapture visionReady={visionAvailable()} />
      </Page>
    </>
  );
}
