import Link from "next/link";
import type { Rescue } from "@/lib/queries";
import { daysUntil } from "@/lib/dates";
import { ShelfVessel } from "@/components/shelf-vessel";

/**
 * What is expiring soon, as a band rather than a panel - board `1a`/`1b`.
 *
 * This is the one thing no other screen shows: Tonight can only ever surface
 * food something can be *made* from, so an ingredient nothing uses - which is
 * precisely the one about to be thrown away - is invisible everywhere else.
 *
 * Two cards and a count, scrolling sideways. It used to be a five-row panel
 * that filled the top quarter of the page, with every row repeating the same
 * sentence about the cookbook. A deadline is a glance, not a paragraph.
 *
 * A card is the item; the count opens the full list. The count used to lead
 * into Tonight filtered to these, which answers a different question - "what
 * else is expiring" is a list of things and should be a list of things.
 */
export function ExpiringSoon({ rescues }: { rescues: Rescue[] }) {
  if (rescues.length === 0) return null;

  const [first, second, ...rest] = rescues;
  const shown = [first, second].filter(Boolean);

  return (
    <section className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[11px] font-extrabold tracking-[0.09em] uppercase text-label">
          Expiring soon
        </h2>
        <span className="text-[12px] font-bold text-muted-foreground tabular-nums">
          {rescues.length}
        </span>
      </div>

      <div className="stagger flex items-stretch gap-2">
        {shown.map(({ item }) => {
          // Destructive only when it has actually gone. "Tomorrow" is a plan,
          // not a failure, and colouring it red makes the real ones invisible.
          // The SQL's own days_left sorts this list and is never shown: it
          // truncates toward zero where daysUntil rounds between calendar
          // days, and the two disagreeing is why one item read "2d ago" here
          // and "3d over" on the stats page.
          const left = daysUntil(item.use_by);
          const gone = left < 0;
          const today = left === 0;

          return (
            <Link
              key={item.id}
              href={`/pantry/item/${item.id}`}
              className={`min-w-0 flex-1 rounded-[14px] border-l-[3px] bg-card py-2.5 pr-3 pl-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
                gone || today ? "border-l-destructive" : "border-l-primary"
              }`}
            >
              {/* The same drawing as the shelf, so the thing you are being
                  warned about is the thing you will recognise when you go
                  looking for it. Small: this is a deadline, and the vessel is
                  identification rather than the point. */}
              <div className="flex items-center gap-2.5">
                <ShelfVessel item={item} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-extrabold tracking-[-0.01em]">
                    {item.name}
                  </div>
                  <div
                    className={`mt-0.5 text-[12px] font-bold ${
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
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {rest.length > 0 && (
          <Link
            href="/pantry/expiring"
            className="flex w-14 shrink-0 flex-col items-center justify-center rounded-[14px] bg-chip text-[13px] font-extrabold text-muted-foreground"
          >
            +{rest.length}
          </Link>
        )}
      </div>
    </section>
  );
}
