import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShopFilter } from "@/components/shop-filter";
import { RestockPanel } from "@/components/restock-panel";
import { ShoppingList } from "@/components/shopping-list";
import { SiteHeader } from "@/components/site-header";
import { currentKitchen } from "@/lib/session";
import { getList, getRestockSuggestions } from "@/lib/shopping";
import { getItemProfiles } from "@/lib/queries";
import { getShops } from "@/lib/shops";
import { getTrip } from "@/lib/trip";
import { TripStrip } from "@/components/trip-strip";
import { PrintButton } from "@/components/print-button";
import { suggestionsForShop } from "./restock-filter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping · Pantry",
};

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fpantry%2Flist");

  const { shop } = await searchParams;
  const filter = shop?.trim() || null;

  /**
   * A list without a kitchen, which is most of this page switched off.
   *
   * Everything else here compares the list to shelves - what is running low,
   * which shop usually has it, what tonight's trip is for - and there are no
   * shelves. So it is the list and nothing else, which is exactly what was
   * asked for: somewhere to write down what to buy without first setting up a
   * kitchen to not track anything in.
   */
  const kitchen = context.kitchen;

  const [lines, restock, profiles, shops, trip] = kitchen
    ? await Promise.all([
        getList({ kitchen: kitchen.id }, filter),
        getRestockSuggestions(kitchen.id),
        getItemProfiles(kitchen.id),
        getShops(kitchen.id),
        getTrip(kitchen.id),
      ])
    : [await getList({ owner: context.user.id }, null), [], [], [], null];
  const todo = lines.filter((line) => !line.bought_at).length;
  // Running Low never got the shop filter getRestockSuggestions doesn't take
  // one, so it's narrowed here instead - see restock-filter.ts.
  const restockInShop = suggestionsForShop(restock, filter);

  return (
    <>
      {/* "to buy" read as the same count Running Low was offering to add,
          when it only ever counted what's already on the list. */}
      <SiteHeader active="none" meta={`${todo} on the list`} />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href={kitchen ? "/pantry" : "/recipes"}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground print:hidden"
        >
          {kitchen ? "← Stock" : "← Recipes"}
        </Link>
        <div className="mt-2 mb-1 flex items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Shopping</h1>
          <PrintButton label="On paper" />
        </div>
        <p className="mb-6 text-sm font-semibold text-muted-foreground">
          {!kitchen
            ? "Yours alone. Make a kitchen and it can tell you what you are running low on."
            : filter
              ? `What ${filter} has, plus anything you can get anywhere.`
              : `Shared with everyone in ${kitchen.name}.`}
        </p>

        {/* What the trip is for, at the top of the list that is for it. */}
        {trip && (
          <div className="mb-4">
            <TripStrip trip={trip} />
          </div>
        )}

        {kitchen && <ShopFilter shops={shops} active={filter} />}
        {/*
          The list first, then the way to add to it, then the aid for
          composing that add - fixed in this order whether or not the list
          is empty. Reordering itself under you (Running Low first once
          there's nothing to show it against) would cost more than the
          scroll it saves.
        */}
        <ShoppingList lines={lines} filter={filter} profiles={profiles} />
        {kitchen && <RestockPanel suggestions={restockInShop} filter={filter} />}

        {!kitchen && (
          <p className="mt-6 rounded-[16px] bg-chip p-4 text-sm font-semibold text-muted-foreground print:hidden">
            This list is just a list.{" "}
            <Link
              href="/kitchens"
              className="font-bold text-primary underline underline-offset-2"
            >
              Make a kitchen
            </Link>{" "}
            and it starts knowing what you already have, what is running out,
            and which shop you get things from.
          </p>
        )}
      </main>
    </>
  );
}
