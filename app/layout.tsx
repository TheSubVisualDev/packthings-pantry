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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f3ec",
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
