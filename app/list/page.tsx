import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ShoppingList } from "@/components/shopping-list";
import { SiteHeader } from "@/components/site-header";
import { PrintButton } from "@/components/print-button";
import { currentKitchen } from "@/lib/session";
import { getList } from "@/lib/shopping";
import { AddToListButton } from "@/components/spend-forms";
import { getBoughtLines } from "@/lib/receipt-db";
import { probablyDue, repeatBuys } from "@/lib/receipts";
import { londonToday } from "@/lib/dates";

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

  /**
   * What the receipts say has probably run out.
   *
   * Sam's milk: not "you are out of soy sauce", which nothing here can know
   * any more, but "you usually buy it every three weeks and it has been
   * three". Only for a kitchen - a personal list has no receipts - and only
   * things not already on the list, capped at five so it stays a nudge.
   */
  const waiting = new Set(
    lines.filter((line) => !line.bought_at).map((line) => line.item_name.toLowerCase().trim()),
  );
  const due = kitchen
    ? probablyDue(repeatBuys(await getBoughtLines(kitchen.id)), londonToday())
        .filter((entry) => !waiting.has(entry.name.toLowerCase().trim()))
        .slice(0, 5)
    : [];

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

        {due.length > 0 && kitchen?.role !== "viewer" && (
          <section className="mb-5 rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] print:hidden">
            <h2 className="text-[17px] font-extrabold">Probably due</h2>
            <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
              Going by how often the receipts say you buy them.
            </p>
            <ul className="mt-3 divide-y divide-border">
              {due.map((entry) => (
                <li key={entry.name} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold">{entry.name}</p>
                    <p className="text-[13px] font-semibold text-muted-foreground">
                      Every ~{entry.every} days · last {entry.since} days ago
                    </p>
                  </div>
                  <AddToListButton name={entry.name} every={entry.every} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <ShoppingList lines={lines} />
      </main>
    </>
  );
}
