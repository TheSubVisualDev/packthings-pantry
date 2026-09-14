import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Segmented } from "@/components/ui/segmented";
import { EstimateButton } from "@/components/estimate-button";
import { StockList } from "@/components/stock-list";
import { ExpiringSoon } from "@/components/expiring-soon";
import { EmptyShelves } from "@/components/empty-shelves";
import { getItems } from "@/lib/queries";
import { getTrip } from "@/lib/trip";
import { TripStrip } from "@/components/trip-strip";
import { UNPLACED } from "@/lib/locations";
import { inStock } from "@/lib/containers";
import { getLocations } from "@/lib/kitchens";
import { macroGroup } from "@/lib/nutrition";
import { getTags } from "@/lib/tags";
import { getRescues } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";
import { hasBeenWelcomed } from "@/lib/users";
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
  /**
   * The screen a brand new account lands on, so it is where the tour starts.
   *
   * Only when they have never been shown round. Somebody who skipped it, or
   * who deliberately left their only kitchen, gets the kitchens page - being
   * sent back to an onboarding you already dismissed is the loop that makes
   * people close an app.
   */
  if (!context.kitchen) {
    redirect(
      (await hasBeenWelcomed(context.user.id))
        ? "/kitchens?need=stock"
        : "/welcome",
    );
  }
  const { kitchen } = context;

  const [items, places, rescues, tags, trip] = await Promise.all([
    getItems(kitchen.id),
    getLocations(kitchen.id),
    getRescues(kitchen.id, context.user.id),
    getTags(kitchen.id),
    getTrip(kitchen.id),
  ]);

  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));

  /**
   * What has run out, kept off the shelf.
   *
   * A row reading "Tiger Bloomer 0g" is a shelf claiming to hold nothing,
   * which is how it was reported - it looks like a bug even when it is not.
   *
   * Two exceptions, and they are the point. Something you have said to keep in
   * stock STAYS on the list when it hits zero, marked, because that is the one
   * case where its absence is the news. And everything else goes into a count
   * at the bottom rather than into the void: an item that vanishes the moment
   * you finish it is one you cannot find again to say you have bought more.
   *
   * inStock, not `quantity > 0`. quantity is the OPEN container, and testing
   * it directly is the bug AGENTS.md keeps a count of - this would have been
   * the sixth, hiding anything whose open jar was empty with three sealed ones
   * behind it.
   */
  const onShelf = items.filter(
    (item) => inStock(item) || item.restock_target !== null,
  );
  const runOut = items.filter(
    (item) => !inStock(item) && item.restock_target === null,
  );

  const groups = group(onShelf, groupBy, places, tagNames);

  return (
    <>
      <SiteHeader
        active="stock"
        meta={`${onShelf.length} items · ${tags.length} ${tags.length === 1 ? "tag" : "tags"}`}
      />

      {/* Board 1b, Luna's pick, revised again for phase 6: the Tonight
          suggestion moved out entirely - /tonight is the front door now, so
          repeating its answer here is the app talking over itself. A trip in
          progress still gets a row, because "what am I shopping for" is a
          fact about the stock page in a way a raw suggestion is not. */}
      <main className="mx-auto w-full max-w-[900px] px-5 pt-4 pb-32 sm:px-8 sm:pt-6">
        {trip && (
          <div className="mb-3 print:hidden">
            <TripStrip trip={trip} />
          </div>
        )}

        <div className="print:hidden">
          <ExpiringSoon rescues={rescues} />
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
              runOut={runOut}
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
