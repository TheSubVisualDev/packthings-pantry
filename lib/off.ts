import type { Dimension } from "./types";
import { dimensionOf } from "./units";

/**
 * Open Food Facts lookup. Free, no key, and decent UK coverage.
 *
 * Called from the server rather than the browser: their guidance asks for a
 * User-Agent identifying the app, and it keeps the pantry's traffic off the
 * user's IP.
 */

const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = "PackthingsPantry/1.0 (personal pantry tracker)";

/** EAN-8/13 and UPC-A/E: digits only, in the lengths those formats produce. */
export function isBarcode(value: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(value.trim());
}

export interface PackSize {
  quantity: number;
  unit: string;
  dimension: Dimension;
}

export interface OffProduct {
  name: string | null;
  brand: string | null;
  category: string | null;
  pack: PackSize | null;
}

/**
 * Turns Open Food Facts' free-text quantity into something the pantry can
 * store. Their field is whatever the contributor typed - "500 g", "1L",
 * "6 x 40g" - so anything that isn't a plain number and a unit we know is
 * refused rather than guessed at.
 */
export function parsePackSize(raw: string | null | undefined): PackSize | null {
  if (!raw) return null;

  // Trailing estimated-sign, as printed on EU packaging: "400 g e", "1 l ℮".
  const cleaned = raw.trim().toLowerCase().replace(/\s*(e|℮)$/, "");

  const match = cleaned.match(/^([\d.,]+)\s*([a-z]+)$/);
  if (!match) return null;

  const quantity = Number(match[1].replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  // OFF writes litres as "l" or "cl"; only the units we convert are accepted.
  const unit = match[2];
  const dimension = dimensionOf(unit);
  if (!dimension) return null;

  return { quantity, unit, dimension };
}

/** Null when the barcode is unknown to them, or they're unreachable. */
export async function lookupOpenFoodFacts(
  barcode: string,
): Promise<OffProduct | null> {
  const url = `${ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,quantity,categories_tags`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // Their catalogue changes slowly and a barcode's product doesn't change
      // at all, so a day of caching saves them the traffic.
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const body = (await response.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      quantity?: string;
      categories_tags?: string[];
    };
  };

  if (body.status !== 1 || !body.product) return null;

  const product = body.product;

  // categories_tags run most general to most specific, so the last is the
  // closest to how a person would file it. They're also unreliable: entries
  // carrying an "en:" prefix are routinely French ("en:Pates a tartiner"), so
  // only genuinely English-looking slugs - lowercase ASCII and hyphens - are
  // trusted, and a Nutella scan files under Spreads rather than Pates.
  const tag =
    product.categories_tags?.filter((candidate) => /^en:[a-z0-9-]+$/.test(candidate)).at(-1) ??
    null;

  const category = tag
    ? tag.slice(3).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
    : null;

  return {
    name: product.product_name?.trim() || null,
    brand: product.brands?.split(",")[0]?.trim() || null,
    category,
    pack: parsePackSize(product.quantity),
  };
}
