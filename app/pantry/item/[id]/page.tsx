import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ItemDetail } from "@/components/item-detail";
import { Packaging } from "@/components/packaging";
import { NutritionPanel } from "@/components/nutrition-panel";
import { NutritionEditor } from "@/components/nutrition-editor";
import { ItemShops } from "@/components/item-shops";
import { ItemTags } from "@/components/item-tags";
import { SiteHeader } from "@/components/site-header";
import { getLocations } from "@/lib/kitchens";
import { getItem } from "@/lib/queries";
import { hasMacros } from "@/lib/nutrition";
import { getItemShops, getShops } from "@/lib/shops";
import { getPrices, getProductsForItem, per100 } from "@/lib/products";
import { ProductPicker } from "@/components/product-picker";
import { getItemTags, getTags } from "@/lib/tags";
import { shortDate } from "@/lib/dates";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Item · Pantry",
};

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");
  if (!context.kitchen) redirect("/kitchens?need=stock");

  const itemId = Number((await params).id);
  if (!Number.isInteger(itemId)) notFound();

  const [item, locations, tags, kitchenTags, shops, kitchenShops, products, prices] =
    await Promise.all([
      getItem(context.kitchen.id, itemId),
      getLocations(context.kitchen.id),
      getItemTags(itemId),
      getTags(context.kitchen.id),
      getItemShops(itemId),
      getShops(context.kitchen.id),
      getProductsForItem(context.kitchen.id, itemId, context.user.id),
      getPrices(context.kitchen.id, itemId),
    ]);

  // getItem scopes by kitchen, so an id from somebody else's shelves is
  // indistinguishable from one that doesn't exist.
  if (!item) notFound();

  const canEdit = context.kitchen.role !== "viewer";

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[560px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/pantry"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← Stock
        </Link>

        <div className="mt-3 space-y-3">
          {/*
            The order is the answer to why you opened this page.

            What is going off, then how much is left, then the fields. The
            shelf panel used to sit below the edit form, so the page opened on
            a name field and a date picker and you scrolled past both to find
            out how much soy sauce there was.

            Tags keep their own card, below, because a tag saves the moment you
            add it and putting it inside a form with a Save button would
            promise something the form does not do.
          */}
          <ItemDetail
            item={item}
            locations={locations}
            canEdit={canEdit}
            shelf={
              <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <Packaging item={item} canEdit={canEdit} />
              </section>
            }
          />

          <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <ItemTags
              itemId={item.id}
              tags={tags}
              primaryTagId={item.primary_tag_id}
              suggestions={kitchenTags.map((tag) => tag.name)}
              canEdit={canEdit}
            />
          </section>

          {/* Which actual tin, above where you buy it: "which one is good" and
              "where do I get it" are the same errand, and the pantry has known
              the answer to the first one since phase 3 without ever saying it. */}
          {products.length > 0 && (
            <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <ProductPicker products={products} canEdit={canEdit} />
            </section>
          )}

          {/*
            What you have paid, read off receipts.

            A series rather than a current price, because "£1.35, £1.35, £1.89"
            is the sentence somebody actually wants, and per-100 underneath
            because it is the only way two pack sizes can be compared. Both are
            only here once a receipt has said so - there is no field anywhere
            asking anybody to type a price in.
          */}
          {prices.length > 0 && (
            <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                What you paid
              </h2>
              <p className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">
                £{(prices[0].pence / 100).toFixed(2)}
                {(() => {
                  const each = per100(prices[0].pence, item.pack_size, item.canonical_unit);
                  return each === null ? null : (
                    <span className="ml-2 text-sm font-semibold text-muted-foreground">
                      £{(each / 100).toFixed(2)} per 100{item.canonical_unit}
                    </span>
                  );
                })()}
              </p>
              {prices.length > 1 && (
                <p className="mt-1 font-mono text-xs font-semibold text-muted-foreground">
                  before that:{" "}
                  {prices
                    .slice(1)
                    .map((paid) => `£${(paid.pence / 100).toFixed(2)}`)
                    .join(" · ")}
                </p>
              )}
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                From your receipts. {shortDate(prices[0].seen_at)}
                {prices[0].raw ? ` — ${prices[0].raw}` : ""}
              </p>
            </section>
          )}

          <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <ItemShops
              itemId={item.id}
              shops={shops}
              preferredShopId={item.preferred_shop_id}
              suggestions={kitchenShops.map((shop) => shop.name)}
              canEdit={canEdit}
            />
          </section>

          {/* Most spices have no figures in the catalogue, and an empty panel
              is worse than no panel. */}
          {/* Always here, even with nothing in it: "this item has no figures
              and here is how to give it some" is the answer to a question
              people were otherwise left asking. */}
          <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {hasMacros(item) ? (
              <NutritionPanel item={item} />
            ) : (
              <>
                <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                  Per {item.canonical_unit === "ml" ? "100ml" : "100g"}
                </h2>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  Nothing known. Scanning its barcode fills this in; so does the
                  name, if it is something ordinary.
                </p>
              </>
            )}
            {canEdit && <NutritionEditor item={item} />}
          </section>
        </div>
      </main>
    </>
  );
}
