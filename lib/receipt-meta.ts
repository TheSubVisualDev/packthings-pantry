/**
 * What a receipt says about itself: when, where, whose card, how much.
 *
 * parseReceipt throws all of this away, correctly - none of it is shopping.
 * But each of these is an item on the checklist (lib/receipts.ts), and every
 * one the till printed and we read is a question nobody has to be asked. So
 * this reads the same text a second time looking only for those four things.
 *
 * Built against the common UK tills before anyone had scanned a real one into
 * v2, so it is generous about formats and strict about values: a date that is
 * not a real day, a total with no pence, or a card number longer than four
 * digits is returned as null rather than guessed. A blank is a question on
 * the checklist; a wrong answer is a wrong bill.
 */

export interface ReceiptMeta {
  /** 'YYYY-MM-DD', UK day-first when the till prints digits. */
  boughtOn: string | null;
  /** A shop name, when the receipt names a chain we recognise. */
  shop: string | null;
  /** The last four digits of the card, when printed. */
  cardLast4: string | null;
  /** The total paid, in pence. */
  totalPence: number | null;
}

/**
 * Chains, with the spellings OCR tends to produce.
 *
 * Matched against the first dozen lines only, where the header is. Further
 * down, "Tesco" is a brand on a tin and not the shop - TESCO BAKED BEANS on
 * an Asda receipt is a real thing, the own-brand that the other chains sell.
 */
const CHAINS: [string, RegExp][] = [
  ["Tesco", /\bt[e3]sc[o0]\b/i],
  ["Sainsbury's", /\bsainsbury'?s?\b/i],
  ["Asda", /\basda\b/i],
  ["Aldi", /\baldi\b/i],
  ["Lidl", /\blidl\b/i],
  ["Morrisons", /\bmorrisons?\b/i],
  ["Co-op", /\bco-?op\b/i],
  ["Waitrose", /\bwaitrose\b/i],
  ["M&S", /\b(m\s?&\s?s|marks\s*(&|and)\s*spencer)\b/i],
  ["Iceland", /\biceland\b/i],
  ["Farmfoods", /\bfarmfoods\b/i],
  ["Spar", /\bspar\b/i],
  ["Home Bargains", /\bhome\s*bargains\b/i],
  ["B&M", /\bb\s?&\s?m\b/i],
  ["Costco", /\bcostco\b/i],
  ["Ocado", /\bocado\b/i],
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A real calendar day, or null. 31/02 is a misread, not a date. */
function isoDay(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  // Noon, for the reason fromIso pins to it: midnight is the hour a clock
  // change can move into the day before.
  const probe = new Date(year, month - 1, day, 12);
  if (probe.getMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The first date on the receipt.
 *
 * Day first, always - this is a British kitchen, and 04/05/26 is the fourth of
 * May. ISO is tried first because it cannot be misread either way round.
 */
export function findDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const day = isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (day) return day;
  }

  for (const match of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
    const day = isoDay(Number(match[3]), Number(match[2]), Number(match[1]));
    if (day) return day;
  }

  const words = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]+(\d{2}|\d{4})\b/i,
  );
  if (words) {
    const day = isoDay(Number(words[3]), MONTHS[words[2].toLowerCase()], Number(words[1]));
    if (day) return day;
  }

  return null;
}

export function findShop(text: string): string | null {
  // A line with a price on it is shopping, whatever brand it names - a short
  // receipt reaches its first item well inside twelve lines.
  const header = text
    .split(/\r?\n/)
    .slice(0, 12)
    .filter((line) => !/\d[.,]\d{2}\s*[a-z*]{0,2}\s*$/i.test(line.trim()))
    .join("\n");
  for (const [name, pattern] of CHAINS) {
    if (pattern.test(header)) return name;
  }
  return null;
}

/**
 * The last four digits of the card.
 *
 * Tills mask the rest with stars, Xs or hashes, sometimes in groups:
 * "************1234", "XXXX XXXX XXXX 1234", "Card ending 1234". The mask is
 * what makes it a card number rather than a barcode or a phone number, so a
 * bare run of digits is never taken.
 */
export function findCard(text: string): string | null {
  const masked = text.match(/(?:[*xX#•]{2,}[\s-]*){1,4}(\d{4})\b/);
  if (masked) return masked[1];
  const ending = text.match(/\b(?:ending|ends|last\s*4)(?:\s*in)?[\s:]*(\d{4})\b/i);
  if (ending) return ending[1];
  return null;
}

/**
 * The total paid.
 *
 * The LAST line that says total, balance due or to pay, never subtotal: a
 * receipt often prints a subtotal, then the savings, then what you actually
 * paid, and the last of those is the one that left your account.
 */
export function findTotal(text: string): number | null {
  let found: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (/sub\s*-?\s*total/i.test(line)) continue;
    if (!/\b(total|balance due|amount due|to pay)\b/i.test(line)) continue;
    const price = line.match(/[£]?\s*(\d{1,4})[.,](\d{2})\s*$/);
    if (price) found = Number(price[1]) * 100 + Number(price[2]);
  }
  return found;
}

export function receiptMeta(text: string): ReceiptMeta {
  return {
    boughtOn: findDate(text),
    shop: findShop(text),
    cardLast4: findCard(text),
    totalPence: findTotal(text),
  };
}

/**
 * How much of a thing a line's name says it is: "Spaghetti 500g", "Milk 2
 * Pint", "Eggs X12".
 *
 * Sam's line model wants an amount - a number and a unit - and most of the
 * time the till already printed it inside the name. Only the unambiguous
 * forms; "Big Bag" is not an amount.
 */
export function amountFromName(name: string): { amount: number; unit: string } | null {
  const measure = name.match(/(\d+(?:[.,]\d+)?)\s?(kg|g|ml|cl|l|ltr|litre)\b/i);
  if (measure) {
    const amount = Number(measure[1].replace(",", "."));
    const unit = measure[2].toLowerCase();
    if (unit === "kg") return { amount: amount * 1000, unit: "g" };
    if (unit === "cl") return { amount: amount * 10, unit: "ml" };
    if (unit === "l" || unit === "ltr" || unit === "litre") return { amount: amount * 1000, unit: "ml" };
    return { amount, unit };
  }
  const pints = name.match(/(\d+)\s?pints?\b/i);
  if (pints) return { amount: Math.round(Number(pints[1]) * 568), unit: "ml" };
  const pack = name.match(/\b(?:x\s?(\d{1,2})|(\d{1,2})\s?(?:pk|pack))\b/i);
  if (pack) return { amount: Number(pack[1] ?? pack[2]), unit: "count" };
  return null;
}
