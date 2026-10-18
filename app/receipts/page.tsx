import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, Settings2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Page, PageTitle } from "@/components/ui/page";
import { getCategories, listReceipts, receiptIdsMatching, type ReceiptSummary } from "@/lib/receipt-db";
import { pounds, type ReceiptState } from "@/lib/receipts";
import { sayDay } from "@/lib/dates";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Receipts · Pantry",
};

const CARD = "rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

/**
 * The inbox, which is what the app opens on now.
 *
 * Sam's front page: "it needs to operate like a sort of workflow - I've got
 * open receipts, I've got semi-completed receipts and then hidden I've got
 * closed receipts". So three piles in order of how much they need somebody,
 * and the archive one tap away rather than on screen. Each card shows the
 * single most important unknown, because that is the question to go and ask.
 *
 * The query string narrows it, which is how the spend page's numbers lead
 * back to the receipts they were counted from: ?q= a name, ?category= an id.
 */
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string; q?: string; category?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Freceipts");
  if (!context.kitchen) redirect("/kitchens");
  const kitchen = context.kitchen;
  const params = await searchParams;

  const [all, categories] = await Promise.all([
    listReceipts(kitchen.id),
    params.category ? getCategories(kitchen.id) : Promise.resolve([]),
  ]);

  const query = params.q?.trim().toLowerCase() ?? "";
  const categoryId = Number(params.category) || null;
  const filtering = Boolean(query || categoryId);

  let receipts = all;
  if (filtering) {
    const matched = await receiptIdsMatching(kitchen.id, query, categoryId);
    receipts = all.filter((receipt) => matched.has(receipt.id));
  }

  const showClosed = params.closed === "1" || filtering;
  const pile = (state: ReceiptState) => receipts.filter((receipt) => receipt.state === state);
  const closedCount = all.filter((receipt) => receipt.state === "closed").length;
  const canEdit = kitchen.role !== "viewer";
  const filterLabel = [
    query ? `“${params.q}”` : null,
    categoryId ? categories.find((c) => c.id === categoryId)?.name ?? "a category" : null,
  ]
    .filter(Boolean)
    .join(" in ");

  return (
    <>
      <SiteHeader active="none" />
      <Page width="read">
        <PageTitle
          title="Receipts"
          subtitle={
            filtering
              ? `Receipts with ${filterLabel} on them`
              : "What came in, and what's still to say about it."
          }
          actions={
            <>
              <Link
                href="/receipts/settings"
                aria-label="Categories and cards"
                className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-chip"
              >
                <Settings2 className="h-4 w-4" />
              </Link>
              {canEdit && (
                <Link
                  href="/receipts/new"
                  className="flex items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> Add a receipt
                </Link>
              )}
            </>
          }
        />

        {filtering && (
          <p className="mb-4 text-sm font-semibold">
            <Link href="/receipts" className="text-muted-foreground underline underline-offset-2">
              Show every receipt
            </Link>
          </p>
        )}

        {all.length === 0 ? (
          <section className={`${CARD} p-6`}>
            <h2 className="text-[19px] font-extrabold tracking-[-0.01em]">No receipts yet</h2>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              Photograph one, paste one, or type one in. Every receipt is who paid, what it cost
              and who it was for - and that is enough to split the bill and see where the money goes.
            </p>
            {canEdit && (
              <Link
                href="/receipts/new"
                className="mt-4 inline-flex rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground"
              >
                Add the first one
              </Link>
            )}
          </section>
        ) : (
          <div className="space-y-7">
            <Pile title="Needs you" hint="Can't be split until these are answered." receipts={pile("needs")} />
            <Pile title="Nearly there" hint="Already counted. A few things would make the numbers better." receipts={pile("nearly")} />
            <Pile title="Ready to close" hint="Nothing left to ask." receipts={pile("done")} />
            {showClosed && <Pile title="Closed" receipts={pile("closed")} />}
            {!showClosed && closedCount > 0 && (
              <Link
                href="/receipts?closed=1"
                className="block text-sm font-bold text-muted-foreground underline underline-offset-2"
              >
                {closedCount} closed {closedCount === 1 ? "receipt" : "receipts"}
              </Link>
            )}
            {filtering && receipts.length === 0 && (
              <p className="text-sm font-semibold text-muted-foreground">Nothing matches.</p>
            )}
          </div>
        )}

        <nav className="mt-9 flex flex-wrap gap-2 text-sm font-bold">
          <Link href="/spend" className="rounded-[14px] bg-chip px-4 py-2.5">Spend and who owes whom</Link>
          <Link href="/meals" className="rounded-[14px] bg-chip px-4 py-2.5">Meals</Link>
        </nav>
      </Page>
    </>
  );
}

function Pile({ title, hint, receipts }: { title: string; hint?: string; receipts: ReceiptSummary[] }) {
  if (receipts.length === 0) return null;
  return (
    <section>
      <h2 className="text-[13px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
        {title} · {receipts.length}
      </h2>
      {hint && <p className="mt-0.5 text-sm font-semibold text-muted-foreground">{hint}</p>}
      <ul className="mt-3 space-y-2.5">
        {receipts.map((receipt) => (
          <li key={receipt.id}>
            <ReceiptCard receipt={receipt} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReceiptCard({ receipt }: { receipt: ReceiptSummary }) {
  const first = receipt.checklist[0];
  const total = receipt.total_pence ?? receipt.lines_pence;
  return (
    <Link href={`/receipts/${receipt.id}`} className={`${CARD} flex items-center gap-3 p-4`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-extrabold">
          {receipt.shop_name ?? "Somewhere"}
          <span className="font-semibold text-muted-foreground">
            {" · "}
            {receipt.bought_on ? sayDay(receipt.bought_on) : "no date"}
          </span>
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-muted-foreground">
          {receipt.line_count} {receipt.line_count === 1 ? "line" : "lines"}
          {receipt.purchaser_name ? ` · ${receipt.purchaser_name} paid` : ""}
        </p>
        {first && receipt.state !== "closed" && (
          <p
            className={`mt-1.5 truncate text-sm font-bold ${first.hard ? "text-destructive" : "text-foreground"}`}
          >
            {first.label}
            {receipt.checklist.length > 1 ? ` · +${receipt.checklist.length - 1} more` : ""}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[17px] font-extrabold tabular-nums">{pounds(total)}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
