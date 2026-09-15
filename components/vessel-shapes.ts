import type { Vessel as Kind } from "@/lib/vessel";

/**
 * What every vessel in the app looks like.
 *
 * Shared because the two things that draw one were drawing different bottles.
 * The shelf has its silhouettes and the fill control had its own set in a
 * different box, so tapping a soy sauce on the shelf opened a page showing a
 * visibly different soy sauce - one app, two hands.
 *
 * Coordinates are a 60x76 box. Anything drawing at another size scales this
 * rather than redrawing it; a second set of shapes is a second idea of what a
 * bottle is, and that is what this file exists to prevent.
 *
 * These live in components rather than lib because they are the picture.
 * lib/vessel.ts decides WHICH shape a thing is, and that decision has to be
 * testable without a renderer.
 */

/** Drawn in a 60x76 box so every shape shares a baseline and a shelf line. */
export const PATHS: Record<Kind, string> = {
  bottle: "M24 4 h12 v13 l10 11 v32 a6 6 0 0 1 -6 6 h-20 a6 6 0 0 1 -6 -6 v-32 l10 -11 z",
  carton: "M12 24 l18 -14 l18 14 v36 a6 6 0 0 1 -6 6 h-24 a6 6 0 0 1 -6 -6 z",
  jar: "M14 20 h32 a6 6 0 0 1 6 6 v34 a6 6 0 0 1 -6 6 h-32 a6 6 0 0 1 -6 -6 v-34 a6 6 0 0 1 6 -6 z",
  bag: "M19 22 h22 c4 10 7 18 7 28 v10 a6 6 0 0 1 -6 6 h-24 a6 6 0 0 1 -6 -6 v-10 c0 -10 3 -18 7 -28 z",
  tub: "M13 26 h34 l-4 34 a6 6 0 0 1 -6 6 h-14 a6 6 0 0 1 -6 -6 z",
  spice: "M21 24 h18 v36 a5 5 0 0 1 -5 5 h-8 a5 5 0 0 1 -5 -5 z",
  tin: "M14 22 h32 v38 a6 6 0 0 1 -6 6 h-20 a6 6 0 0 1 -6 -6 z",
  block: "M11 28 h38 a4 4 0 0 1 4 4 v28 a6 6 0 0 1 -6 6 h-34 a6 6 0 0 1 -6 -6 v-28 a4 4 0 0 1 4 -4 z",
  tray: "M9 32 h42 l-4 28 a6 6 0 0 1 -6 6 h-22 a6 6 0 0 1 -6 -6 z",
  pips: "M14 20 h32 a6 6 0 0 1 6 6 v34 a6 6 0 0 1 -6 6 h-32 a6 6 0 0 1 -6 -6 v-34 a6 6 0 0 1 6 -6 z",
};

/** The lid or cap, drawn solid so the contents cannot climb into it. */
export const CAPS: Partial<Record<Kind, string>> = {
  bottle: "M23 2 h14 a2 2 0 0 1 2 2 v4 h-18 v-4 a2 2 0 0 1 2 -2 z",
  jar: "M12 14 h36 a3 3 0 0 1 3 3 v4 h-42 v-4 a3 3 0 0 1 3 -3 z",
  tub: "M11 22 h38 a2 2 0 0 1 2 2 v3 h-42 v-3 a2 2 0 0 1 2 -2 z",
  spice: "M20 18 h20 a2 2 0 0 1 2 2 v5 h-24 v-5 a2 2 0 0 1 2 -2 z",
};

/**
 * Where the contents start and stop inside each silhouette.
 *
 * So a fraction becomes a level in the right place rather than a fraction of
 * the whole box: half a bottle is halfway up the body, not halfway up the
 * neck, and getting that wrong makes every bottle look fuller than it is.
 */
export const SPAN: Record<Kind, [number, number]> = {
  bottle: [28, 66], carton: [24, 66], jar: [20, 66], bag: [24, 66],
  tub: [26, 66], spice: [24, 65], tin: [22, 66], block: [28, 66],
  tray: [32, 66], pips: [20, 66],
};

/**
 * A crimped seal, for the shapes that are closed by being pinched shut.
 *
 * Stroked rather than filled, and zigzagged, because the first two attempts at
 * a bag both failed the same way: anything solid across the top reads as a
 * LID, and a lid makes a bag of carrots look like a tin of them. This is the
 * serrated edge you tear off, which nothing with a lid has.
 */
export const CRIMPS: Partial<Record<Kind, string>> = {
  bag: "M19 22 l4 -5 l4 5 l4 -5 l4 5 l4 -5 l4 5",
};
