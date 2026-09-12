import { FilterChips } from "@/components/ui/filter-chips";
import type { ShopInUse } from "@/lib/shops";

/**
 * Narrows the shopping list to one shop.
 *
 * Links rather than buttons, so a filtered list is a URL you can keep open on
 * your phone while you walk round - and so the back button does what a back
 * button should.
 *
 * What it does NOT do is hide things with no shop set. Those survive every
 * filter, because "kitchen roll" can be got here as much as anywhere and the
 * point of the filter is to leave with everything, not to leave with less.
 */
export function ShopFilter({
  shops,
  active,
}: {
  shops: ShopInUse[];
  /** The shop currently filtered to, or null for everything. */
  active: string | null;
}) {
  if (shops.length === 0) return null;

  return (
    <FilterChips
      label="Filter by shop"
      className="mb-5"
      chips={[
        {
          key: "all",
          label: "Everywhere",
          href: "/pantry/list",
          active: active === null,
        },
        ...shops.map((shop) => {
          const on = active !== null && active.toLowerCase() === shop.name.toLowerCase();
          return {
            key: String(shop.id),
            label: shop.name,
            // Tapping the shop you are already in takes the filter off, which
            // is what a chip does everywhere else in the app now.
            href: on ? "/pantry/list" : `/pantry/list?shop=${encodeURIComponent(shop.name)}`,
            active: on,
          };
        }),
      ]}
    />
  );
}
