// Renders the raster icons from the cupboard mark. Committed output, run by
// hand - there's no point rasterising the same static shape on every build.
//
// Usage: node scripts/gen-icons.mjs

import sharp from "sharp";
import { writeFileSync } from "node:fs";

const INK = "#2a2520";
const CREAM = "#f7f3ec";

/**
 * The mark, inset, on a solid ground.
 *
 * Full-bleed was wrong. iOS masks a home screen icon to a rounded square, and
 * a cupboard drawn edge to edge had its top corners cut off and looked like a
 * screenshot of a bigger picture - which is exactly what Luna saw on her home
 * screen. The art now sits in the middle ~62% of the canvas, which survives
 * both the iOS mask and the tighter circle Android uses.
 *
 * Opaque, too: transparency in an apple-touch-icon is composited onto black.
 */
const INSET_VIEWBOX = "-22 -14.5 98 95";

const mark = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${pad}">
  <rect x="-40" y="-40" width="160" height="180" fill="${CREAM}"/>
  <g stroke="${INK}" stroke-width="5" fill="none">
    <path d="M6 18C6 11 15 7 27 7s21 4 21 11v34a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V18Z"/>
    <line x1="6" y1="32" x2="48" y2="32"/>
    <line x1="6" y1="45" x2="48" y2="45"/>
    <path d="M13 55v4M41 55v4" stroke-width="4.5" stroke-linecap="round"/>
  </g>
  <rect x="30" y="20" width="11" height="10.5" rx="2" fill="${INK}"/>
  <rect x="33" y="16" width="5" height="4" rx="1" fill="${INK}"/>
  <rect x="14" y="35.5" width="8" height="8" rx="1.8" fill="${INK}"/>
</svg>`;

/**
 * Three sizes, two paddings.
 *
 * The manifest icons are the same drawing; the maskable one is padded further
 * because Android crops to a circle inscribed in the middle 80%, and anything
 * outside that is a suggestion rather than a promise.
 */
const OUTPUTS = [
  { file: "../app/apple-icon.png", size: 180, pad: INSET_VIEWBOX },
  { file: "../public/icon-192.png", size: 192, pad: INSET_VIEWBOX },
  { file: "../public/icon-512.png", size: 512, pad: INSET_VIEWBOX },
  { file: "../public/icon-maskable-512.png", size: 512, pad: "-34 -38 122 138" },
];

let png;
for (const { file, size, pad } of OUTPUTS) {
  png = await sharp(Buffer.from(mark(size, pad))).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(new URL(file, import.meta.url), png);
  console.log(`${file.replace("../", "")}: ${size}x${size}, ${png.length} bytes`);
}

const { channels } = await sharp(png).metadata();
console.log(`channels: ${channels} (3 means opaque, which is what iOS wants)`);
