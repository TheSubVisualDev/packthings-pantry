import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ItemDetail } from "@/components/item-detail";
import { ItemTags } from "@/components/item-tags";
import { SiteHeader } from "@/components/site-header";
import { getLocations } from "@/lib/kitchens";
import { getItem } from "@/lib/queries";
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

  const [item, locations, tags, kitchenTags] = await Promise.all([
    getItem(context.kitchen.id, itemId),
    getLocations(context.kitchen.id),
    getItemTags(itemId),
    getTags(context.kitchen.id),
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
          <ItemDetail item={item} locations={locations} canEdit={canEdit} />

          {/* Its own card, above the edit form: a tag saves the moment you add
              it, so putting it inside a form with a Save button would promise
              something the form doesn't do. */}
          <section className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <ItemTags
              itemId={item.id}
              tags={tags}
              primaryTagId={item.primary_tag_id}
              suggestions={kitchenTags.map((tag) => tag.name)}
              canEdit={canEdit}
            />
          </section>
        </div>
      </main>
    </>
  );
}
