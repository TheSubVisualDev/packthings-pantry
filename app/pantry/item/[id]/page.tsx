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
import { getItemTags, getTags } from "@/lib/tags";
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

  const [item, locations, tags, kitchenTags, shops, kitchenShops] = await Promise.all([
    getItem(context.kitchen.id, itemId),
    getLocations(context.kitchen.id),
    getItemTags(itemId),
    getTags(context.kitchen.id),
    getItemShops(itemId),
    getShops(context.kitchen.id),
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
