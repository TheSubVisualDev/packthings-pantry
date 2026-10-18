import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Page, PageTitle } from "@/components/ui/page";
import { ConfirmDelete } from "@/components/confirm-delete";
import { CategorySettings } from "@/components/receipt-settings-categories";
import { getCategories } from "@/lib/receipt-db";
import { getCards } from "@/lib/spend-db";
import { currentKitchen } from "@/lib/session";
import { forgetCard } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Receipt settings · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

/**
 * The two things a kitchen teaches its receipts: what to file lines under,
 * and whose card is whose.
 *
 * Its own page rather than a section of /settings, because both belong to
 * the kitchen and /settings is about you.
 */
export default async function ReceiptSettingsPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Freceipts%2Fsettings");
  if (!context.kitchen) redirect("/kitchens");
  const { kitchen } = context;
  const canEdit = kitchen.role !== "viewer";

  const [categories, cards] = await Promise.all([getCategories(kitchen.id), getCards(kitchen.id)]);

  return (
    <>
      <SiteHeader active="receipts" />
      <Page width="form">
        <BackLink
          href="/receipts"
          label="Receipts"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        />
        <div className="mt-2">
          <PageTitle title="Receipt settings" subtitle={kitchen.name} />
        </div>

        <div className="space-y-3">
          <section className={CARD}>
            <h2 className={LABEL}>Categories</h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              What a line is, for adding up the spend. Snacks are always left out of it.
            </p>
            <CategorySettings
              categories={categories.map(({ id, name }) => ({ id, name }))}
              canEdit={canEdit}
            />
          </section>

          <section className={CARD}>
            <h2 className={LABEL}>Known cards</h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              Learned when someone says who paid for a receipt that printed the card&apos;s last
              four digits, so the next one fills itself in.
            </p>
            {cards.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {cards.map((card) => (
                  <li key={card.last4} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm font-bold">
                      <span className="font-mono tabular-nums">•••• {card.last4}</span>
                      <span className="ml-2 font-semibold text-muted-foreground">{card.name}</span>
                    </span>
                    {canEdit && (
                      <ConfirmDelete
                        action={forgetCard.bind(null, card.last4)}
                        label="Forget"
                        question={`Forget the card ending ${card.last4}? Receipts already paid with it keep ${card.name} as the payer.`}
                        yes="Forget it"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Page>
    </>
  );
}
