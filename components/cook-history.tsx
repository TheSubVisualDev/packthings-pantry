import Link from "next/link";
import { shortDate } from "@/lib/dates";
import type { CookedEntry } from "@/lib/queries";

/**
 * When this recipe was actually made, and by whom.
 *
 * The page has always said "cooked 3 times", which is a score rather than a
 * history - it cannot tell you whether that was three times last week or three
 * times in 2024, and those mean opposite things when you are deciding what to
 * have tonight.
 *
 * This kitchen's cooks only. Another household making the same recipe is their
 * business, and mixing the two would make "last cooked" useless.
 */
export function CookHistory({ entries }: { entries: CookedEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-5 rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        When you made it
      </h2>

      <ul className="mt-3 space-y-1.5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold"
          >
            <span>{shortDate(entry.cooked_at)}</span>
            <span className="text-muted-foreground">
              for {entry.servings}
              {entry.cooked_by_name ? ` · ${entry.cooked_by_name}` : ""}
              {/* A cook that left things out is a different cook. Saying so
                  is the point of ticking - otherwise the log claims you used
                  the whole recipe every time. */}
              {entry.skipped.length > 0 && (
                <span title={entry.skipped.join(", ")}>
                  {" "}
                  &middot; without {entry.skipped.length}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/cooked"
        className="mt-3 inline-block text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Everything this kitchen has cooked
      </Link>
    </section>
  );
}
