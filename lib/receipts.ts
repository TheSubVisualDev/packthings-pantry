/**
 * The rules about receipts, with no database in them.
 *
 * Kept apart from the queries (lib/receipt-db.ts) for the reason AGENTS.md
 * gives about the vessel classifier: anything a check needs to ask belongs in
 * a file plain node can load, and the split is exactly the kind of arithmetic
 * that has to be checked rather than trusted. Pennies have to add up.
 */

/** What Sam listed, in his order. Editable per kitchen in settings. */
export const DEFAULT_CATEGORIES = [
  "Proteins",
  "Starches",
  "Vegetables",
  "Fruit",
  "Sauces and components",
  "Dairy",
  "Drinks",
  "Alcohol",
  "Snacks",
  "Household",
];

export const MEAL_KINDS = ["batch", "riff", "single", "lunch"] as const;
export type MealKind = (typeof MEAL_KINDS)[number];

export const MEAL_KIND_LABEL: Record<MealKind, string> = {
  batch: "Batch cook",
  riff: "Riff",
  single: "Single cook",
  lunch: "Lunch",
};

export interface LineFacts {
  id: number;
  name: string;
  raw: string | null;
  pence: number | null;
  count: number;
  category_id: number | null;
  long_term: number;
  snack: number;
  used_whole: number;
  /** Who shares it. Empty means the household. */
  eaters: number[];
  meals: number[];
}

export interface ReceiptFacts {
  id: number;
  bought_on: string | null;
  shop_id: number | null;
  purchaser_id: number | null;
  card_last4: string | null;
  total_pence: number | null;
  status: string;
}

export interface ChecklistItem {
  key: "purchaser" | "prices" | "date" | "total" | "shop" | "categories" | "meals";
  /** What the screen says, already counted: "3 lines have no price". */
  label: string;
  /** Hard things block a fair split. Soft things only make the numbers better. */
  hard: boolean;
  /** The lines it is about, when it is about lines. */
  lines?: number[];
}

/**
 * How the wording on a till becomes a key to remember an answer by.
 *
 * Lowercase, letters and digits only, one space between words. Prices and
 * leading product codes are already gone by the time a name gets here
 * (parseReceipt took them), and the raw text is preferred over the cleaned
 * name because the raw text is what the NEXT receipt will print: the cleaned
 * name is whatever somebody renamed it to, and the till never will.
 */
export function aliasKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[-−]?\s*[£$€]?\s*\d{1,4}[.,]\d{2}\s*[a-z*]{0,2}\s*$/i, "")
    .replace(/^\d{4,}\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What is still unknown about a receipt, most important first.
 *
 * Ordered by Sam's rule: "I need to know how much something cost for it to be
 * valuable", and who paid is the first thing a split needs - so those are
 * hard, and the rest are soft. Who shared a line is not on the list at all:
 * the answer when nobody says is "everyone", which is right most of the time
 * and costs 60p when it is not. Asking it of every line would be the chore
 * that stopped anybody using stock tracking.
 */
export function checklist(receipt: ReceiptFacts, lines: LineFacts[]): ChecklistItem[] {
  const out: ChecklistItem[] = [];

  if (receipt.purchaser_id === null) {
    out.push({
      key: "purchaser",
      label: receipt.card_last4
        ? `Who paid? The card ended ${receipt.card_last4}`
        : "Who paid?",
      hard: true,
    });
  }

  const unpriced = lines.filter((line) => line.pence === null);
  if (unpriced.length > 0) {
    out.push({
      key: "prices",
      label: `${plural(unpriced.length, "line has", "lines have")} no price`,
      hard: true,
      lines: unpriced.map((line) => line.id),
    });
  }

  if (receipt.bought_on === null) {
    out.push({ key: "date", label: "When was it bought?", hard: true });
  }

  /**
   * The lines and the till disagree.
   *
   * Hard, because it almost always means a line the OCR never read - which is
   * money somebody paid that nobody will be asked to share. Within a penny per
   * line is let through: some tills round each weighed item.
   */
  const sum = sumPence(lines);
  if (receipt.total_pence !== null && unpriced.length === 0 && lines.length > 0) {
    const gap = receipt.total_pence - sum;
    if (Math.abs(gap) > lines.length) {
      out.push({
        key: "total",
        label: `The lines come to ${pounds(sum)}, the receipt says ${pounds(receipt.total_pence)}`,
        hard: true,
      });
    }
  }

  if (receipt.shop_id === null) {
    out.push({ key: "shop", label: "Which shop?", hard: false });
  }

  const uncategorised = lines.filter((line) => line.category_id === null);
  if (uncategorised.length > 0) {
    out.push({
      key: "categories",
      label: `${plural(uncategorised.length, "line has", "lines have")} no category`,
      hard: false,
      lines: uncategorised.map((line) => line.id),
    });
  }

  /**
   * Food with no meal against it.
   *
   * Only food that could go into one: long-term things (the rice) and snacks
   * are bought for no meal in particular, and household lines are not food.
   * Softest of all, last on the list, and never a reason a receipt looks
   * unfinished - "for something" is a fine answer and so is no answer.
   */
  const untagged = lines.filter(
    (line) => line.meals.length === 0 && !line.long_term && !line.snack,
  );
  if (untagged.length > 0 && untagged.length < lines.length) {
    out.push({
      key: "meals",
      label: `${plural(untagged.length, "line isn't", "lines aren't")} tagged with a meal`,
      hard: false,
      lines: untagged.map((line) => line.id),
    });
  }

  return out;
}

export type ReceiptState = "closed" | "needs" | "nearly" | "done";

/**
 * Which pile of the inbox a receipt is in.
 *
 * needs - something hard is missing, so it cannot be split yet.
 * nearly - only soft things left; it already counts.
 * done - nothing left to ask, waiting to be closed.
 */
export function receiptState(receipt: ReceiptFacts, items: ChecklistItem[]): ReceiptState {
  if (receipt.status === "closed") return "closed";
  if (items.some((item) => item.hard)) return "needs";
  // Meals alone never hold a receipt open.
  if (items.some((item) => item.key !== "meals")) return "nearly";
  return "done";
}

export function sumPence(lines: { pence: number | null }[]): number {
  return lines.reduce((total, line) => total + (line.pence ?? 0), 0);
}

export function pounds(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

/** "1.20", "£1.20", "1,20", "120p" into pence, or null. */
export function readPence(value: string): number | null {
  const text = value.trim().replace(/^£/, "");
  if (text === "") return null;
  const pence = text.match(/^(\d{1,4})\s*p$/i);
  if (pence) return Number(pence[1]);
  const money = text.match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/);
  if (!money) return null;
  return Number(money[1]) * 100 + Number((money[2] ?? "0").padEnd(2, "0"));
}

/**
 * One line's cost, divided between the people sharing it.
 *
 * Integer pennies, and they must add back up to the price: £1.00 between three
 * is 34p, 33p, 33p, never 33p three times with a penny lost. The spare pennies
 * go to the lowest user ids so the same receipt always splits the same way -
 * a balance that moved by a penny every time it was looked at would never be
 * believed again.
 */
export function shareOut(pence: number, people: number[]): Map<number, number> {
  const shares = new Map<number, number>();
  const sorted = [...new Set(people)].sort((a, b) => a - b);
  if (sorted.length === 0) return shares;
  const each = Math.floor(pence / sorted.length);
  let spare = pence - each * sorted.length;
  for (const person of sorted) {
    shares.set(person, each + (spare > 0 ? 1 : 0));
    if (spare > 0) spare -= 1;
  }
  return shares;
}

/**
 * Who a line is shared between.
 *
 * Named eaters, when anybody named them. Otherwise the household - unless it
 * is a snack, where nobody named means it was for somebody outside the
 * household ("Other" in Sam's list) and whoever bought it absorbs it.
 */
export function sharersOf(line: LineFacts, household: number[], purchaser: number): number[] {
  if (line.eaters.length > 0) return line.eaters;
  if (line.snack) return [purchaser];
  return household;
}

export interface Settlement {
  from_user: number;
  to_user: number;
  pence: number;
}

/**
 * Where everybody stands: positive is owed money, negative owes it.
 *
 * Only receipts that know who paid count, and only priced lines on them - an
 * unknown is on the checklist, and guessing it here would put a number in
 * somebody's balance that nobody can trace back. Closed and open receipts
 * both count: closing means "nothing more to say", not "do not count this".
 */
export function balances(
  receipts: { receipt: ReceiptFacts; lines: LineFacts[] }[],
  household: number[],
  settlements: Settlement[],
): Map<number, number> {
  const net = new Map<number, number>();
  const add = (person: number, pence: number) => net.set(person, (net.get(person) ?? 0) + pence);
  for (const person of household) net.set(person, 0);

  for (const { receipt, lines } of receipts) {
    const payer = receipt.purchaser_id;
    if (payer === null) continue;
    for (const line of lines) {
      if (line.pence === null) continue;
      for (const [person, share] of shareOut(line.pence, sharersOf(line, household, payer))) {
        add(person, -share);
        add(payer, share);
      }
    }
  }

  // Paying somebody back moves the payer up and the payee down.
  for (const payment of settlements) {
    add(payment.from_user, payment.pence);
    add(payment.to_user, -payment.pence);
  }

  return net;
}

/**
 * The fewest payments that settle everybody up.
 *
 * Greedy, biggest debtor to biggest creditor, which is not always the minimum
 * number of transfers but is never more than one fewer than the people
 * involved - in a household of four it is at most three payments, which is
 * the number anyone will actually make.
 */
export function settleUp(net: Map<number, number>): Settlement[] {
  const owed = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const owing = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out: Settlement[] = [];
  owed.sort((a, b) => b.v - a.v || a.id - b.id);
  owing.sort((a, b) => b.v - a.v || a.id - b.id);
  let i = 0;
  let j = 0;
  while (i < owing.length && j < owed.length) {
    const pence = Math.min(owing[i].v, owed[j].v);
    if (pence > 0) out.push({ from_user: owing[i].id, to_user: owed[j].id, pence });
    owing[i].v -= pence;
    owed[j].v -= pence;
    if (owing[i].v === 0) i += 1;
    if (owed[j].v === 0) j += 1;
  }
  return out;
}

// --- reading the history --------------------------------------------------

export interface BoughtLine {
  name: string;
  pence: number | null;
  count: number;
  amount: number | null;
  unit: string | null;
  bought_on: string;
  shop: string | null;
  category: string | null;
  snack: number;
  long_term: number;
  receipt_id: number;
}

/** Days from one 'YYYY-MM-DD' to another, whole days, either direction. */
export function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  // UTC on both sides so a clock change between the two cannot shave an hour
  // and floor a day away. These are calendar days, not instants.
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export type Period = "week" | "month" | "quarter";

/** The first day of the period a date falls in. Weeks start on Monday. */
export function periodStart(iso: string, period: Period): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (period === "month") return `${y}-${String(m).padStart(2, "0")}-01`;
  if (period === "quarter") {
    const first = Math.floor((m - 1) / 3) * 3 + 1;
    return `${y}-${String(first).padStart(2, "0")}-01`;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay is 0 on Sunday - the off-by-one everybody makes.
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

/**
 * Household spend, per period, newest first.
 *
 * Snacks are left out: they are one person's, and the question this answers is
 * what the household spends on food. They stay on the receipt and in the split.
 */
export function spendByPeriod(lines: BoughtLine[], period: Period): { start: string; pence: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.snack || line.pence === null) continue;
    const key = periodStart(line.bought_on, period);
    totals.set(key, (totals.get(key) ?? 0) + line.pence);
  }
  return [...totals]
    .map(([start, pence]) => ({ start, pence }))
    .sort((a, b) => (a.start < b.start ? 1 : -1));
}

export function spendByCategory(lines: BoughtLine[]): { category: string; pence: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.snack || line.pence === null) continue;
    const key = line.category ?? "Uncategorised";
    totals.set(key, (totals.get(key) ?? 0) + line.pence);
  }
  return [...totals]
    .map(([category, pence]) => ({ category, pence }))
    .sort((a, b) => b.pence - a.pence);
}

export interface RepeatBuy {
  name: string;
  /** Separate shops, not lines: two packs on one receipt is one buy. */
  times: number;
  pence: number;
  /** Cheapest seen per one, by shop - the "look for cheaper alternatives" bit. */
  shops: { shop: string; each: number; times: number }[];
  last: string;
  /** Typical days between buys, once there are three buys to say it from. */
  every: number | null;
}

/** The same name, however the till capitalised it. */
function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * What gets bought again and again, biggest spend first.
 *
 * Sam: "isolating the key costs and repeated buys". Twice is a repeat. The
 * gap between buys is the median rather than the mean, because one fortnight
 * away on holiday should not tell the shopping list you drink half the milk.
 */
export function repeatBuys(lines: BoughtLine[]): RepeatBuy[] {
  const groups = new Map<string, BoughtLine[]>();
  for (const line of lines) {
    const key = nameKey(line.name);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  const out: RepeatBuy[] = [];
  for (const group of groups.values()) {
    const receipts = new Set(group.map((line) => line.receipt_id));
    if (receipts.size < 2) continue;

    const days = [...new Set(group.map((line) => line.bought_on))].sort();
    const gaps = days.slice(1).map((day, i) => daysBetween(days[i], day)).filter((gap) => gap > 0);

    const byShop = new Map<string, { each: number; times: number }>();
    for (const line of group) {
      if (line.pence === null) continue;
      const shop = line.shop ?? "Unknown shop";
      const each = Math.round(line.pence / Math.max(1, line.count));
      const seen = byShop.get(shop);
      byShop.set(shop, {
        each: seen ? Math.min(seen.each, each) : each,
        times: (seen?.times ?? 0) + 1,
      });
    }

    out.push({
      // Most recent spelling, since that is the one people are using.
      name: [...group].sort((a, b) => (a.bought_on < b.bought_on ? 1 : -1))[0].name,
      times: receipts.size,
      pence: sumPence(group),
      shops: [...byShop]
        .map(([shop, value]) => ({ shop, ...value }))
        .sort((a, b) => a.each - b.each),
      last: days[days.length - 1],
      every: gaps.length >= 2 ? median(gaps) : null,
    });
  }

  return out.sort((a, b) => b.pence - a.pence);
}

export interface ProbablyDue {
  name: string;
  every: number;
  since: number;
}

/**
 * Things you have probably got through, judged only by how often you buy them.
 *
 * Sam's milk: "it's not 'you've run out of soy sauce', it's 'based on my
 * knowledge of your food purchasing habits it's likely you've gotten through
 * the soy sauce you had'". Due from nine-tenths of the usual gap. And it fades:
 * past three gaps without a buy, you have probably stopped buying it, and the
 * list stops suggesting it rather than nagging for ever.
 */
export function probablyDue(repeats: RepeatBuy[], today: string): ProbablyDue[] {
  const out: ProbablyDue[] = [];
  for (const repeat of repeats) {
    if (repeat.every === null || repeat.every < 2) continue;
    const since = daysBetween(repeat.last, today);
    if (since < repeat.every * 0.9) continue;
    if (since > repeat.every * 3) continue;
    out.push({ name: repeat.name, every: repeat.every, since });
  }
  // Most overdue, as a fraction of its own rhythm, first.
  return out.sort((a, b) => b.since / b.every - a.since / a.every);
}

export interface MoodboardEntry {
  name: string;
  /** How many shops it was bought for this meal on. */
  times: number;
  category: string | null;
  /** Long-term things are the cupboard; everything else is bought fresh. */
  cupboard: boolean;
}

/**
 * A pseudorecipe: what has gone into a meal, ranked by how often.
 *
 * "The more an item is bought, its given a priority in the ramen tag." Split
 * into what is bought fresh for it and what comes out of the cupboard, which
 * is Sam's question about Darcy's ramen - "what are the store cupboard things
 * she needs, and then buy meat and veg as she does".
 */
export function moodboard(lines: (BoughtLine & { receipt_id: number })[]): MoodboardEntry[] {
  const groups = new Map<string, { name: string; receipts: Set<number>; category: string | null; cupboard: boolean }>();
  for (const line of lines) {
    const key = nameKey(line.name);
    const seen = groups.get(key);
    if (seen) {
      seen.receipts.add(line.receipt_id);
      seen.cupboard = seen.cupboard || Boolean(line.long_term);
      seen.category = seen.category ?? line.category;
    } else {
      groups.set(key, {
        name: line.name,
        receipts: new Set([line.receipt_id]),
        category: line.category,
        cupboard: Boolean(line.long_term),
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      times: group.receipts.size,
      category: group.category,
      cupboard: group.cupboard,
    }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
}
