import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { describeStock } from "@/lib/containers";
import { daysUntil } from "@/lib/dates";
import { getRescues } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Expiring soon · Pantry",
};

/** A fortnight, so the list is worth opening rather than a copy of the band. */
const WITHIN_DAYS = 14;

/**
 * Everything with a deadline on it, soonest first.
 *
 * The band on the stock page shows two and a count, and the count used to lead
 * to Tonight filtered to what could be cooked from them - which answers a
 * different question. "What else is about to go off" is a list of things, and
 * it should be a list of things.
 *
 * Each row is the item, because what you do about a deadline is usually to go
 * and look at the jar: eat it, move it, throw it out, or decide the date on the
 * packet was optimistic. The recipe that would use it is one tap further on,
 * from the item itself.
 */
export default async function ExpiringPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fpantry%2Fexpiring");
  if (!context.kitchen) redirect("/kitchens?need=stock");

  const rescues = await getRescues(
    context.kitchen.id,
    context.user.id,
    WITHIN_DAYS,
  );

  return (
    <>
      <SiteHeader active="none" meta={`${rescues.length} with a date`} />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Stock
        </Link>
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Expiring soon
        </h1>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          Anything with a deadline in the next {WITHIN_DAYS} days, soonest
          first.
        </p>

        {rescues.length === 0 ? (
          <p className="rounded-[20px] bg-card p-6 text-sm font-semibold text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            Nothing is expiring soon. Dates only appear on things you have
            given one to, so an empty list here can also mean nobody has
            written any down.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {rescues.map(({ item, recipes }) => {
              // Destructive only once it has actually gone. "Tomorrow" is a
              // plan, not a failure, and colouring it red makes the real ones
              // invisible - the same rule the band on the stock page follows.
              // days_left comes from SQL and sorts this list; it is never the
              // number shown. It truncates toward zero where daysUntil rounds
              // between calendar days, and the two disagreeing is how one item
              // read "2d ago" here and "3d over" on the stats page.
              const left = daysUntil(item.use_by);
              const gone = left < 0;
              const today = left === 0;

              return (
                <li key={item.id}>
                  <Link
                    href={`/pantry/item/${item.id}`}
                    className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-chip"
                  >
                    <span
                      aria-hidden
                      className={`h-9 w-[3px] shrink-0 rounded-full ${
                        gone || today ? "bg-destructive" : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold break-words">{item.name}</p>
                      <p className="text-sm font-semibold text-muted-foreground">
                        {describeStock(item)}
                        {/* What could be done about it, counted rather than
                            listed: the list is on the item's own page. */}
                        {recipes.length > 0 && (
                          <>
                            {" · "}
                            {recipes.length}{" "}
                            {recipes.length === 1 ? "recipe uses" : "recipes use"}{" "}
                            it
                          </>
                        )}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 text-sm font-bold whitespace-nowrap tabular-nums ${
                        gone || today ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {gone
                        ? `${Math.abs(left)}d ago`
                        : today
                          ? "Today"
                          : left === 1
                            ? "1 day"
                            : `${left} days`}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      strokeWidth={2.5}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {rescues.length > 0 && (
          <p className="mt-4 text-sm font-semibold text-muted-foreground">
            Or{" "}
            <Link
              href="/tonight?use=soon"
              className="font-bold text-primary underline underline-offset-2"
            >
              see what you could cook
            </Link>{" "}
            from them.
          </p>
        )}
      </main>
    </>
  );
}
