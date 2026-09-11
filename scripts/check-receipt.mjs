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

let problems = 0;
const expect = (label, got, want) => {
  const ok = got === want;
  if (!ok) problems += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (wanted ${want})`}`);
};

for (const [label, text] of [["Tesco", TESCO], ["OCR-mangled", MANGLED]]) {
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
  } else {
    expect("kept all three products", lines.length, 3);
    expect("read a price through OCR damage", lines.find((l) => /Sdy/i.test(l.name))?.price, 220);
    expect("dropped the balance", names.some((n) => /balance/i.test(n)), false);
    expect("stripped the barcode", names.includes("Nivea Creme"), true);
  }
}

console.log(problems === 0 ? "\nall good" : `\n${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
