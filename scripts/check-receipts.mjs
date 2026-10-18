// The receipt rules: what a till says about itself, the checklist, the split,
// and what the history says. Pennies have to add up, so this is checked
// rather than trusted.
//
//   npm run check:receipts

import { receiptMeta, amountFromName } from "../lib/receipt-meta.ts";
import {
  aliasKey,
  balances,
  checklist,
  daysBetween,
  moodboard,
  periodStart,
  probablyDue,
  readPence,
  receiptState,
  repeatBuys,
  settleUp,
  shareOut,
  spendByCategory,
  spendByPeriod,
} from "../lib/receipts.ts";

let problems = 0;
const expect = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) problems += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
};

console.log("\n--- what a till says about itself ---");

const TESCO = `
TESCO
Superstore
123 High Street
SPAGHETTI 500G          0.75
SUBTOTAL                7.71
CLUBCARD SAVINGS       -0.50
TOTAL                   7.21
VISA CONTACTLESS        7.21
************4821
18/10/26 14:32  2104 012 3456
`;
const tesco = receiptMeta(TESCO);
expect("shop from the header", tesco.shop, "Tesco");
expect("day first, two-digit year", tesco.boughtOn, "2026-10-18");
expect("card behind stars", tesco.cardLast4, "4821");
expect("the last total, not the subtotal", tesco.totalPence, 721);

const ASDA = `
ASDA STORES LTD
BALANCE DUE   12.40
CARD NUMBER: XXXX XXXX XXXX 0093
DATE 04/05/2026
`;
const asda = receiptMeta(ASDA);
expect("04/05 is the fourth of May", asda.boughtOn, "2026-05-04");
expect("grouped Xs", asda.cardLast4, "0093");
expect("balance due is a total", asda.totalPence, 1240);

const WORDY = `
Lucky Star Oriental Supermarket
TESCO BAKED BEANS   0.95
Card ending 7710
21 Sep 2026
Total £0.95
`;
const wordy = receiptMeta(WORDY);
expect("a brand on a tin is not the shop", wordy.shop, null);
expect("card ending", wordy.cardLast4, "7710");
expect("a date in words", wordy.boughtOn, "2026-09-21");

const ODD = `
SAINSBURY'S
31/02/26
Tel 0161 555 1234
4005808158058 NIVEA
`;
const odd = receiptMeta(ODD);
expect("31 February is a misread", odd.boughtOn, null);
expect("a phone number is not a card", odd.cardLast4, null);
expect("a barcode is not a card", odd.cardLast4, null);
expect("no total, no guess", odd.totalPence, null);
expect("apostrophe shop", odd.shop, "Sainsbury's");

expect("amount: grams", amountFromName("Spaghetti 500g"), { amount: 500, unit: "g" });
expect("amount: kilos to grams", amountFromName("Basmati Rice 10kg"), { amount: 10000, unit: "g" });
expect("amount: litres to ml", amountFromName("Whole Milk 2L"), { amount: 2000, unit: "ml" });
expect("amount: pints", amountFromName("Milk 4 Pints"), { amount: 2272, unit: "ml" });
expect("amount: a pack", amountFromName("Eggs X12"), { amount: 12, unit: "count" });
expect("amount: none", amountFromName("Indian Selection"), null);

console.log("\n--- learning the wording ---");
expect("price off, lowercase", aliasKey("INDIAN SELECTN      3.50"), "indian selectn");
expect("code off", aliasKey("4005808158058 NIVEA CREME"), "nivea creme");
expect("same key whatever the capitals", aliasKey("Dark Soy Sauce 150ml"), aliasKey("DARK SOY SAUCE 150ML"));

expect("read 1.20", readPence("1.20"), 120);
expect("read £3", readPence("£3"), 300);
expect("read 75p", readPence("75p"), 75);
expect("read 1.5", readPence("1.5"), 150);
expect("read nonsense", readPence("abc"), null);

console.log("\n--- the checklist ---");

const line = (over) => ({
  id: 1, name: "Thing", raw: null, pence: 100, count: 1, category_id: 1,
  long_term: 0, snack: 0, used_whole: 0, eaters: [], meals: [1], ...over,
});
const receipt = (over) => ({
  id: 1, bought_on: "2026-10-18", shop_id: 1, purchaser_id: 2, card_last4: null,
  total_pence: null, status: "open", ...over,
});

const bare = checklist(receipt({ purchaser_id: null, card_last4: "4821", bought_on: null }), [
  line({ id: 1, pence: null }),
  line({ id: 2, category_id: null }),
]);
expect("who paid comes first", bare[0].key, "purchaser");
expect("and mentions the card", bare[0].label.includes("4821"), true);
expect("then prices, then the date", bare.slice(1, 3).map((i) => i.key), ["prices", "date"]);
expect("unpriced lines named", bare[1].lines, [1]);
expect("a receipt missing hard things needs work", receiptState(receipt({}), bare), "needs");

const soft = checklist(receipt({}), [line({ category_id: null })]);
expect("only soft things left is nearly", receiptState(receipt({}), soft), "nearly");

const complete = checklist(receipt({}), [line({})]);
expect("nothing to ask", complete, []);
expect("done", receiptState(receipt({}), complete), "done");
expect("closed is closed", receiptState(receipt({ status: "closed" }), bare), "closed");

const missed = checklist(receipt({ total_pence: 1000 }), [line({ pence: 400 }), line({ id: 2, pence: 300 })]);
expect("lines short of the total is hard", missed.find((i) => i.key === "total")?.hard, true);
const rounded = checklist(receipt({ total_pence: 701 }), [line({ pence: 400 }), line({ id: 2, pence: 300 })]);
expect("a penny of rounding is let through", rounded.some((i) => i.key === "total"), false);

const meals = checklist(receipt({}), [line({ meals: [] }), line({ id: 2 }), line({ id: 3, meals: [], long_term: 1 })]);
expect("long-term lines are not asked for a meal", meals.find((i) => i.key === "meals")?.lines, [1]);
expect("meal tags alone never hold a receipt open", receiptState(receipt({}), meals), "done");

console.log("\n--- the split ---");

const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);
const three = shareOut(100, [5, 2, 3]);
expect("£1 between three adds up", sum(three), 100);
expect("spare penny to the lowest id", [...three], [[2, 34], [3, 33], [5, 33]]);
expect("nobody, nothing", shareOut(100, []).size, 0);
for (const pence of [1, 7, 99, 1001, 12345]) {
  for (const people of [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]) {
    if (sum(shareOut(pence, people)) !== pence) {
      problems += 1;
      console.log(`  FAIL ${pence}p between ${people.length} loses pennies`);
    }
  }
}
console.log("  ok   every price between one to four people adds back up");

// Household: Luna 2, Darcy 3, Moth 4, Sam 5.
const household = [2, 3, 4, 5];
const shop = {
  receipt: receipt({ purchaser_id: 2 }),
  lines: [
    line({ id: 1, pence: 400 }),                         // everyone: 1.00 each
    line({ id: 2, pence: 150, snack: 1, eaters: [4] }),  // Moth's energy drink
    line({ id: 3, pence: 300, eaters: [2, 3] }),         // Luna and Darcy's dinner
    line({ id: 4, pence: 200, snack: 1, eaters: [] }),   // for a friend: Luna absorbs
    line({ id: 5, pence: null }),                        // unreadable: not counted
  ],
};
const net = balances([shop], household, []);
expect("Luna paid 10.50, her share is 1.00 + 1.50 + 2.00", net.get(2), 1050 - 450);
expect("Darcy owes 1.00 + 1.50", net.get(3), -250);
expect("Moth owes 1.00 + her drink", net.get(4), -250);
expect("Sam owes 1.00", net.get(5), -100);
expect("balances sum to zero", sum(net), 0);

const unknown = balances([{ receipt: receipt({ purchaser_id: null }), lines: [line({ pence: 999 })] }], household, []);
expect("no purchaser, not counted", sum(new Map([...unknown].map(([k, v]) => [k, Math.abs(v)]))), 0);

const paid = balances([shop], household, [{ from_user: 3, to_user: 2, pence: 250 }]);
expect("Darcy paying back zeroes her", paid.get(3), 0);
expect("and takes it off Luna", paid.get(2), 350);

const plan = settleUp(net);
expect("three payments settle four people", plan.length, 3);
expect("every payment goes to Luna", plan.every((p) => p.to_user === 2), true);
expect("and they total what she is owed", plan.reduce((a, p) => a + p.pence, 0), 600);

console.log("\n--- the history ---");

expect("days across the clocks going back", daysBetween("2026-10-24", "2026-10-26"), 2);
expect("days backwards", daysBetween("2026-10-26", "2026-10-24"), -2);
expect("Sunday's week starts Monday before", periodStart("2026-10-18", "week"), "2026-10-12");
expect("Monday starts its own week", periodStart("2026-10-12", "week"), "2026-10-12");
expect("month", periodStart("2026-10-18", "month"), "2026-10-01");
expect("quarter", periodStart("2026-11-18", "quarter"), "2026-10-01");

const bought = (name, bought_on, pence, over = {}) => ({
  name, pence, count: 1, amount: null, unit: null, bought_on, shop: "Tesco",
  category: "Dairy", snack: 0, long_term: 0, receipt_id: Number(bought_on.replaceAll("-", "")), ...over,
});
const history = [
  bought("Milk", "2026-09-01", 145),
  bought("MILK", "2026-09-05", 145),
  bought("Milk", "2026-09-09", 155, { shop: "Aldi" }),
  bought("milk", "2026-09-13", 145),
  bought("Soy sauce", "2026-08-01", 220, { category: "Sauces and components" }),
  bought("Soy sauce", "2026-09-01", 210, { category: "Sauces and components" }),
  bought("Pringles", "2026-09-05", 200, { snack: 1, category: "Snacks" }),
  bought("Saffron", "2026-09-05", 600, { category: "Sauces and components" }),
];
const repeats = repeatBuys(history);
expect("bought twice or more", repeats.map((r) => r.name).sort(), ["Soy sauce", "milk"]);
const milk = repeats.find((r) => /milk/i.test(r.name));
expect("however the till capitalised it", milk.times, 4);
expect("every four days", milk.every, 4);
expect("cheapest shop first", milk.shops[0].shop, "Tesco");
expect("soy sauce has too few gaps for a rhythm", repeats.find((r) => r.name === "Soy sauce").every, null);

expect("milk is due after four days", probablyDue(repeats, "2026-09-17").map((d) => d.name), ["milk"]);
expect("not due the day after", probablyDue(repeats, "2026-09-14"), []);
expect("stops nagging after three gaps", probablyDue(repeats, "2026-09-30"), []);

const weeks = spendByPeriod(history, "month");
expect("snacks left out of household spend", weeks.find((w) => w.start === "2026-09-01").pence, 145 + 145 + 155 + 145 + 210 + 600);
expect("biggest category first", spendByCategory(history)[0].category, "Sauces and components");

const ramen = moodboard([
  bought("Pak choi", "2026-09-01", 100, { category: "Vegetables" }),
  bought("Pak choi", "2026-09-08", 100, { category: "Vegetables" }),
  bought("Noodles", "2026-09-08", 100, { category: "Starches" }),
  bought("Dashi", "2026-09-01", 300, { long_term: 1 }),
]);
expect("most bought for it first", ramen[0].name, "Pak choi");
expect("counted by shop", ramen[0].times, 2);
expect("long-term is the cupboard", ramen.find((m) => m.name === "Dashi").cupboard, true);

console.log(problems === 0 ? "\nAll good." : `\n${problems} problem(s).`);
process.exit(problems === 0 ? 0 : 1);
