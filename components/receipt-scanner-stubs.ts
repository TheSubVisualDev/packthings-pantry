/**
 * Stand-ins for the receipt scanner's old server actions.
 *
 * The scanner matched a photographed receipt against stock and put packs on
 * the shelves, through actions that lived under app/pantry. v2 removed stock
 * tracking and /pantry with it on 18 Oct 2026 (docs/ROADMAP-V2.md), and
 * receipts are being rebuilt as the record of what was bought rather than a
 * way of restocking. components/receipt-scanner.tsx is kept for its OCR flow,
 * which the rebuild reuses, and imports these so it still type-checks.
 *
 * A plain module, deliberately not "use server": every export from one of
 * those is a live endpoint (AGENTS.md), and a stub nobody should call has no
 * business being reachable from outside. Nothing mounts the scanner today; if
 * something does before the rebuild lands, each of these refuses in words.
 *
 * The types are the old ones, copied, so the scanner's code is unchanged.
 */

const REFUSAL = "Receipts are being rebuilt, so this cannot save anything yet.";

export interface ReceiptOption {
  id: number;
  name: string;
  score: number;
}

export interface ReceiptMatch {
  index: number;
  name: string;
  count: number;
  price: number | null;
  raw: string;
  options: ReceiptOption[];
  itemId: number | null;
  confident: boolean;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  matches?: ReceiptMatch[];
}

export interface ReceiptDecision {
  itemId: number;
  count: number;
  pence?: number | null;
  raw?: string | null;
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  stocked?: number;
  unpackaged?: string[];
  ticked?: number;
}

export interface AddItemState {
  error?: string;
  added?: string;
  addedId?: number;
}

export async function matchReceipt(text: string): Promise<ScanResult> {
  void text;
  return { ok: false, error: REFUSAL };
}

export async function applyReceipt(decisions: ReceiptDecision[]): Promise<ApplyResult> {
  void decisions;
  return { ok: false, error: REFUSAL };
}

export async function addItem(
  previous: AddItemState,
  formData: FormData,
): Promise<AddItemState> {
  void previous;
  void formData;
  return { error: REFUSAL };
}
