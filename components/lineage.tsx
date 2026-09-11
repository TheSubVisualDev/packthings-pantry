import Link from "next/link";
import { GitFork } from "lucide-react";
import type { Ancestor, Remix } from "@/lib/social";

/**
 * Where a recipe came from, and what has been made of it.
 *
 * The two directions are not symmetrical, and deliberately so. Looking back is
 * a credit: it names people whether or not their recipe is still public,
 * because taking your copy private should not erase who you got it from.
 * Looking forward is a list of other people's work, so it obeys the visibility
 * rule like everything else - somebody's half-finished variation is not the
 * original author's to show off.
 */
export function Lineage({
  ancestors,
  remixes,
}: {
  ancestors: Ancestor[];
  remixes: Remix[];
}) {
  if (ancestors.length === 0 && remixes.length === 0) return null;

  return (
    <section className="mt-5 rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-label">
        <GitFork className="h-3.5 w-3.5" strokeWidth={2.5} />
        Lineage
      </h2>

      {ancestors.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-muted-foreground">
            {ancestors.length === 1 ? "Adapted from" : "Adapted, through"}
          </p>
          <ol className="mt-1.5 space-y-1">
            {ancestors.map((ancestor) => (
              <li
                key={ancestor.id}
                className="text-sm font-semibold"
                // Each step back is indented, so a long chain reads as a chain
                // rather than as a list of unrelated recipes.
                style={{ paddingLeft: `${(ancestor.depth - 1) * 14}px` }}
              >
                <span className="text-muted-foreground">
                  {ancestor.depth === 1 ? "←" : "↖"}{" "}
                </span>
                <Link
                  href={`/recipes/${ancestor.id}`}
                  className="font-bold hover:underline"
                >
                  {ancestor.name}
                </Link>
                {ancestor.handle && (
                  <span className="text-muted-foreground">
                    {" by "}
                    <Link
                      href={`/people/${ancestor.handle}`}
                      className="font-bold text-foreground hover:underline"
                    >
                      @{ancestor.handle}
                    </Link>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {remixes.length > 0 && (
        <div className={ancestors.length > 0 ? "mt-4 border-t border-border pt-3" : "mt-3"}>
          <p className="text-sm font-semibold text-muted-foreground">
            {remixes.length} {remixes.length === 1 ? "remix" : "remixes"} of this
          </p>
          <ul className="mt-1.5 space-y-1">
            {remixes.map((entry) => (
              <li key={entry.id} className="text-sm font-semibold">
                <span className="text-muted-foreground">→ </span>
                <Link
                  href={`/recipes/${entry.id}`}
                  className="font-bold hover:underline"
                >
                  {entry.name}
                </Link>
                <span className="text-muted-foreground">
                  {entry.yours === 1 ? " — yours" : entry.handle ? ` by @${entry.handle}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
