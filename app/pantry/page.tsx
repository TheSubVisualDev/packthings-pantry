import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SuggestionCard, TopMatchCard } from "@/components/recipe-suggestion";
import { getItems, getRecipesWithMatches } from "@/lib/queries";
import { formatQuantity } from "@/lib/units";
import { LOCATIONS, UNPLACED } from "@/lib/locations";
import type { Item } from "@/lib/types";

// Live stock - never prerender against the database at build time.
export const dynamic = "force-dynamic";

type GroupBy = "category" | "location";

function quantityLabel(item: Item): string {
  const amount = formatQuantity(item.quantity);
  return item.canonical_unit === "count"
    ? amount
    : `${amount}${item.canonical_unit}`;
}

/**
 * Groups stock for display. Category answers "what have I got"; location
 * answers "where does this go" when putting the shopping away, so locations
 * keep their kitchen order rather than sorting alphabetically.
 */
function group(items: Item[], by: GroupBy): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key =
      (by === "location" ? item.location : item.category) ??
      (by === "location" ? UNPLACED : "Uncategorised");
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const entries = [...groups.entries()];
  if (by === "location") {
    const order = [...LOCATIONS, UNPLACED] as readonly string[];
    return entries.sort(
      ([a], [b]) =>
        (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
        (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
    );
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function GroupToggle({ active }: { active: GroupBy }) {
  const options: { key: GroupBy; label: string }[] = [
    { key: "category", label: "Category" },
    { key: "location", label: "Location" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-full bg-[oklch(0.93_0.02_60)] p-1 text-xs font-bold">
      {options.map((option) => (
        <Link
          key={option.key}
          href={`/pantry?by=${option.key}`}
          aria-current={option.key === active ? "true" : undefined}
          className={
            option.key === active
              ? "rounded-full bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "rounded-full px-3 py-1.5 text-muted-foreground"
          }
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  const { by } = await searchParams;
  const groupBy: GroupBy = by === "location" ? "location" : "category";

  const [items, recipes] = await Promise.all([
    getItems(),
    getRecipesWithMatches(),
  ]);

  const groups = group(items, groupBy);
  const [topMatch, ...runnersUp] = recipes;

  return (
    <>
      <SiteHeader
        active="stock"
        meta={`${items.length} items · ${groups.length} ${groupBy === "location" ? "places" : "categories"}`}
      />

      <div className="mx-auto grid w-full max-w-[1280px] sm:grid-cols-[360px_1fr]">
        {/* Cook suggestions: full panel on desktop, top match only on mobile */}
        <aside className="px-5 pt-5 sm:border-r sm:border-border sm:bg-surface-raised sm:px-7 sm:py-7">
          <div className="mb-3 hidden text-xs font-bold uppercase tracking-[0.1em] text-label sm:block">
            Cook with what you have
          </div>
          <div className="mb-1 text-[13px] font-bold text-muted-foreground sm:hidden">
            {items.length} items · cook something?
          </div>

          {topMatch ? (
            <div className="mt-2 space-y-3 sm:mt-0">
              <TopMatchCard recipe={topMatch} />
              {runnersUp.length > 0 && (
                <div className="hidden space-y-3 sm:block">
                  {runnersUp.map((recipe) => (
                    <SuggestionCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recipes yet.</p>
          )}
        </aside>

        <main className="px-5 pt-6 pb-32 sm:px-8 sm:py-7">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing in stock yet. Run{" "}
              <code className="rounded bg-chip px-1 py-0.5">npm run seed</code>{" "}
              to load a starter pantry.
            </p>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                  Grouped by {groupBy}
                </span>
                <GroupToggle active={groupBy} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {groups.map(([name, groupItems]) => (
                  <section
                    key={name}
                    className="sm:rounded-[20px] sm:bg-card sm:p-5 sm:shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  >
                    <h2 className="mb-2.5 text-xs font-bold uppercase tracking-[0.08em] text-label sm:mb-3">
                      {name}
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                      {groupItems.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-[14px] bg-card px-3 py-2.5 text-sm font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:rounded-xl sm:bg-chip sm:px-3 sm:py-2 sm:shadow-none"
                        >
                          {item.name}{" "}
                          <span className="font-bold text-quantity">
                            {quantityLabel(item)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <SiteFooter />
    </>
  );
}
