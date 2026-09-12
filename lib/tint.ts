/**
 * A stable colour for a recipe with no photo.
 *
 * Derived from the id so it never changes, and kept inside the warm half of
 * the wheel so a wall of these still looks like one app.
 *
 * A flat tint rather than the gradient-behind-a-mask this used to be. That
 * version rendered as a solid black block on iOS - a masked element whose only
 * content is a CSS gradient is exactly the combination Safari is worst at -
 * and a decoration that can fail closed to black is not worth the risk on the
 * one platform this app is mostly used on.
 *
 * Shared between the listing card and the recipe header so the same recipe is
 * the same colour in both places, which is most of what makes a placeholder
 * feel deliberate rather than random.
 */
export function recipeTint(id: number): string {
  const hue = 20 + ((id * 47) % 90);
  return `oklch(0.88 0.06 ${hue})`;
}
