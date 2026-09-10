import { getItems } from "@/lib/queries";
import { formatQuantity } from "@/lib/units";
import type { Item } from "@/lib/types";

// The pantry reflects live stock, so never prerender it at build time.
export const dynamic = "force-dynamic";

function quantityLabel(item: Item): string {
  const amount = formatQuantity(item.quantity);
  return item.canonical_unit === "count"
    ? amount
    : `${amount}${item.canonical_unit}`;
}

function groupByCategory(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.category ?? "Uncategorised";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default async function PantryPage() {
  const items = await getItems();
  const groups = groupByCategory(items);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pantry</h1>
        <span className="shrink-0 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in stock yet. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5">npm run seed</code> to
          load a starter pantry.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map(([category, categoryItems]) => (
            <section key={category} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <ul className="divide-y rounded-lg border">
                {categoryItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <span className="min-w-0 break-words font-medium">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {quantityLabel(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
