import Link from "next/link";
import { shortDate } from "@/lib/dates";
import type { Rescue } from "@/lib/queries";

/**
 * What is about to go off.
 *
 * This used to carry two recipe suggestions per item as well, which was the
 * right instinct in the wrong place: Tonight now ranks the whole cookbook with
 * a deadline as its heaviest signal, so the same recipe was being proposed
 * twice on one screen by two rankings that could disagree. The deadlines are
 * the part Tonight cannot show, so the deadlines are what stayed.
 *
 * Items nothing can be made from stay on the list rather than being filtered
 * out. They are the ones actually about to be thrown away, which makes them
 * the most worth seeing - and they are exactly what a suggestion panel is
 * structurally incapable of surfacing.
 *
 * It does NOT say so per item any more. Four things going off, each followed
 * by its own line of "nothing in your cookbook uses this yet", was four
 * repetitions of one fact taking up the top quarter of the stock page - and
 * the fact is about the cookbook rather than about the tomatoes. Said once,
 * underneath, and only when it applies to everything on the list.
 */
export function UseItUp({ rescues }: { rescues: Rescue[] }) {
  if (rescues.length === 0) return null;

  return (
    <section className="mb-5 rounded-[20px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        Use these up
      </h2>

      <ul className="mt-2 overflow-hidden rounded-[12px] bg-surface">
        {rescues.slice(0, 5).map(({ item }) => (
          <li key={item.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/pantry/item/${item.id}`}
              className="flex min-h-11 items-baseline justify-between gap-3 px-3 py-2 text-sm font-semibold hover:bg-chip"
            >
              <span className="min-w-0 flex-1 truncate">
                {item.name}
                {item.because_opened === 1 && (
                  <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                    open
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 text-xs font-bold tabular-nums ${
                  item.days_left < 0 ? "text-destructive" : "text-muted-foreground"
                }`}
                title={item.use_by ? shortDate(item.use_by) : undefined}
              >
                {item.days_left < 0
                  ? `${Math.abs(item.days_left)}d ago`
                  : item.days_left === 0
                    ? "today"
                    : `${item.days_left}d`}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Once, and only when it is true of all of them. */}
      {rescues.slice(0, 5).every(({ recipes }) => recipes.length === 0) && (
        <p className="mt-2 text-xs font-semibold text-muted-foreground/70">
          Nothing in your cookbook uses these yet.
        </p>
      )}

    </section>
  );
}
