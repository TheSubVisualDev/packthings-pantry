import type { Metadata, Viewport } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AddMenu } from "@/components/add-menu";

/**
 * Two families, deliberately.
 *
 * Manrope carries the whole interface: it's drawn for UI at small sizes, which
 * is the condition that matters when a step is being read off a phone propped
 * against the hob. Plex Mono is for the things that are strings rather than
 * words - barcodes, API keys - where a zero has to be unmistakably a zero.
 *
 * IBM Plex Sans used to be loaded here and referenced nowhere, so it was a
 * font download that bought nothing.
 */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Pantry",
  description: "Pantry stock and recipe browser",
  manifest: "/manifest.webmanifest",
  /**
   * The iOS half of being installed.
   *
   * `capable` is the old meta tag Safari still reads, and without it - or
   * without the manifest beside it - a home screen icon opens a browser with
   * its chrome showing the moment you follow a link.
   *
   * The status bar is "default": black text on our own background. The
   * translucent option puts the page under the clock, which needs every
   * screen to know about it, and this app has a header on all of them.
   */
  appleWebApp: {
    capable: true,
    title: "Pantry",
    statusBarStyle: "default",
  },
  // Next emits the modern `mobile-web-app-capable` for the line above and not
  // the Apple-prefixed one, which iOS before 16.4 is the only reader of. It
  // costs one tag to not care which iPhone this is opened on.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f3ec",
  // So env(safe-area-inset-*) reports real numbers. Without it they are all
  // zero, and the bottom nav sits under the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground font-[family-name:var(--font-manrope)]">
        {children}
        <AddMenu />
      </body>
    </html>
  );
}
