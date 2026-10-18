"use client";

import { ShopChecklist } from "@/components/shop-checklist";
import { addShortfall, previewShortfall } from "@/app/list/actions";

/**
 * Shopping for one recipe, at the serving count on screen.
 *
 * A checklist rather than a one-press add since v2 stopped tracking stock:
 * see ShopChecklist for why everything starts ticked.
 */
export function AddShortfallButton({
  recipeId,
  servings,
}: {
  recipeId: number;
  servings: number;
}) {
  return (
    <ShopChecklist
      load={() => previewShortfall(recipeId, servings)}
      commit={(keys) => addShortfall(recipeId, servings, keys)}
      label="Add the ingredients to the shopping list"
      title={`Shopping for ${servings}`}
    />
  );
}
