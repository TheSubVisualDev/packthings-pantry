import type { ReceiptMeta } from "./receipt-meta";

/**
 * Reading a receipt photo with a vision model, through OpenRouter.
 *
 * The fallback, not the front door. Tesseract runs on the phone and costs
 * nothing, and on a flat, bright receipt it is good enough; on creased
 * thermal paper it is not, and a receipt that reads as nothing is a receipt
 * somebody types in by hand or gives up on. So when the browser's read comes
 * back thin, the screen offers this - and only when OPENROUTER_API_KEY is set,
 * because Luna asked for it to be possible, not for it to be on.
 *
 * The model is asked for what the till PRINTED, not for what it thinks the
 * things are. "INDIAN SELECTN" is what the next receipt will say too, and it is
 * the key receipt_aliases learns answers against - a model that helpfully
 * expanded it to "Indian selection box" would make every receipt look new.
 *
 * Gemini Flash by default: in the cheapest tier, fast, and strong at reading
 * text off photos, which is the whole job. At roughly a fifth of a penny a
 * receipt, a year of weekly shops costs less than the shop. OPENROUTER_MODEL
 * swaps it without a deploy.
 */

const DEFAULT_MODEL = "google/gemini-2.5-flash";

/** Over this the request is refused before it costs anything. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface VisionLine {
  raw: string;
  pence: number | null;
  count: number;
}

export interface VisionResult {
  ok: boolean;
  error?: string;
  meta?: ReceiptMeta;
  lines?: VisionLine[];
}

export function visionAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

const PROMPT = `You are reading a photo of a UK supermarket receipt.

Return JSON only, in exactly this shape:
{"shop": string|null, "date": "YYYY-MM-DD"|null, "card_last4": string|null, "total": number|null,
 "lines": [{"text": string, "price": number|null, "count": number}]}

Rules:
- "lines" are the things bought, in order. Copy "text" EXACTLY as printed, capitals and abbreviations included. Do not expand or correct it.
- "price" is the price printed for that line in pounds (1.20 means one pound twenty). null if unreadable.
- If a line is "2 @ 1.10" or "2 X SUGAR", count is 2 and price is the line's total. Otherwise count is 1.
- Leave out subtotals, totals, savings, multibuy and offer lines, refunds, payment lines, VAT and loyalty-points lines.
- "date" is the purchase date. UK receipts print the day first.
- "card_last4" is the last four digits of a masked card number, if printed.
- "total" is the amount paid, in pounds.
- Use null for anything you cannot read. Never guess.`;

function toPence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 10000) return null;
  return Math.round(value * 100);
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(y, m - 1, d, 12);
  return probe.getMonth() === m - 1 && probe.getDate() === d ? value : null;
}

/**
 * Sends one image and gets back the receipt's lines and its own facts.
 *
 * Everything the model returns is treated as untrusted input - it is checked
 * into the same shapes the OCR path produces, with anything malformed dropped
 * to null rather than believed, because a confidently wrong price is the
 * thing this whole feature exists to avoid.
 */
export async function readReceiptImage(bytes: Uint8Array, mime: string): Promise<VisionResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, error: "Reading with AI isn't set up here (OPENROUTER_API_KEY)." };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "That photo is too big to send." };

  const url = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Pantry",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the reader. Try again, or type it in." };
  }

  if (!response.ok) {
    return { ok: false, error: `The reader said no (${response.status}). Try again, or type it in.` };
  }

  let parsed: Record<string, unknown>;
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "";
    // Some models wrap JSON in a fence even when asked not to.
    parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { ok: false, error: "The reader's answer didn't make sense. Try again, or type it in." };
  }

  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const lines: VisionLine[] = [];
  for (const entry of rawLines.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const { text, price, count } = entry as Record<string, unknown>;
    if (typeof text !== "string" || text.trim().length < 2) continue;
    const n = typeof count === "number" && Number.isInteger(count) && count > 0 && count < 100 ? count : 1;
    lines.push({ raw: text.trim().slice(0, 120), pence: toPence(price), count: n });
  }

  if (lines.length === 0) {
    return { ok: false, error: "Nothing on that looked like shopping, even to the reader." };
  }

  const card = typeof parsed.card_last4 === "string" && /^\d{4}$/.test(parsed.card_last4) ? parsed.card_last4 : null;
  const shop = typeof parsed.shop === "string" && parsed.shop.trim() ? parsed.shop.trim().slice(0, 40) : null;

  return {
    ok: true,
    meta: {
      boughtOn: cleanDate(parsed.date),
      shop,
      cardLast4: card,
      totalPence: toPence(parsed.total),
    },
    lines,
  };
}
