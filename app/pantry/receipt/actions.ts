"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { PACK_SQL } from "@/lib/containers";
import { STRONG_MATCH, rankItems } from "@/lib/match";
import { parseReceipt } from "@/lib/receipt";
import { getItems } from "@/lib/queries";
import { requireKitchenRole } from "@/lib/session";

/** More text than any till produces; past this it is not a receipt. */
const MAX_TEXT = 100_000;

export interface ReceiptOption {
  id: number;
  name: string;
  score: number;
}

export interface ReceiptMatch {
  /** Where it sat on the receipt, so the review screen keeps the order. */
  index: number;
  name: string;
  count: number;
  price: number | null;
  raw: string;
  /** Stock this might be, best first. */
  options: ReceiptOption[];
  /** Preselected when one option is clearly right; null when it is a guess. */
  itemId: number | null;
  /** Whether it can go in without being looked at. */
  confident: boolean;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  matches?: ReceiptMatch[];
}

/**
 * Works out what a receipt's text says you bought, and what of it you stock.
 *
 * Takes text, not a photograph. Recognition happens in the browser now: the
 * Node build of tesseract spawns a worker from a file path, which does not
 * survive being bundled into a serverless function, so the worker never started
 * and the request simply hung. A phone is a better place for it regardless -
 * nothing large is uploaded, there is no function timeout to hit, and the
 * language data is downloaded once per device rather than once per cold start.
 *
 * Matching is rankItems, the same scorer the barcode scanner uses, on the same
 * thresholds: they were tuned against real supermarket product names, which is
 * exactly what a receipt line is.
 *
 * Nothing is written here. OCR on thermal paper is unreliable enough that
 * applying anything before a person has looked would put rubbish on the
 * shelves, so this returns a proposal and applyReceipt does the writing.
 */
export async function matchReceipt(text: string): Promise<ScanResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Nothing was readable on that." };
  }

  const lines = parseReceipt(text.slice(0, MAX_TEXT));
  if (lines.length === 0) {
    return {
      ok: false,
      error:
        "Nothing on that looked like shopping. A flatter, brighter photo of just the items usually does it.",
    };
  }

  const items = await getItems(access.kitchen.id);

  const matches: ReceiptMatch[] = lines.map((line, index) => {
    // No brand and no pack unit: a receipt line is already the whole string it
    // has to offer, and inventing a brand from it would only skew the score.
    const ranked = rankItems(line.name, null, null, items).slice(0, 4);
    const best = ranked[0];
    const confident = Boolean(best && best.score >= STRONG_MATCH);

    return {
      index,
      name: line.name,
      count: line.count,
      price: line.price,
      raw: line.raw,
      options: ranked.map(({ item, score }) => ({
        id: item.id,
        name: item.name,
        score,
      })),
      itemId: confident ? best.item.id : null,
      confident,
    };
  });

  return { ok: true, matches };
}

export interface ReceiptDecision {
  itemId: number;
  /** How many of it the receipt says you bought. */
  count: number;
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  /** Items that gained sealed packs. */
  stocked?: number;
  /** Items matched but with no pack size, so there was no amount to add. */
  unpackaged?: string[];
  /** Shopping list lines ticked off because you clearly bought them. */
  ticked?: number;
}

/**
 * Puts a confirmed receipt into stock.
 *
 * Only packaged items gain anything: a receipt says you bought a thing, not how
 * much of it, and for a bottle that is enough - one line is one bottle. For
 * something measured loosely there is no honest number to add, so those are
 * named back to the caller rather than guessed at.
 *
 * Ticking the shopping list is done by NAME rather than by item_id, matching
 * the rule the restock suggestions follow: a line typed by hand as "olive oil"
 * is the same errand as the linked one, and you have just bought it either way.
 */
export async function applyReceipt(
  decisions: ReceiptDecision[],
): Promise<ApplyResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const wanted = decisions.filter(
    (decision) =>
      Number.isInteger(decision.itemId) &&
      decision.itemId > 0 &&
      Number.isInteger(decision.count) &&
      decision.count > 0 &&
      decision.count < 100,
  );
  if (wanted.length === 0) return { ok: false, error: "Nothing to add." };

  const db = getDb();
  const ids = [...new Set(wanted.map((decision) => decision.itemId))];

  const known = await db.execute({
    sql: `SELECT id, name, pack_size FROM items
          WHERE kitchen_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
    args: [access.kitchen.id, ...ids],
  });
  const rows = known.rows as unknown as {
    id: number;
    name: string;
    pack_size: number | null;
  }[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  let stocked = 0;
  const unpackaged: string[] = [];

  for (const decision of wanted) {
    const item = byId.get(decision.itemId);
    // Not in this kitchen, so not this kitchen's business.
    if (!item) continue;

    if (item.pack_size === null) {
      unpackaged.push(item.name);
      continue;
    }

    await db.execute({
      sql: PACK_SQL,
      args: [decision.count, decision.itemId, access.kitchen.id],
    });
    stocked += 1;
  }

  const names = rows.map((row) => row.name.toLowerCase());
  let ticked = 0;
  if (names.length > 0) {
    const result = await db.execute({
      sql: `UPDATE shopping_list SET bought_at = CURRENT_TIMESTAMP
            WHERE kitchen_id = ? AND bought_at IS NULL
              AND LOWER(item_name) IN (${names.map(() => "?").join(", ")})`,
      args: [access.kitchen.id, ...names],
    });
    ticked = result.rowsAffected;
  }

  revalidatePath("/pantry");
  revalidatePath("/pantry/list");
  revalidatePath("/recipes");
  return { ok: true, stocked, unpackaged, ticked };
}
