// Runs parseReceipt over realistic receipt text, including the kinds of mess
// OCR actually produces on thermal paper. Not a test framework - the shipped
// rules against text that looks like the real thing.
//
//   npm run check:receipt

import { parseReceipt } from "../lib/receipt.ts";

const TESCO = `
TESCO
Superstore
123 High Street
Tel: 0345 026 9902

TESCO SPAGHETTI 500G          0.75
DARK SOY SAUCE 150ML          2.20
2 @ £1.10
BRITISH FREE RANGE EGGS       2.40 A
Tiger Bloomer 800g            1.15
0.482 kg @ £2.50/kg
LOOSE BANANAS                 1.21
CLUBCARD PRICE SAVING         0.50

3 items
SUBTOTAL                      7.71
TOTAL                         7.71
VISA CONTACTLESS              7.71
AID: A0000000031010
Thank you for shopping at Tesco
`;

const MANGLED = `
ASDA
DARK SDY SAUCE 15OML          2.2O
UNSALTED BUTTER 250G          1.89
4005808158058 NIVEA CREME     3.50
*** BALANCE DUE ***           4.09
`;

/**
 * The shapes a second and third real receipt turned out to have - M9.
 *
 * Everything here is a line the parser got wrong before this fixture existed:
 * a weight-priced item printed on one line, a quantity prefix that silently
 * lost its count, a refund, an offer that is not a saving, and prices written
 * the three other ways tills write them.
 */
const AWKWARD = `
SAINSBURY'S
LOOSE BANANAS 0.482kg @ £0.95/kg   0.46
2 X GOLDEN GRANULATED SUGAR 1KG    2.00
SPAGHETTI...........................0.75
MILK 2 PINT                          75p
REDUCED TO CLEAR                    -0.40
3 FOR 2 MULTIBUY
PENNE 500G                          £1.05
RETURN: BROKEN EGGS                 -2.40
TOTAL                                4.61
`;

/**
 * Foods whose names contain a word off the till.
 *
 * Every one of these was thrown off every receipt until the word list stopped
 * being matched as substrings: "pin" is inside SPINACH and PINEAPPLE, "chip"
 * inside CHIPOLATAS, "cash" inside CASHEW NUTS, "card" inside CARDAMOM. The
 * bug was invisible because a dropped line looks exactly like a line the OCR
 * never read.
 */
const INNOCENT = `
SPINACH 400G                  1.20
PINEAPPLE                     1.50
CHIPOLATAS 340G               2.30
CASHEW NUTS 200G              2.75
CARDAMOM PODS 40G             1.80
PINTO BEANS 400G              0.65
TOTAL                         10.20
`;

let problems = 0;
const expect = (label, got, want) => {
  const ok = got === want;
  if (!ok) problems += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (wanted ${want})`}`);
};

for (const [label, text] of [["Tesco", TESCO], ["OCR-mangled", MANGLED], ["Awkward", AWKWARD], ["Innocent", INNOCENT]]) {
  console.log(`\n--- ${label} ---`);
  const lines = parseReceipt(text);
  for (const line of lines) {
    const price = line.price === null ? "     -" : `£${(line.price / 100).toFixed(2)}`;
    console.log(`  ${String(line.count).padStart(2)} x ${line.name.padEnd(28)} ${price}`);
  }
  console.log("");
  const names = lines.map((l) => l.name);

  if (label === "Tesco") {
    expect("kept the shopping", lines.length, 5);
    expect("dropped the total", names.some((n) => /total/i.test(n)), false);
    expect("dropped the clubcard saving", names.some((n) => /clubcard/i.test(n)), false);
    expect("dropped the weight line", names.some((n) => /^0\.482/.test(n)), false);
    expect("dropped the phone number", names.some((n) => /tel/i.test(n)), false);
    expect("dropped the shop name and address", names.some((n) => /^Tesco$|High Street/.test(n)), false);
    expect("multiple applies to the line above", lines.find((l) => /Soy/i.test(l.name))?.count, 2);
    expect("stripped the VAT marker", names.includes("British Free Range Eggs"), true);
  } else if (label === "Awkward") {
    const named = (fragment) => lines.find((l) => new RegExp(fragment, "i").test(l.name));

    expect("weight pricing leaves the name alone", named("banana")?.name, "Loose Bananas");
    expect("and keeps the price actually paid", named("banana")?.price, 46);
    expect("a quantity prefix becomes a count", named("granulated")?.count, 2);
    expect("and is not left in the name", /^2 ?x/i.test(named("granulated")?.name ?? ""), false);
    expect("dot leaders are not part of the name", named("spaghetti")?.name, "Spaghetti");
    expect("pence-only prices read", named("milk")?.price, 75);
    expect("a pound sign before the price reads", named("penne")?.price, 105);
    expect("a refund is not shopping", names.some((n) => /broken eggs/i.test(n)), false);
    expect("a reduction is not shopping", names.some((n) => /reduced/i.test(n)), false);
    expect("an offer is not shopping", names.some((n) => /multibuy/i.test(n)), false);
    expect("nothing else got in", lines.length, 5);
  } else if (label === "Innocent") {
    expect("kept every food with a till word inside it", lines.length, 6);
    expect("spinach is not a card machine", names.includes("Spinach 400g"), true);
    expect("cashew nuts are not cash", names.includes("Cashew Nuts 200g"), true);
    expect("cardamom is not a card", names.includes("Cardamom Pods 40g"), true);
    expect("and the total still goes", names.some((n) => /total/i.test(n)), false);
  } else {
    expect("kept all three products", lines.length, 3);
    expect("read a price through OCR damage", lines.find((l) => /Sdy/i.test(l.name))?.price, 220);
    expect("dropped the balance", names.some((n) => /balance/i.test(n)), false);
    expect("stripped the barcode", names.includes("Nivea Creme"), true);
  }
}


// --- matching -------------------------------------------------------------
//
// Parsing is only half the job; the other half is whether a till's wording
// finds the pantry's. A fixed shelf rather than the real database, so the check
// means the same thing on any machine and needs no credentials.

import { rankItems, STRONG_MATCH } from "../lib/match.ts";

const SHELF = [
  "Dark soy sauce", "Light Soy Sauce", "Tiger Bloomer", "Free Range Eggs",
  "Unsalted butter", "Cane Icing Sugar", "Almond milk", "Cumin",
].map((name, id) => ({
  id: id + 1,
  name,
  quantity: 1,
  canonical_unit: "g",
  dimension: "mass",
}));

const TILL = [
  ["AMOY DARK SOY SAUCE 150ML", "Dark soy sauce"],
  ["TIGER BLOOMER 800G", "Tiger Bloomer"],
  ["BRITISH FREE RANGE EGGS X6", "Free Range Eggs"],
  ["ANCHOR UNSALTED BUTTER 250G", "Unsalted butter"],
  ["TESCO CANE ICING SUGAR 500G", "Cane Icing Sugar"],
  ["HEINZ BAKED BEANS 415G", null],
];

console.log("\n--- matching a till's wording to the shelf ---");
for (const [printed, want] of TILL) {
  const line = parseReceipt(`${printed}   1.00`)[0];
  const best = rankItems(line.name, null, null, SHELF)[0];
  const got = best && best.score >= STRONG_MATCH ? best.item.name : null;
  const ok = got === want;
  if (!ok) problems += 1;
  const shown = got ?? "(nothing, offers to add it)";
  console.log(`  ${ok ? "ok  " : "FAIL"} ${printed.padEnd(30)} -> ${shown}${ok ? "" : ` (wanted ${want ?? "no match"})`}`);
}

console.log(problems === 0 ? "\nall good" : `\n${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
