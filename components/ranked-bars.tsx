import Link from "next/link";

/**
 * A ranked list of magnitudes, drawn as bars.
 *
 * One series, so one hue: the job here is "compare magnitude, low to high",
 * which is a sequential question and not an identity one. Giving each recipe
 * its own colour would be inventing eight hues to say something the length
 * already says, and it would break the rule about the palette being fixed.
 *
 * Bars rather than a pie or a donut: they share a baseline, they carry long
 * names without a legend, and a phone can hold ten of them. The value sits at
 * the end of each bar rather than on an axis, because there are ten numbers
 * and no reason to make anybody measure them against a ruler.
 *
 * Every row is a link. A statistic you cannot click is one you cannot check.
 */
export interface RankedRow {
  key: string;
  label: string;
  value: number;
  href: string;
  /** A quiet second line - a date, usually. */
  meta?: string;
}

export function RankedBars({ rows, unit }: { rows: RankedRow[]; unit: string }) {
  if (rows.length === 0) return null;

  // Scaled against the biggest, not against the total: this is a ranking, not
  // a part-to-whole, and the question is "how does this compare to the top one".
  const most = Math.max(...rows.map((row) => row.value));

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const share = most === 0 ? 0 : (row.value / most) * 100;
        return (
          <li key={row.key}>
            <Link
              href={row.href}
              className="block rounded-[10px] py-1 transition-colors hover:bg-chip"
              title={`${row.label}: ${row.value} ${unit}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {row.label}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                  {row.value}
                </span>
              </div>

              {/* A thin mark with a rounded end, sitting on its own track so
                  an empty bar still reads as a row rather than as nothing. */}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-chip">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(share, 2)}%` }}
                />
              </div>

              {row.meta && (
                <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                  {row.meta}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
