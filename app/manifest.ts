import type { MetadataRoute } from "next";

/**
 * What makes it an app rather than a bookmark.
 *
 * Without this file, adding the pantry to an iOS home screen produced
 * something that looked installed until you tapped a link: every navigation
 * was treated as leaving, so Safari's in-app browser slid over the top - URL
 * bar, share sheet, back button and all - on top of our own nav bar. A
 * manifest with a scope is what tells iOS that /tonight and /pantry/list are
 * still the same app.
 *
 * `start_url` is the stock list rather than "/", because that is the screen
 * this app is for and "/" only ever redirects to it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pantry",
    short_name: "Pantry",
    description: "What is on the shelves, what is going off, and what to cook.",
    start_url: "/pantry",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // The warm paper the whole app is drawn on, so the splash screen and the
    // bars around the web view are the same colour as the page rather than
    // white flashing to cream.
    background_color: "#f7f3ec",
    theme_color: "#f7f3ec",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Padded further: Android crops to a circle inscribed in the middle
        // 80%, and anything outside that is a suggestion rather than a promise.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
