// Renders the raster icons from the cupboard mark. Committed output, run by
// hand - there's no point rasterising the same static shape on every build.
//
// Usage: node scripts/gen-icons.mjs

import sharp from "sharp";
import { writeFileSync } from "node:fs";

const INK = "#2a2520";
const CREAM = "#f7f3ec";

/**
 * Square and full-bleed on purpose: iOS applies its own rounded mask to a home
 * screen icon, so baking corners in would show a cream ring inside the mask.
 * Strokes are heavier than the source mark, which is drawn for display sizes.
 */
const appleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="-9 -11 72 84">
  <rect x="-9" y="-11" width="72" height="84" fill="${CREAM}"/>
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

const png = await sharp(Buffer.from(appleIcon)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(new URL("../app/apple-icon.png", import.meta.url), png);

const { width, height, channels } = await sharp(png).metadata();
console.log(`app/apple-icon.png: ${width}x${height}, ${channels} channels, ${png.length} bytes`);
