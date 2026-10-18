import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ShoppingList } from "@/components/shopping-list";
import { SiteHeader } from "@/components/site-header";
import { PrintButton } from "@/components/print-button";
import { currentKitchen } from "@/lib/session";
import { getList } from "@/lib/shopping";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping · Pantry",
};

/**
 * The shopping list, at /list.
 *
 * It lived at /pantry/list, under the stock it was compared against. v2 took
 * stock tracking out (18 Oct 2026), so the list is its own place now and only
 * a list: what to buy, ticked off in the shop. The running-low panel, the
 * grouping by shop and the shopping trip all read shelves, and went with them.
 */
export default async function ShoppingPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Flist");

  const kitchen = context.kitchen;
  const lines = await getList(
    kitchen ? { kitchen: kitchen.id } : { owner: context.user.id },
  );
  const todo = lines.filter((line) => !line.bought_at).length;

  return (
    <>
      <SiteHeader active="none" meta={`${todo} on the list`} />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <BackLink
          href="/plan"
          label="Plan"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground print:hidden"
        />
        <div className="mt-2 mb-1 flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Shopping</h1>
          <PrintButton label="On paper" />
        </div>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          {kitchen ? `Shared with everyone in ${kitchen.name}.` : "Yours alone."}
        </p>

        <ShoppingList lines={lines} />
      </main>
    </>
  );
}
