import type { RestockSuggestion } from "@/lib/shopping";

/**
 * Which Running Low suggestions belong under a shop filter.
 *
 * Mirrors the rule getList already applies to the list itself - a suggestion
 * tagged to a shop only survives that shop's filter, and an unassigned one
 * survives every filter, the same "plus anything you can get anywhere" the
 * page's subtitle promises. getRestockSuggestions lives in lib/shopping.ts
 * and only carries each item's single preferred shop (not the item_shops
 * rows the list query checks), so this is the narrower version of that rule
 * applied here instead of there.
 */
export function suggestionsForShop(
  suggestions: RestockSuggestion[],
  filter: string | null,
): RestockSuggestion[] {
  if (!filter) return suggestions;
  return suggestions.filter(
    (suggestion) =>
      suggestion.shop === null ||
      suggestion.shop.toLowerCase() === filter.toLowerCase(),
  );
}
