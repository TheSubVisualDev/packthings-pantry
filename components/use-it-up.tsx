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
 */
export function UseItUp({ rescues }: { rescues: Rescue[] }) {
  if (rescues.length === 0) return null;

  return (
    <section className="mb-5 rounded-[20px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        Use these up
      </h2>

      <ul className="mt-2.5 space-y-3">
        {rescues.slice(0, 5).map(({ item, recipes }) => (
          <li key={item.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
            <Link
              href={`/pantry/item/${item.id}`}
              className="flex items-baseline justify-between gap-3 text-sm font-semibold hover:underline"
            >
              <span className="min-w-0 break-words">
                {item.name}
                {item.because_opened === 1 && (
                  <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                    open
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 text-xs font-bold ${
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

            {recipes.length === 0 && (
              <p className="mt-1 text-[13px] font-semibold text-muted-foreground/70">
                Nothing in your cookbook uses this yet.
              </p>
            )}

          </li>
        ))}
      </ul>
    </section>
  );
}
