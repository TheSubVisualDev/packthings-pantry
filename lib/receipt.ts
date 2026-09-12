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
 * Split in two, and the split is the whole point. `PHRASES` are matched
 * anywhere in the line, because they are several words long and cannot appear
 * inside a food. `WORDS` are matched as whole words only, because as
 * substrings they eat the shopping: "pin" is inside SPINACH and PINEAPPLE,
 * "chip" is inside CHIPOLATAS, "cash" is inside CASHEW NUTS, and every one of
 * those was being thrown off every receipt scanned until somebody typed
 * spinach into a test.
 *
 * The bias is still towards discarding - a line wrongly kept puts rubbish in
 * the pantry - but discarding has to be aimed at the till's own words rather
 * than at anything that happens to contain them.
 */
const PHRASES = [
  "sub total", "offer ends", "you saved", "thank you", "thanks for",
  "customer copy", "please retain", "item count", "aid:", "opening hours",
  "www", "http", ".com", ".co.uk",
  // Offers and reductions print like products and are not ones: the saving is
  // already in the price of the line above, so keeping these would put "3 For
  // 2 Multibuy" on a shelf and count its money twice.
  "multibuy", "meal deal", "price promise", "was £", "3 for 2", "2 for 1",
  "reduced to clear", "yellow sticker", "half price", "price match",
];

const WORDS = [
  "total", "subtotal", "balance", "change", "tender",
  "cash", "card", "credit", "debit", "contactless", "visa", "mastercard",
  "amex", "maestro", "chip", "pin", "auth", "approved", "merchant",
  "vat", "tax", "invoice", "receipt", "till", "cashier", "operator",
  "store", "branch", "tel", "clubcard", "nectar", "loyalty", "points",
  "voucher", "coupon", "saving", "savings", "discount",
  "items", "qty", "terminal", "trans", "seq",
  "refund", "returns", "exchange", "open", "closed",
];

const TILL_WORDS = new Set(WORDS);

/**
 * Whether a line is the till talking rather than something you bought.
 *
 * The words are compared against the line's own words - split on anything that
 * is not a letter - rather than searched for inside it. A built regex would do
 * the same job and invites exactly the bug this replaces: the word list used
 * to be matched as substrings, and SPINACH, PINEAPPLE, CHIPOLATAS and CASHEW
 * NUTS all contain a till word and were all being silently thrown away.
 */
function isNotShopping(line: string): boolean {
  const lowered = line.toLowerCase();
  if (PHRASES.some((phrase) => lowered.includes(phrase))) return true;
  return lowered.split(/[^a-z]+/).some((word) => TILL_WORDS.has(word));
}

/**
 * A line whose price is negative: a refund, a reduction, a correction.
 *
 * Never shopping. Adding stock for one would be backwards, and since the
 * scanner now keeps prices, recording a minus as a purchase would put a
 * negative into the price history of something you never bought.
 */
const NEGATIVE = /[-−]\s*[£$€]?\s*\d/;

/** "0.482kg @ £0.95/kg" printed inside the name, on receipts that do that. */
const WEIGHT_CLAUSE = /\s*\d+[.,]?\d*\s*(kg|g|ml|l|lb|oz)\s*(@|x)\s*[£$€]?\s*[\d.,]+\s*(\/\s*(kg|g|ml|l|lb|oz))?/i;

/** "2 X SUGAR", "3 x Penne" - a count in front of a real description. */
const LEADING_COUNT = /^(\d{1,2})\s*[x*]\s+(?=[a-z])/i;

/** "75p", "£1.05" - the two ways a till writes a price that is not "1.05". */
const PENCE_ONLY = /(?:^|\s)(\d{1,3})\s*p$/i;

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

    if (isNotShopping(line)) continue;
    if (NEGATIVE.test(line)) continue;
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
    let counted = 1;

    const split = splitPrice(line);
    if (!split) {
      // Anything else without a price is not shopping.
      continue;
    }

    let name = split.name;
    let price: number | null = split.price;

    /**
     * A price nobody paid for a tin of beans.
     *
     * A misread decimal point turns £12.50 into £1250, and that number now
     * lands in a price history and a spend total rather than just looking odd
     * for a second. The line is kept - you did buy something - and the price
     * is dropped, because "we could not read it" is honest and "£1,250" is a
     * lie with a decimal point in it.
     */
    if (price !== null && price >= 10000) price = null;

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

    /**
     * A count printed in front of the name, which is most of them.
     *
     * "2 X GOLDEN GRANULATED SUGAR" used to fall through every multiple rule -
     * it is not a bare multiple, because it describes something - and arrive
     * as one bag called "2 X Golden Granulated Sugar". The count was simply
     * lost, and with it half the sugar.
     */
    const leading = name.match(LEADING_COUNT);
    if (leading) {
      const count = Number(leading[1]);
      name = name.slice(leading[0].length).trim();
      if (count > 0 && count < 100) counted = count;
    }

    // Weight pricing printed inline: the price at the end is what was paid,
    // and the clause in the middle is arithmetic nobody needs in a name.
    name = name.replace(WEIGHT_CLAUSE, " ").trim();

    // Dot leaders, which exist to carry the eye to the price and stop being
    // useful the moment the price is taken off.
    name = name.replace(/[.…]{2,}\s*$/, "").trim();

    if (name.length < 3) continue;
    if (CODE_ONLY.test(name)) continue;
    // Needs actual words, not punctuation and stray letters.
    if (!/[a-z]{3}/i.test(name)) continue;

    out.push({ name: tidyName(name), price, count: counted, raw: line });
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

  /**
   * "75p", which is how a till writes anything under a pound on some receipts.
   *
   * Tried after the decimal forms rather than alongside them, because "1.05"
   * ends in a digit and would never reach here, and because a bare "p" on the
   * end of a word - "2 PINT 75p" - must not be read as part of the name.
   */
  const pence = tail.match(PENCE_ONLY);
  if (pence && pence.index !== undefined) {
    const price = Number(pence[1]);
    if (Number.isFinite(price) && price > 0 && price < 100) {
      return { name: (head + tail.slice(0, pence.index)).trim(), price };
    }
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
