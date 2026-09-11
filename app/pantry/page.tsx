import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StockList } from "@/components/stock-list";
import { SuggestionCard, TopMatchCard } from "@/components/recipe-suggestion";
import { getItems, getRecipesWithMatches } from "@/lib/queries";
import { UNPLACED } from "@/lib/locations";
import { getLocations } from "@/lib/kitchens";
import { getTags } from "@/lib/tags";
import { getExpiring } from "@/lib/queries";
import { getList } from "@/lib/shopping";
import { currentKitchen } from "@/lib/session";
import type { Item } from "@/lib/types";

// Live stock - never prerender against the database at build time.
export const dynamic = "force-dynamic";

type GroupBy = "tag" | "location";



/**
 * Groups stock for display. The tag it is filed under answers "what have I
 * got"; location answers "where does this go" when putting the shopping away,
 * so locations keep their kitchen order rather than sorting alphabetically.
 *
 * Only the primary tag groups. An item carrying three tags would otherwise
 * appear in three places, and a list where the same jar is in three places is
 * a list you have to read twice to count anything.
 */
function group(
  items: Item[],
  by: GroupBy,
  placeOrder: readonly string[],
  tagNames: Map<number, string>,
): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const filedUnder =
      item.primary_tag_id === null ? null : tagNames.get(item.primary_tag_id) ?? null;
    const key =
      (by === "location" ? item.location : filedUnder) ??
      (by === "location" ? UNPLACED : "Untagged");
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const entries = [...groups.entries()];
  if (by === "location") {
    const order = [...placeOrder, UNPLACED];
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
    { key: "tag", label: "Tag" },
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
  const groupBy: GroupBy = by === "location" ? "location" : "tag";

  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const [items, recipes, places, expiring, list, tags] = await Promise.all([
    getItems(kitchen.id),
    getRecipesWithMatches(kitchen.id, context.user.id),
    getLocations(kitchen.id),
    getExpiring(kitchen.id),
    getList(kitchen.id),
    getTags(kitchen.id),
  ]);

  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));

  const toBuy = list.filter((line) => !line.bought_at).length;

  const groups = group(items, groupBy, places, tagNames);
  const [topMatch, ...runnersUp] = recipes;

  return (
    <>
      <SiteHeader
        active="stock"
        meta={`${items.length} items · ${groups.length} ${groupBy === "location" ? "places" : "tags"}`}
      />

      <div className="mx-auto grid w-full max-w-[1280px] sm:grid-cols-[360px_1fr]">
        {/* Cook suggestions: full panel on desktop, top match only on mobile */}
        <aside className="px-5 pt-5 sm:border-r sm:border-border sm:bg-surface-raised sm:px-7 sm:py-7">
          {expiring.length > 0 && (
            <section className="mb-5 rounded-[20px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                Use these up
              </h2>
              <ul className="mt-2.5 space-y-1.5">
                {expiring.slice(0, 6).map((item) => (
                  <li key={item.id}>
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
            </section>
          )}

          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="hidden text-xs font-bold uppercase tracking-[0.1em] text-label sm:block">
              Cook with what you have
            </span>
            <Link
              href="/pantry/list"
              className="ml-auto rounded-full bg-chip px-3 py-1.5 text-xs font-bold hover:bg-border"
            >
              Shopping{toBuy > 0 ? ` · ${toBuy}` : ""}
            </Link>
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

              <StockList
                groups={groups}
                places={places}
                tags={tags}
                canEdit={kitchen.role !== "viewer"}
              />
            </>
          )}
        </main>
      </div>

      <SiteFooter />
    </>
  );
}
