import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Segmented } from "@/components/ui/segmented";
import { UseItUp } from "@/components/use-it-up";
import { EstimateButton } from "@/components/estimate-button";
import { StockList } from "@/components/stock-list";
import { NearlyCard, TonightCard } from "@/components/tonight-card";
import { getItems, getTonightFacts } from "@/lib/queries";
import { nearlyThere, rankTonight } from "@/lib/tonight";
import { UNPLACED } from "@/lib/locations";
import { getLocations } from "@/lib/kitchens";
import { macroGroup } from "@/lib/nutrition";
import { getTags } from "@/lib/tags";
import { getRescues } from "@/lib/queries";
import { getList } from "@/lib/shopping";
import { currentKitchen } from "@/lib/session";
import type { Item } from "@/lib/types";

// Live stock - never prerender against the database at build time.
export const dynamic = "force-dynamic";

type GroupBy = "tag" | "location" | "nutrition";



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

    /**
     * Nutrition groups by which macro the food mostly IS, by energy rather
     * than by weight - otherwise almost everything reads as carbs, since fat
     * is light and carries more than twice the energy per gram. Butter would
     * sit under carbs on weight alone, which helps nobody.
     */
    const key =
      by === "location"
        ? item.location ?? UNPLACED
        : by === "nutrition"
          ? macroGroup(item)
          : filedUnder ?? "Untagged";
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
  if (by === "nutrition") {
    // A bucket meaning "we have no figures" is not a kind of food, so it goes
    // last instead of sorting under N.
    return entries.sort(([a], [b]) =>
      a === "Not known" ? 1 : b === "Not known" ? -1 : a.localeCompare(b),
    );
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function GroupToggle({ active }: { active: GroupBy }) {
  return (
    <Segmented
      label="Group stock by"
      active={active}
      options={[
        { key: "tag", label: "Tag", href: "/pantry?by=tag" },
        { key: "nutrition", label: "Nutrition", href: "/pantry?by=nutrition" },
        { key: "location", label: "Location", href: "/pantry?by=location" },
      ]}
    />
  );
}

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  const { by } = await searchParams;
  const groupBy: GroupBy =
    by === "location" ? "location" : by === "nutrition" ? "nutrition" : "tag";

  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  // Stock lives in a kitchen, so there's nothing to show without one.
  if (!context.kitchen) redirect("/kitchens?need=stock");
  const { kitchen } = context;

  const [items, facts, places, rescues, list, tags] = await Promise.all([
    getItems(kitchen.id),
    getTonightFacts(kitchen.id, context.user.id),
    getLocations(kitchen.id),
    getRescues(kitchen.id, context.user.id),
    getList(kitchen.id),
    getTags(kitchen.id),
  ]);

  /**
   * One answer, not three.
   *
   * This panel used to hold the rescues list, a top match and a column of
   * runners-up - three separate opinions about what to cook, none of them
   * ranked against the others and none of them saying why. They are one
   * ranking now, and the rest of it lives behind /tonight.
   */
  const ranked = rankTonight(facts);
  const [best] = ranked;
  const nearly = best ? nearlyThere(facts, [best.id]) : null;

  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));

  const toBuy = list.filter((line) => !line.bought_at).length;

  const groups = group(items, groupBy, places, tagNames);

  return (
    <>
      <SiteHeader
        active="stock"
        meta={`${items.length} items · ${groups.length} ${
          groupBy === "location" ? "places" : groupBy === "nutrition" ? "kinds" : "tags"
        }`}
      />

      <div className="mx-auto grid w-full max-w-[1280px] sm:grid-cols-[360px_1fr]">
        {/* Cook suggestions: full panel on desktop, top match only on mobile */}
        <aside className="px-5 pt-5 sm:border-r sm:border-border sm:bg-surface-raised sm:px-7 sm:py-7">
          <UseItUp rescues={rescues} />

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

          {best ? (
            <div className="mt-2 space-y-3 sm:mt-0">
              <TonightCard suggestion={best} servings={2} />
              {nearly && (
                <div className="hidden sm:block">
                  <NearlyCard suggestion={nearly} servings={2} />
                </div>
              )}
              {ranked.length > 1 && (
                <Link
                  href="/tonight"
                  className="block rounded-[14px] bg-chip px-4 py-3 text-center text-sm font-bold hover:bg-border"
                >
                  Other ideas ({ranked.length - 1})
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing in your cookbook yet.{" "}
              <Link href="/recipes" className="font-bold text-primary underline underline-offset-2">
                Add a recipe
              </Link>{" "}
              and this becomes a suggestion.
            </p>
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

              {/* Shown only when there is something to do, and not hidden
                  behind a grouping: new items are estimated as they are
                  added, so this is the backlog and nothing else. */}
              <EstimateButton
                missing={
                  items.filter(
                    (item) => item.kcal_100 === null && item.protein_100 === null,
                  ).length
                }
              />

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
