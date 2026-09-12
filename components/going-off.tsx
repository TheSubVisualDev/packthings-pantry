import Link from "next/link";
import type { Rescue } from "@/lib/queries";

/**
 * What is about to go off, as a band rather than a panel - board `1a`/`1b`.
 *
 * This is the one thing no other screen shows: Tonight can only ever surface
 * food something can be *made* from, so an ingredient nothing uses - which is
 * precisely the one about to be thrown away - is invisible everywhere else.
 *
 * Two cards and a count, scrolling sideways. It used to be a five-row panel
 * that filled the top quarter of the page, with every row repeating the same
 * sentence about the cookbook. A deadline is a glance, not a paragraph.
 *
 * The whole band is a link into Tonight filtered to these, so a dying item is
 * one tap from a plan rather than one tap from a list of dates.
 */
export function GoingOff({ rescues }: { rescues: Rescue[] }) {
  if (rescues.length === 0) return null;

  const [first, second, ...rest] = rescues;
  const shown = [first, second].filter(Boolean);

  return (
    <section className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[11px] font-extrabold tracking-[0.09em] uppercase text-label">
          Going off
        </h2>
        <span className="text-[12px] font-bold text-muted-foreground tabular-nums">
          {rescues.length}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        {shown.map(({ item }) => {
          // Destructive only when it has actually gone. "Tomorrow" is a plan,
          // not a failure, and colouring it red makes the real ones invisible.
          const gone = item.days_left < 0;
          const today = item.days_left === 0;

          return (
            <Link
              key={item.id}
              href={`/pantry/item/${item.id}`}
              className={`min-w-0 flex-1 rounded-[14px] border-l-[3px] bg-card py-2.5 pr-3 pl-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
                gone || today ? "border-l-destructive" : "border-l-primary"
              }`}
            >
              <div className="truncate text-[13px] font-extrabold tracking-[-0.01em]">
                {item.name}
              </div>
              <div
                className={`mt-0.5 text-[12px] font-bold ${
                  gone || today ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {gone
                  ? `${Math.abs(item.days_left)}d ago`
                  : today
                    ? "Today"
                    : item.days_left === 1
                      ? "1 day"
                      : `${item.days_left} days`}
              </div>
            </Link>
          );
        })}

        {rest.length > 0 && (
          <Link
            href="/tonight?use=soon"
            className="flex w-14 shrink-0 flex-col items-center justify-center rounded-[14px] bg-chip text-[13px] font-extrabold text-muted-foreground"
          >
            +{rest.length}
          </Link>
        )}
      </div>
    </section>
  );
}
