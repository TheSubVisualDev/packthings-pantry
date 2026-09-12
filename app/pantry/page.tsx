import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Segmented } from "@/components/ui/segmented";
import { EstimateButton } from "@/components/estimate-button";
import { StockList } from "@/components/stock-list";
import { TonightStrip } from "@/components/tonight-strip";
import { GoingOff } from "@/components/going-off";
import { EmptyShelves } from "@/components/empty-shelves";
import { getItems, getTonightFacts } from "@/lib/queries";
import { rankTonight } from "@/lib/tonight";
import { getTrip } from "@/lib/trip";
import { TripStrip } from "@/components/trip-strip";
import { UNPLACED } from "@/lib/locations";
import { getLocations } from "@/lib/kitchens";
import { macroGroup } from "@/lib/nutrition";
import { getTags } from "@/lib/tags";
import { getRescues } from "@/lib/queries";
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
        { key: "location", label: "Place", href: "/pantry?by=location" },
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

  const [items, facts, places, rescues, tags, trip] = await Promise.all([
    getItems(kitchen.id),
    getTonightFacts(kitchen.id, context.user.id),
    getLocations(kitchen.id),
    getRescues(kitchen.id, context.user.id),
    getTags(kitchen.id),
    getTrip(kitchen.id),
  ]);

  /**
   * The winner only. The stock page shows one row of suggestion (board 1b)
   * and the rest of the ranking lives on /tonight, which is a whole screen
   * for the question rather than a panel above the answer to a different one.
   */
  const [best] = rankTonight(facts);

  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));

  const groups = group(items, groupBy, places, tagNames);

  return (
    <>
      <SiteHeader
        active="stock"
        meta={`${items.length} items · ${tags.length} ${tags.length === 1 ? "tag" : "tags"}`}
      />

      {/* Board 1b, Luna's pick. The six stacked controls are gone: the
          suggestion is one row, what is going off is a band, and the group-by
          sits on the same line as Select. Everything below is the stock,
          which is what the screen is called. */}
      <main className="mx-auto w-full max-w-[900px] px-5 pt-4 pb-32 sm:px-8 sm:pt-6">
        {/*
          One row, and the trip wins it.

          A suggestion and a trip are answers to the same question - what is
          happening about dinner - and only one of them is true at a time.
          Once you are shopping for something, another idea on top of it is
          the app talking over you.
        */}
        {trip ? (
          <div className="mb-3 print:hidden">
            <TripStrip trip={trip} />
          </div>
        ) : (
          best && (
            <div className="mb-3 print:hidden">
              <TonightStrip suggestion={best} />
            </div>
          )
        )}

        <div className="print:hidden">
          <GoingOff rescues={rescues} />
        </div>

        {/* A stocktake is a printed list you carry to the cupboard and mark
            up, so the heading it needs on paper is the one the screen gets
            from the tab bar. */}
        <div className="mb-3 hidden items-baseline justify-between print:flex">
          <h1 className="text-[20px] font-extrabold tracking-[-0.02em]">
            {kitchen.name} — {items.length} items
          </h1>
          <span className="font-mono text-xs">{new Date().toLocaleDateString("en-GB")}</span>
        </div>

        {items.length === 0 ? (
          <EmptyShelves />
        ) : (
          <>
            <StockList
              groups={groups}
              places={places}
              tags={tags}
              canEdit={kitchen.role !== "viewer"}
              groupControl={<GroupToggle active={groupBy} />}
            />

            {/* Housekeeping, so it sits under the list rather than above it.
                New items are estimated as they arrive, which makes this the
                backlog and nothing anybody needs before they can read a
                shelf. */}
            <div className="mt-4">
              <EstimateButton
                missing={
                  items.filter(
                    (item) => item.kcal_100 === null && item.protein_100 === null,
                  ).length
                }
              />
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
