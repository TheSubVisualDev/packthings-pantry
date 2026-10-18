import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RankedBars } from "@/components/ranked-bars";
import { SiteHeader } from "@/components/site-header";
import { AddToListButton, MarkPaidButton, PaymentForm } from "@/components/spend-forms";
import { Page, PageTitle } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { sayDay } from "@/lib/dates";
import {
  getBoughtLines,
  getCategories,
  getHousehold,
  getSettlements,
  getSplitInput,
} from "@/lib/receipt-db";
import {
  balances,
  pounds,
  probablyDue,
  repeatBuys,
  settleUp,
  spendByCategory,
  spendByPeriod,
  type Period,
} from "@/lib/receipts";
import { currentKitchen } from "@/lib/session";
import { londonToday, pendingListNames } from "@/lib/spend-db";
import { removePayment } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spend · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";
const NOTE = "text-xs font-semibold text-muted-foreground";
const LINK = "font-bold text-primary underline underline-offset-2";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What a period is called. By hand rather than through Intl for the reason
 * sayDay gives: Node and a browser disagree about "Sep" and "Sept".
 */
function periodLabel(start: string, period: Period, thisYear: number): string {
  const [year, month, day] = start.split("-").map(Number);
  if (period === "week") return `Week of ${day} ${MONTHS[month - 1]}${year === thisYear ? "" : ` ${year}`}`;
  if (period === "month") return `${MONTHS[month - 1]} ${year}`;
  return `${MONTHS[month - 1]}–${MONTHS[month + 1]} ${year}`;
}

function times(count: number): string {
  return count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
}

/**
 * Where the money goes, and who owes whom for it.
 *
 * Who owes whom is first because it is the one with something to do about it.
 * Every section disappears when there is not enough to say it from - the rule
 * lib/stats.ts keeps: a chart of one receipt is a chart of nothing.
 */
export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fspend");
  if (!context.kitchen) redirect("/kitchens");
  const { kitchen, user } = context;
  const canEdit = kitchen.role !== "viewer";

  const { period: asked } = await searchParams;
  const period: Period = PERIODS.some((p) => p.key === asked) ? (asked as Period) : "month";
  const today = londonToday();

  const [lines, split, household, settlements, categories, onList] = await Promise.all([
    getBoughtLines(kitchen.id),
    getSplitInput(kitchen.id),
    getHousehold(kitchen.id),
    getSettlements(kitchen.id),
    getCategories(kitchen.id),
    pendingListNames(kitchen.id),
  ]);

  // --- who owes whom -------------------------------------------------------

  const names = new Map(household.map((person) => [person.id, person.name]));
  const nameOf = (id: number) => names.get(id) ?? "Someone who left";
  const net = balances(split, household.map((person) => person.id), settlements);
  const payments = settleUp(net);
  const standing = [...net]
    .filter(([, pence]) => pence !== 0)
    .sort((a, b) => b[1] - a[1]);

  const counted = split.filter((entry) => entry.receipt.purchaser_id !== null);
  /** Receipts with money on them that cannot be split until somebody says who paid. */
  const unpaid = split.filter(
    (entry) => entry.receipt.purchaser_id === null && entry.lines.some((line) => line.pence !== null),
  ).length;
  const showSplit = counted.length > 0 || settlements.length > 0 || unpaid > 0;

  // --- spend ---------------------------------------------------------------

  const byPeriod = spendByPeriod(lines, period).slice(0, 12);
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]));
  const byCategory = spendByCategory(lines);

  // --- repeats -------------------------------------------------------------

  const repeats = repeatBuys(lines);
  const due = probablyDue(repeats, today).filter(
    (entry) => !onList.has(entry.name.toLowerCase().trim()),
  );

  const nothing = !showSplit && byPeriod.length === 0 && repeats.length === 0;

  return (
    <>
      <SiteHeader active="receipts" />
      <Page width="read">
        <PageTitle title="Spend" subtitle={kitchen.name} />

        {nothing && (
          <p className="rounded-[16px] bg-chip p-4 text-sm font-semibold text-muted-foreground">
            Nothing to add up yet. Every number here comes from{" "}
            <Link href="/receipts" className={LINK}>
              receipts
            </Link>
            , so it fills in as they arrive.
          </p>
        )}

        <div className="space-y-3">
          {showSplit && (
            <section className={CARD}>
              <h2 className={LABEL}>Who owes whom</h2>

              {standing.length === 0 ? (
                <p className="mt-3 text-[17px] font-extrabold tracking-[-0.02em]">Everybody is square.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {standing.map(([id, pence]) => (
                    <li key={id} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-sm font-bold">{nameOf(id)}</span>
                      <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                        {pence > 0 ? "is owed " : "owes "}
                        <span className="font-mono font-bold text-foreground tabular-nums">
                          {pounds(Math.abs(pence))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {payments.length > 0 && (
                <>
                  <h3 className={`${LABEL} mt-5`}>To settle up</h3>
                  <ul className="mt-2 space-y-2">
                    {payments.map((payment) => {
                      // A person who has left the kitchen cannot be paid
                      // through it - addSettlement refuses them - so there is
                      // no button to press for one.
                      const payable = names.has(payment.from_user) && names.has(payment.to_user);
                      return (
                        <li
                          key={`${payment.from_user}-${payment.to_user}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-chip px-4 py-2.5"
                        >
                          <span className="text-sm font-bold">
                            {nameOf(payment.from_user)} pays {nameOf(payment.to_user)}{" "}
                            <span className="font-mono tabular-nums">{pounds(payment.pence)}</span>
                          </span>
                          {canEdit && payable && (
                            <MarkPaidButton
                              from={payment.from_user}
                              to={payment.to_user}
                              pence={payment.pence}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <p className={`${NOTE} mt-4`}>
                Lines nobody named sharers for are split between everyone.
                {unpaid > 0 && (
                  <>
                    {" "}
                    {unpaid === 1 ? "One receipt doesn't" : `${unpaid} receipts don't`} say who paid,
                    so {unpaid === 1 ? "it isn't" : "they aren't"} counted yet —{" "}
                    <Link href="/receipts" className={LINK}>
                      fill in who paid
                    </Link>
                    .
                  </>
                )}
              </p>

              {canEdit && household.length > 1 && (
                <details className="group mt-5 border-t border-border pt-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-extrabold sm:min-h-9">
                    Record a payment
                    <span aria-hidden className="ml-1.5 text-muted-foreground group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <div className="mt-3">
                    <PaymentForm
                      people={household.map(({ id, name }) => ({ id, name }))}
                      me={user.id}
                      today={today}
                    />
                  </div>
                </details>
              )}

              {settlements.length > 0 && (
                <>
                  <h3 className={`${LABEL} mt-5`}>Paid back</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {settlements.slice(0, 10).map((payment) => {
                      const said = `${nameOf(payment.from_user)} paid ${nameOf(payment.to_user)} ${pounds(payment.pence)}`;
                      return (
                        <li key={payment.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">{said}</span>
                            <span className={NOTE}>
                              {sayDay(payment.on_date)}
                              {payment.note ? ` · ${payment.note}` : ""}
                            </span>
                          </span>
                          {canEdit && (
                            <ConfirmDelete
                              action={removePayment.bind(null, payment.id)}
                              question={`Delete "${said}"? The balances go back to before it.`}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          )}

          {byPeriod.length > 0 && (
            <section className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={LABEL}>Spend</h2>
                <Segmented
                  label="Spend by"
                  active={period}
                  options={PERIODS.map((p) => ({
                    key: p.key,
                    label: p.label,
                    href: p.key === "month" ? "/spend" : `/spend?period=${p.key}`,
                  }))}
                />
              </div>
              <div className="mt-4">
                <RankedBars
                  unit="pence"
                  rows={byPeriod.map((row) => ({
                    key: row.start,
                    label: periodLabel(row.start, period, Number(today.slice(0, 4))),
                    value: row.pence,
                    display: pounds(row.pence),
                  }))}
                />
              </div>

              {byCategory.length > 0 && (
                <>
                  <h3 className={`${LABEL} mt-6`}>By category, all time</h3>
                  <div className="mt-3">
                    <RankedBars
                      unit="pence"
                      rows={byCategory.map((row) => {
                        const id = categoryIds.get(row.category);
                        return {
                          key: row.category,
                          label: row.category,
                          value: row.pence,
                          display: pounds(row.pence),
                          href: id !== undefined ? `/receipts?category=${id}` : undefined,
                        };
                      })}
                    />
                  </div>
                </>
              )}

              <p className={`${NOTE} mt-4`}>
                Snacks are left out: they are one person&apos;s, and still in the split.
              </p>
            </section>
          )}

          {repeats.length > 0 && (
            <section className={CARD}>
              <h2 className={LABEL}>Bought again and again</h2>
              <ul className="mt-2 divide-y divide-border">
                {repeats.slice(0, 15).map((repeat) => {
                  const cheapest = repeat.shops[0];
                  return (
                    <li key={repeat.name.toLowerCase()}>
                      <Link
                        href={`/receipts?q=${encodeURIComponent(repeat.name)}`}
                        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-chip"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{repeat.name}</span>
                          <span className={`block ${NOTE}`}>
                            {times(repeat.times)}
                            {repeat.every !== null && ` · every ~${repeat.every} days`}
                            {cheapest && ` · cheapest ${pounds(cheapest.each)} at ${cheapest.shop}`}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                          {pounds(repeat.pence)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {due.length > 0 && (
            <section className={CARD}>
              <h2 className={LABEL}>Probably due</h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                Going by how often you buy these, you&apos;ve probably got through them.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {due.map((entry) => (
                  <li key={entry.name} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/receipts?q=${encodeURIComponent(entry.name)}`} className="min-w-0 hover:underline">
                      <span className="block truncate text-sm font-bold">{entry.name}</span>
                      <span className={NOTE}>
                        Usually every {entry.every} days, last bought {entry.since} days ago
                      </span>
                    </Link>
                    {canEdit && <AddToListButton name={entry.name} every={entry.every} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </Page>
    </>
  );
}
