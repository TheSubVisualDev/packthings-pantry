/**
 * Turning the text off a supermarket receipt into things you bought.
 *
 * Deliberately conservative. OCR on thermal paper is bad - creased, faded,
 * 8-point condensed type - so the job here is not to understand a receipt but
 * to throw away everything that clearly isn't shopping and hand the rest to the
 * matcher, which already knows how to rank a scruffy product name against
 * stock. A line wrongly discarded costs one manual add; a line wrongly kept
 * puts rubbish in the pantry, so the bias is towards discarding.
 */

export interface ReceiptLine {
  /** The description, cleaned of price, codes and quantity markers. */
  name: string;
  /** Pence, when a price was found - useful for spotting a misread line. */
  price: number | null;
  /** How many of it, when the receipt says so ("2 @ £1.10"). */
  count: number;
  /** The original OCR text, kept so a person can see what it came from. */
  raw: string;
}

/**
 * Lines that are never shopping.
 *
 * Matched against the whole line, lowercased. Kept as fragments rather than
 * exact strings because OCR mangles the ends of words far more often than the
 * middles.
 */
const NOT_SHOPPING = [
  "total", "subtotal", "sub total", "balance", "change", "tender",
  "cash", "card", "credit", "debit", "contactless", "visa", "mastercard",
  "amex", "maestro", "chip", "pin", "auth", "approved", "merchant",
  "vat", "tax", "invoice", "receipt", "till", "cashier", "operator",
  "store", "branch", "tel", "www", "http", ".com", ".co.uk",
  "clubcard", "nectar", "loyalty", "points", "voucher", "coupon",
  "saving", "savings", "discount", "offer ends", "you saved",
  "thank you", "thanks for", "customer copy", "please retain",
  "items", "item count", "qty", "aid:", "terminal", "trans", "seq",
  "refund", "returns", "exchange", "open ", "closed", "opening hours",
];

/**
 * A price at the end of a line: "1.20", "£1.20", "1.20 A", "-1.20".
 *
 * Matched against an OCR-corrected copy of the tail, never against the name:
 * thermal receipts turn 0 into O and 1 into l constantly, and a price that
 * fails to parse means a real purchase gets thrown away.
 */
const TRAILING_PRICE = /[-\u2212]?\s*[£$€]?\s*(\d{1,4})[.,](\d{2})\s*[a-zA-Z*]{0,2}$/;

/** "2 @ £1.10", "2 x 1.10" - a count, with no description of its own. */
const BARE_MULTIPLE = /^(\d{1,2})\s*(?:@|x|\*)\s*[£$€]?\s*[\d.,]+/i;

/** Product codes and weight lines that are not the thing's name. */
const CODE_ONLY = /^[\d\s.,£$€*x@/:-]+$/;
const WEIGHT_LINE = /^\s*\d+[.,]?\d*\s*(kg|g|ml|l|lb|oz)\s*(@|x)/i;

/**
 * Digits OCR reads as letters, fixed only where a digit is expected.
 *
 * Applied to the last few characters before looking for a price, and nowhere
 * else: running it over a product name would turn "Olive" into "0live".
 */
function repairDigits(tail: string): string {
  return tail
    .replace(/[Oo]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

export function parseReceipt(text: string): ReceiptLine[] {
  const out: ReceiptLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 3) continue;

    const lowered = line.toLowerCase();
    if (NOT_SHOPPING.some((word) => lowered.includes(word))) continue;
    // A weight line belongs to the product above it, not to itself.
    if (WEIGHT_LINE.test(line)) continue;

    /**
     * A line that is only a multiple describes the line above it.
     *
     * Checked here, against the whole line, because splitPrice would take the
     * "1.10" off "2 @ £1.10" and leave "2 @ £" - which no longer looks like a
     * multiple to anything downstream, and the count would be lost.
     */
    const whole = line.match(BARE_MULTIPLE);
    if (whole) {
      const remainder = line.slice(whole[0].length);
      const describesSomething = (remainder.match(/[a-z]/gi) ?? []).length >= 3;
      if (!describesSomething) {
        const count = Number(whole[1]);
        if (count > 0 && count < 100 && out.length > 0) {
          out[out.length - 1].count = count;
        }
        continue;
      }
    }

    /**
     * A line with no price is not a purchase.
     *
     * This is what keeps the shop's name, its address, its phone number and the
     * half-legible strapline out of the pantry. Supermarkets print a price
     * against every item; the exceptions are continuation lines, handled here.
     */
    const split = splitPrice(line);
    if (!split) {
      // Anything else without a price is not shopping.
      continue;
    }

    let name = split.name;
    const price = split.price;

    /**
     * The same multiple, printed on one line with its total.
     *
     * Once the count and the price come off there is no description left, so it
     * cannot be a product - it is telling us about the one before it.
     */
    const inline = name.match(BARE_MULTIPLE);
    if (inline || name.length < 3) {
      if (inline && out.length > 0) {
        const count = Number(inline[1]);
        if (count > 0 && count < 100) out[out.length - 1].count = count;
      }
      continue;
    }

    // Trailing single letters are VAT markers; leading long digits are codes.
    name = name.replace(/\s+[a-z*]$/i, "").replace(/^\d{4,}\s+/, "").trim();

    if (name.length < 3) continue;
    if (CODE_ONLY.test(name)) continue;
    // Needs actual words, not punctuation and stray letters.
    if (!/[a-z]{3}/i.test(name)) continue;

    out.push({ name: tidyName(name), price, count: 1, raw: line });
  }

  return out;
}

/**
 * Splits a trailing price off a line, tolerating OCR damage in the number.
 *
 * The repair is applied to a copy used only for finding where the price starts.
 * The name is always cut from the original, so nothing mangled reaches it.
 */
function splitPrice(line: string): { name: string; price: number } | null {
  const window = Math.min(line.length, 12);
  const head = line.slice(0, line.length - window);
  const tail = line.slice(line.length - window);

  for (const candidate of [tail, repairDigits(tail)]) {
    const match = candidate.match(TRAILING_PRICE);
    if (!match || match.index === undefined) continue;
    const price = Number(match[1]) * 100 + Number(match[2]);
    if (!Number.isFinite(price)) continue;
    return { name: (head + tail.slice(0, match.index)).trim(), price };
  }
  return null;
}

/**
 * Receipts shout. "TESCO SPAGHETTI 500G" becomes "Tesco Spaghetti 500g", which
 * reads like a name rather than an alarm - and matches how the pantry writes
 * things, which is what the matcher compares against.
 */
function tidyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)\s?(g|kg|ml|l|cl)\b/gi, (_, n, unit) => `${n}${unit.toLowerCase()}`)
    .trim();
}
