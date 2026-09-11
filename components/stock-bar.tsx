import { describeStock, openFraction, packOf } from "@/lib/containers";
import { formatQuantity } from "@/lib/units";
import type { Item } from "@/lib/types";

/** Beyond this many pips you are counting dots, not reading a shelf. */
const MAX_PIPS = 8;

/**
 * What is on the shelf, drawn the way it sits there.
 *
 * A pip per unopened container, then a bar for the open one whose maximum is
 * that container's capacity - so it reads "about two thirds of a bottle" and
 * does not move when you come back from the shop. A bar scaled to the total
 * would: buy three more and the same 320ml suddenly looks like nothing.
 *
 * Items with no pack size have no containers to draw, so they get the number
 * and nothing else rather than a bar with an invented maximum.
 */
export function StockBar({ item }: { item: Item }) {
  const pack = packOf(item);
  const fraction = openFraction(item);
  const label = describeStock(item);

  if (item.unspecified) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-chip px-3 py-1 text-sm font-bold text-muted-foreground">
          some
        </span>
        <span className="text-sm font-semibold text-muted-foreground">
          amount not tracked
        </span>
      </div>
    );
  }

  if (!pack || fraction === null) {
    return <span className="text-sm font-bold text-quantity">{label}</span>;
  }

  const pips = Math.min(item.sealed_count, MAX_PIPS);
  const overflow = item.sealed_count - pips;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: pips }, (_, index) => (
          <span
            key={index}
            className="h-5 w-3 rounded-[3px] bg-primary"
            aria-hidden
          />
        ))}
        {overflow > 0 && (
          <span className="ml-0.5 text-xs font-bold text-muted-foreground tabular-nums">
            +{overflow}
          </span>
        )}

        {/* The open one. Always drawn, even at empty, so the row does not
            change shape as it drains. */}
        <span className="ml-1 h-5 w-14 overflow-hidden rounded-[3px] bg-chip">
          <span
            className="block h-full bg-primary/55"
            style={{ width: `${Math.round(fraction * 100)}%` }}
            aria-hidden
          />
        </span>
      </div>

      <span className="text-sm font-bold text-quantity">{label}</span>
      <span className="sr-only">
        {item.sealed_count} sealed, {formatQuantity(item.quantity)} of{" "}
        {formatQuantity(pack.size)} in the open one
      </span>
    </div>
  );
}
